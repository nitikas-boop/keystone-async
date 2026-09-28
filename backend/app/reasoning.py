"""Reasoning Engine & Answer Pipeline for Keystone (Member 2).

Pipeline:
User question + as_of date + session context
   â†“
Question interpretation & temporal boundary
   â†“
Retrieval through BaseRetrievalAdapter
   â†“
Relevant graph & source context
   â†“
Deterministic compliance evaluation on retrieved Decisions
   â†“
Short-term conversation memory (4-6 turns)
   â†“
Qwen3 8B local generation & explanation
   â†“
Grounded citation validation + single retry on ungrounded claims
   â†“
Construct API response (answer, citations, subgraph, highlights, compliance)
"""
import json
import logging
import re
import uuid
from datetime import date
from typing import Any, Dict, List, Optional, Tuple

import httpx

from . import compliance, config, db, llm
from .memory import conversation_memory
from .prompts import ANSWER_REFUSAL_SENTENCE, REASONING_SYSTEM_PROMPT
from .retrieval import BaseRetrievalAdapter, get_retrieval_adapter

log = logging.getLogger('keystone.reasoning')
LOW_CONFIDENCE = float(config.E('LOW_CONFIDENCE', '0.7'))

ANSWER_SCHEMA = {
    'type': 'object',
    'required': ['sentences'],
    'properties': {
        'sentences': {
            'type': 'array',
            'items': {
                'type': 'object',
                'required': ['text', 'source_ids'],
                'properties': {
                    'text': {'type': 'string'},
                    'source_ids': {'type': 'array', 'items': {'type': 'string'}}
                }
            }
        }
    }
}


DANGLING_CITE = re.compile(r',?\s+(?:as (?:per|documented in|stated in|recorded in|noted in|shown in)|according to)\s*\.?$',
                           re.IGNORECASE)


def validate_citations(sentences: List[Dict[str, Any]], sources: Dict[str, Any]) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Validate that every sentence cites only existing sources from the retrieved context."""
    good, bad = [], []
    for s in sentences:
        text = re.sub(r'\s*\[[^\]]+\]', '', s.get('text', '')).strip()
        # Removing an inline [ID] can leave its lead-in dangling ("..., as per."); drop the orphaned phrase.
        text = DANGLING_CITE.sub('.', text)
        ids = [i.strip('[] ') for i in s.get('source_ids', [])]
        resolved_ids = []
        all_valid = True
        for i in ids:
            # 7B models sometimes repeat a version tag ("CHECK:DEC-007:RET-2.1@v2@v2"); a known ID followed only by
            # an extra @-suffix is that ID. Anything else unknown stays invalid.
            known = [k for k in sources if i.startswith(k + '@')]
            if i not in sources and known:
                i = max(known, key=len)
            if i in sources:
                resolved_ids.append(i.split(':')[1:] if i.startswith('CHECK:') else [i])
            else:
                matching_versioned = [k for k in sources if k.startswith(f"{i}@")]
                if matching_versioned:
                    resolved_ids.append(matching_versioned)
                else:
                    all_valid = False
                    break

        if text and ids and all_valid:
            flattened = list(dict.fromkeys(sum(resolved_ids, [])))
            good.append({'text': text, 'source_ids': flattened})
        elif ANSWER_REFUSAL_SENTENCE.lower() in text.lower():
            good.append({'text': ANSWER_REFUSAL_SENTENCE, 'source_ids': []})
        else:
            bad.append(s)
    return good, bad


# ponytail: pronoun heuristic for "refers back to an earlier turn"; swap for a model-based check if it misfires.
# "that/this" only counts when it points at a record ("that decision", "why was that?"): "why did Joel make that face"
# is a new, unrelated question, and treating it as a follow-up re-answered the previous turn.
FOLLOW_UP = re.compile(
    r"\b(?:it|its|they|them|their|he|him|his|she|her|the same)\b"
    r"|\b(?:that|this|those|these)\b(?=\s*(?:[?.!,]|$)|\s+(?:decisions?|polic(?:y|ies)|clauses?|contracts?|projects?|"
    r"vendors?|changes?|rules?|approvals?|meetings?|choices?|moves?|deals?|ones?|was|is|were|are)\b)", re.IGNORECASE)


def is_follow_up(question: str) -> bool:
    return bool(FOLLOW_UP.search(question))


class ModelUnavailable(RuntimeError):
    """The local LLM could not be reached; surfaced to the API as 503."""


class ReasoningEngine:
    """Core reasoning engine decoupled from specific database/graph backend."""

    def __init__(self, adapter: Optional[BaseRetrievalAdapter] = None):
        self.adapter = adapter or get_retrieval_adapter()

    async def answer(self, question: str, as_of: date, actor: str = 'user:analyst',
                     session_id: Optional[str] = None, explain_compliance: bool = True) -> Dict[str, Any]:
        # 1. Retrieve point-in-time subgraph and sources
        # Follow-ups ("who approved that decision?") only make sense with the previous question, so in a session
        # retrieve with the recent questions first; fall back to the question alone if that finds nothing.
        # A standalone question gets no history at all: earlier turns in retrieval or the prompt only add noise
        # (the AWS answer lost its decision date after an Atlas question in the same session).
        history = conversation_memory.get_history(session_id) if session_id and is_follow_up(question) else []
        user_queries = [m.content for m in history if m.role == 'user']
        retrieval = None
        if user_queries:
            retrieval = await self.adapter.retrieve(f"{' '.join(user_queries[-2:])} {question}", as_of)
        if retrieval is None or retrieval.is_empty:
            retrieval = await self.adapter.retrieve(question, as_of)

        subgraph_nodes = [n.to_dict() for n in retrieval.nodes]
        subgraph_edges = [e.to_dict() for e in retrieval.edges]
        sources = {k: {'text': v.text, 'node': v.node} for k, v in retrieval.sources.items()}

        # 2. Deterministic compliance for retrieved decisions
        # Verdicts are spelled out in plain words and listed before the retrieved context, and every clause they
        # name carries its text: a 7B model otherwise re-derives the verdict from whichever clause text it sees.
        # Most relevant decision first; a decision already replaced as of the query date (its SUPERSEDES edge is in
        # the as-of retrieval) gets no "as of" verdict: judging it by today's rule is noise, not an answer.
        best = {}
        for r in retrieval.ranked_scores:
            for k in r['keys']:
                best[k] = max(best.get(k, 0), r['score'])
        superseded_by = {e.target: e.source for e in retrieval.edges if e.relation == 'SUPERSEDES'}
        decisions = sorted((n for n in retrieval.nodes if n.type == 'Decision'), key=lambda n: -best.get(n.id, 0))
        checks, check_sources = [], {}
        for n in decisions:
            res = await compliance.evaluate(n.id, as_of, LOW_CONFIDENCE, explain=explain_compliance)
            if res and res.get('result') != 'no_clause':
                checks.append(res)
                replaced = superseded_by.get(n.id)
                for when, cs in ((f"when it was decided on {res['decided_on']}", res['checks']),
                                 (f'as of {as_of}', [] if replaced else res['current'])):
                    for c in cs:
                        window = f"in force {c['valid_from']} to {c['valid_to'] or 'now'}"
                        if c['source_id'] not in sources and c['source_id'] not in check_sources:
                            text = await db.pool.fetchval('SELECT text FROM policy_clauses WHERE clause_id=$1 '
                                                          'AND version=$2', c['clause_id'], c['version'])
                            check_sources[c['source_id']] = {'node': None,
                                                             'text': f"Clause {c['source_id']} {window}: {text}"}
                        detail = (f"decision value {c['decision_value']}, limit {c['limit']}"
                                  if c['limit'] is not None else c['reason'])
                        line = (f"{when}: {c['result'].upper().replace('_', ' ')} under {c['source_id']} "
                                f"({window}); {detail}.")
                        key = f"CHECK:{n.id}:{c['source_id']}"
                        prev = check_sources.get(key)
                        check_sources[key] = {'node': None, 'text': f"{prev['text']} Also {line}" if prev else
                                              f"Deterministic compliance check of {n.id}, {line}"}
                if replaced:
                    for c in res['checks']:
                        check_sources[f"CHECK:{n.id}:{c['source_id']}"]['text'] += (
                            f" {n.id} was superseded by {replaced} before {as_of}, so it is historical only.")
        sources = {**check_sources, **sources}

        # 3. If no relevant sources found, refuse cleanly
        if retrieval.is_empty:
            return await self._format_response(
                question=question,
                as_of=as_of,
                actor=actor,
                sentences=[],
                sources=sources,
                subgraph_nodes=[],
                subgraph_edges=[],
                checks=checks,
                refused=True,
                ranked=retrieval.ranked_scores,
                threshold=retrieval.relevance_threshold,
                session_id=session_id
            )

        # 4. Assemble sources and conversational context for the model
        source_listing = '\n'.join(f'[{k}] {v["text"]}' for k, v in sources.items())
        history_context = conversation_memory.format_for_prompt(session_id) if history else ""
        context_block = f"{history_context}\n\n" if history_context else ""
        user_prompt = f"{context_block}Question (answer as of {as_of}): {question}\n\nSources:\n{source_listing}"

        # 5. Model execution with citation validation and single retry.
        # No canned or keyword fallback: if the model refuses, the answer is the refusal; if the local model is
        # unreachable, the request fails visibly (503) instead of returning text the graph did not produce.
        sentences = []
        for attempt in range(2):
            try:
                out = await llm.chat_json(REASONING_SYSTEM_PROMPT, user_prompt, ANSWER_SCHEMA, timeout=120)
            except (httpx.HTTPError, httpx.TimeoutException) as e:
                raise ModelUnavailable(f'local model unreachable: {type(e).__name__}: {e}') from e
            good, bad = validate_citations(out.get('sentences', []), sources)
            sentences = good
            if not bad:
                break
            log.info("Citation validation retry attempt %d: ungrounded claims detected: %s",
                     attempt + 1, [b.get('text', '') for b in bad])
            invalid = sorted({i for b in bad for i in b.get('source_ids', []) if i not in sources})
            user_prompt += ('\n\nYour previous answer had sentences without valid source IDs: '
                           + json.dumps([b.get('text', '') for b in bad]) + f'. Invalid IDs: {json.dumps(invalid)}. '
                           'Copy IDs exactly as listed in the sources. Cite a listed ID on every sentence or drop it.')

        refused = not sentences or any(ANSWER_REFUSAL_SENTENCE.lower() in s.get('text', '').lower() for s in sentences)

        return await self._format_response(
            question=question,
            as_of=as_of,
            actor=actor,
            sentences=[] if refused else sentences,
            sources=sources,
            subgraph_nodes=subgraph_nodes,
            subgraph_edges=subgraph_edges,
            checks=checks,
            refused=refused,
            ranked=retrieval.ranked_scores,
            threshold=retrieval.relevance_threshold,
            session_id=session_id
        )

    async def _format_response(self, question: str, as_of: date, actor: str,
                               sentences: List[Dict[str, Any]], sources: Dict[str, Any],
                               subgraph_nodes: List[Dict[str, Any]], subgraph_edges: List[Dict[str, Any]],
                               checks: List[Dict[str, Any]], refused: bool, ranked: List[Dict[str, Any]],
                               threshold: float, session_id: Optional[str] = None) -> Dict[str, Any]:
        cited_ids = list(dict.fromkeys(i for s in sentences for i in s['source_ids']))
        citations = []
        for i in cited_ids:
            s_obj = sources.get(i, {})
            node = s_obj.get('node') or {}
            prov = node.get('provenance') or {}
            citations.append({
                'id': i,
                'type': node.get('type', 'Clause' if '@' in i else 'Entity'),
                'label': i,
                'title': node.get('label', i),
                'date': node.get('valid_from'),
                'source_doc': prov.get('source_doc'),
                'quote': (prov.get('source_span') or {}).get('quote'),
                'span': prov.get('source_span')
            })

        if refused:
            answer = ANSWER_REFUSAL_SENTENCE
        else:
            answer = ' '.join(f"{s['text']} " + ''.join(f'[{i}]' for i in s['source_ids']) for s in sentences)

        # Collect warnings for unverified low-confidence facts
        facts = [(n['id'], 'node', n['label'], n.get('provenance', {})) for n in subgraph_nodes if n['id'] in cited_ids] + \
                [(e['id'], 'edge', e['fact'], e.get('provenance', {})) for e in subgraph_edges
                 if e['source'] in cited_ids or e['target'] in cited_ids]
        warnings = [
            {'fact_id': fid, 'kind': kind, 'text': text, 'confidence': p.get('confidence'),
             'reason': 'unverified_low_confidence'}
            for fid, kind, text, p in facts if not p.get('human_verified', False) and (p.get('confidence') or 0) < LOW_CONFIDENCE
        ]
        warnings += [w for c in checks if c['decision_id'] in cited_ids for w in c.get('warnings', [])]

        aid = str(uuid.uuid4())
        resp = {
            'answer_id': aid,
            'as_of': as_of.isoformat(),
            'question': question,
            'refused': refused,
            'answer': answer,
            'sentences': sentences,
            'citations': citations,
            'compliance': [c for c in checks if c['decision_id'] in cited_ids],
            'subgraph': {
                'nodes': [] if refused else subgraph_nodes,
                'edges': [] if refused else subgraph_edges
            },
            'highlight_nodes': cited_ids,
            'warnings': warnings,
            'retrieval': {
                'threshold': threshold,
                'top': ranked
            }
        }

        # Update short term conversation memory
        if session_id:
            conversation_memory.add_turn(session_id, 'user', question, as_of=as_of.isoformat())
            conversation_memory.add_turn(session_id, 'assistant', answer, as_of=as_of.isoformat(), citations=cited_ids)

        # Every answer is stored and audited; if that fails the request fails (an unaudited answer is not allowed).
        async with db.pool.acquire() as c, c.transaction():
            db_aid = await c.fetchval('INSERT INTO answers (question, as_of, response) VALUES ($1,$2,$3) RETURNING id',
                                      question, as_of, resp)
            resp['answer_id'] = str(db_aid)
            await db.audit(actor, 'query', 'answer', str(db_aid), cited_ids,
                           {'question': question, 'as_of': str(as_of), 'answer': answer}, conn=c)

        return resp

