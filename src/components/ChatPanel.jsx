import React, { useState, useRef, useEffect } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Copy,
  CornerDownLeft,
  Download,
  Link2,
  Loader2,
  Mic,
  Printer,
  RotateCcw,
  SearchX,
  ShieldCheck,
  Sparkles,
  Square,
  WifiOff
} from 'lucide-react';
import { DEMO_QUERIES } from '../data/demoQueries';
import { ask, transcribe } from '../api';
import { startRecording } from '../utils/recorder';
import { day, plural, polish, ts } from '../utils/format';
import IdChip from './IdChip';
import { ThenNow } from './Compliance';
import { answerLink, auditRowFor, evidenceHtml, evidenceMarkdown } from '../utils/evidence';
import { displayName } from '../utils/people';
import { useApp } from '../context';

const now = () => ts(new Date().toISOString()).time;
const REFUSAL = 'I have no recorded decision about that';

// The console: questions go to POST /ask (as of the timeline date) and every answer is rendered from the response
// itself: cited sentences, the as-of date used, and "how I got this" (retrieved nodes, clause versions, the
// deterministic compliance result then vs now). A refusal, whether there is no evidence or the evidence is
// restricted for this viewer, is the same exact sentence and looks identical.
// The conversation is kept per user in this browser (localStorage), so a refresh or sign-out does not lose it.
const newSession = () => 'sess-' + Math.random().toString(36).substring(2, 10);
function loadHistory(key) {
  try { return JSON.parse(localStorage.getItem(key)) || null; } catch { return null; }
}

export default function ChatPanel({ asOfDate, health, viewer, onCitationClick, onQueryExecuted, onNodeHighlight, onAnswer, onReset, headerAction,
  storageKey = null, auditLogs = [], opened = null }) {
  const [messages, setMessages] = useState(() => (storageKey && loadHistory(storageKey)?.messages) || []);
  const [sessionId, setSessionId] = useState(() => (storageKey && loadHistory(storageKey)?.sessionId) || newSession());
  const [inputValue, setInputValue] = useState('');
  const [pending, setPending] = useState(null);  // {asOf, startedAt} while /ask runs
  const { team } = useApp();
  const [, tick] = useState(0);
  const feedRef = useRef(null);

  useEffect(() => {
    // Scroll only the feed; scrollIntoView would also scroll the page and panel ancestors.
    const el = feedRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages, pending]);

  useEffect(() => {  // errors are not kept: they describe a moment, not the record
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ sessionId, messages: messages.filter(m => !m.error).slice(-40) }));
    } catch { /* storage full or blocked: the conversation still works, it just is not kept */ }
  }, [messages, sessionId, storageKey]);

  useEffect(() => {  // elapsed seconds while an answer is being generated (real time, no invented stages)
    if (!pending) return undefined;
    const t = setInterval(() => tick(n => n + 1), 500);
    return () => clearInterval(t);
  }, [pending]);

  const push = (m) => setMessages(prev => [...prev, { id: `${m.role}-${Date.now()}-${prev.length}`, timestamp: now(), ...m }]);

  // An answer opened from a link (#answer=…): shown in the feed like any other, marked as opened.
  useEffect(() => {
    if (!opened) return;
    push({ role: 'user', content: opened.res.question || '(question not stored)', linked: true, answerId: opened.res.answer_id });
    push({ role: 'assistant', res: opened.res, linked: true });
  }, [opened]);

  const executeQuestion = async (queryText, demo = null) => {
    if (!queryText.trim() || pending) return;
    push({ role: 'user', content: queryText });
    setInputValue('');
    // Demo chips carry their own as-of date; typed questions use the timeline's date.
    const asOf = demo?.asOfDateSuggested || asOfDate;
    if (onQueryExecuted && demo?.asOfDateSuggested) onQueryExecuted(demo);
    const startedAt = Date.now();
    setPending({ asOf, startedAt });
    try {
      const res = await ask(queryText, asOf, sessionId);
      if (onNodeHighlight && res.highlight_nodes) onNodeHighlight(res.highlight_nodes);
      if (onAnswer) onAnswer(res, queryText);
      push({ role: 'assistant', res, seconds: (Date.now() - startedAt) / 1000 });
    } catch (err) {
      // Never substitute a canned answer: an answer that did not come from the graph must not look like one.
      push({ role: 'assistant', error: err });
    } finally {
      setPending(null);
    }
  };

  // Voice query: record, transcribe on the local backend, then run the same /ask pipeline as typed text.
  const [micState, setMicState] = useState('idle');  // idle | recording | transcribing
  const recorderRef = useRef(null);
  const toggleMic = async () => {
    if (micState === 'idle') {
      try {
        recorderRef.current = await startRecording();
        setMicState('recording');
      } catch (err) {
        push({ role: 'assistant', error: { title: 'Microphone unavailable', message: err.message } });
      }
      return;
    }
    if (micState !== 'recording') return;
    setMicState('transcribing');
    try {
      const { text } = await transcribe(await recorderRef.current.stop());
      setMicState('idle');
      executeQuestion(text);
    } catch (err) {
      setMicState('idle');
      push({ role: 'assistant', error: { ...err, title: 'Transcription failed (local Whisper)', message: err.message } });
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      executeQuestion(inputValue);
    }
  };

  const clearChat = () => {
    setSessionId(newSession());
    setMessages([]);
    if (onReset) onReset();
  };

  const modelDown = health === null || (health && !(health.ollama && Object.values(health.ollama).every(v => v === true)));

  return (
    <div className="flex flex-col h-full paper-sheet overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 bg-white border-b border-slate-100 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-heading font-semibold text-[13px] text-[#0F172A]">Ask the decision record</h2>
          <div className="text-[12.5px] text-[#475569] truncate">
            As of <span className="text-[#0F172A] font-semibold">{day(asOfDate)}</span>
            {viewer && <> · Viewing as <span className="text-[#0F172A] font-semibold">{viewer.name}</span> ({viewer.role})</>}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {headerAction}
          <button onClick={clearChat} className="icon-btn" title="Start a new conversation" aria-label="Start a new conversation">
            <RotateCcw size={13} />
          </button>
        </div>
      </div>

      {/* Demo questions: wrap instead of scrolling sideways */}
      <div className="px-3 py-2 bg-slate-50/70 border-b border-slate-100 flex flex-wrap items-center gap-1.5">
        <span className="text-[12px] text-[#475569] flex items-center gap-1">
          <Sparkles size={12} className="text-[#0284C7]" aria-hidden="true" /> Try:
        </span>
        {DEMO_QUERIES.map(q => (
          <button key={q.id} onClick={() => { setInputValue(q.query); executeQuestion(q.query, q); }} disabled={!!pending}
            title={`${q.query} (as of ${day(q.asOfDateSuggested)})`}
            className="px-2 py-0.5 text-[12px] rounded-md bg-white hover:bg-sky-50 text-[#334155] hover:text-[#0369A1] border border-slate-200 hover:border-sky-300 cursor-pointer disabled:opacity-50">
            {q.shortLabel}
          </button>
        ))}
      </div>

      {/* Feed */}
      <div ref={feedRef} className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 bg-[#F8FAFC]" aria-live="polite">
        {messages.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-[13px] text-[#334155] leading-relaxed">
            <h3 className="font-heading font-semibold text-[14px] text-[#0F172A] mb-1">Ask about Nimbus Ledger's decisions</h3>
            <p>Answers come from the organization's own decision graph, as of the date on the timeline. Every sentence cites
              the record it came from. With no recorded evidence the answer is exactly “{REFUSAL}”.</p>
            <p className="mt-1 text-[#475569]">Answers are generated by the local model on this machine (about 10 s each).</p>
          </div>
        )}

        {messages.map(msg => {
          // A linked answer was asked by someone else, earlier: name and time come from its audit block.
          const linkedRow = msg.linked ? auditRowFor(auditLogs, msg.answerId || msg.res?.answer_id) : null;
          const who = msg.role !== 'user' ? 'Keystone' : msg.linked ? (linkedRow ? displayName(linkedRow.actor, team) : 'Asked earlier') : (viewer?.name || 'You');
          const when = msg.linked ? (linkedRow ? ts(linkedRow.ts).ist : '') : msg.timestamp;
          return (
          <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div className="flex items-center gap-1.5 text-[11.5px] text-[#64748B] mb-1 px-1">
              <span>{who}</span>
              {when && <><span aria-hidden="true">·</span><span className="font-mono">{when}</span></>}
              {msg.res && <><span aria-hidden="true">·</span><span>as of {day(msg.res.as_of)}</span>
                {msg.seconds != null && <><span aria-hidden="true">·</span><span>{msg.seconds.toFixed(1)} s</span></>}
                {msg.linked && <><span aria-hidden="true">·</span><span>opened from a link</span></>}</>}
            </div>
            {msg.role === 'user' && (
              <div className="max-w-[92%] rounded-xl px-3.5 py-2.5 bg-sky-50 border border-sky-100 text-[13px] text-[#0F172A]">{msg.content}</div>
            )}
            {msg.res && (() => {
              const row = auditRowFor(auditLogs, msg.res.answer_id);
              const askedBy = msg.linked ? (row ? displayName(row.actor, team) : null) : viewer && `${viewer.name} (${viewer.role})`;
              return <Answer res={msg.res} onCitationClick={onCitationClick} actions={<AnswerActions res={msg.res} auditRow={row} askedBy={askedBy} />} />;
            })()}
            {msg.error && <ErrorCard err={msg.error} />}
          </div>
          );
        })}

        {pending && (
          <div className="flex flex-col items-start" data-testid="answer-loading">
            <div className="text-[11.5px] text-[#64748B] mb-1 px-1">Keystone Pipeline Running...</div>
            <div className="bg-white rounded-xl p-3 border border-sky-200 text-[13px] text-[#0F172A] flex items-center gap-2.5">
              <Loader2 size={16} className="animate-spin text-[#0284C7]" aria-hidden="true" />
              <span>Answering as of {day(pending.asOf)} with the local model · <span className="font-mono">{((Date.now() - pending.startedAt) / 1000).toFixed(0)} s</span></span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-3 bg-white border-t border-slate-100">
        {modelDown && (
          <p className="mb-2 text-[12.5px] px-2 py-1.5 rounded-md badge-note-rose flex items-center gap-1.5">
            <WifiOff size={13} aria-hidden="true" />
            {health === null ? 'The Keystone backend is not answering; questions will fail until it is running.'
              : 'The local model (Ollama) is unreachable; answers will fail until it is running.'}
          </p>
        )}
        <div className="relative flex items-center">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question…"
            aria-label="Question for Keystone"
            rows={Math.min(4, Math.max(1, Math.ceil(inputValue.length / 60)))}
            className="w-full bg-[#F8FAFC] border border-slate-300 rounded-lg pl-3 pr-28 py-2.5 text-[13px] leading-snug text-[#0F172A] placeholder-[#64748B] focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-300 resize-none overflow-hidden font-sans"
          />
          <div className="absolute right-2 flex items-center gap-1.5">
            <button
              onClick={toggleMic}
              disabled={!!pending || micState === 'transcribing'}
              title={micState === 'recording' ? 'Stop and transcribe (local Whisper)' : 'Ask by voice (transcribed locally)'}
              aria-label={micState === 'recording' ? 'Stop recording' : 'Ask by voice'}
              data-testid="mic-button"
              className={`p-1.5 rounded-md border cursor-pointer disabled:opacity-40 ${micState === 'recording' ? 'bg-rose-600 border-rose-600 text-white animate-pulse' : 'bg-white border-slate-300 text-slate-700 hover:border-sky-400'}`}
            >
              {micState === 'transcribing' ? <Loader2 size={13} className="animate-spin" /> : micState === 'recording' ? <Square size={13} /> : <Mic size={13} />}
            </button>
            <button
              onClick={() => executeQuestion(inputValue)}
              disabled={!inputValue.trim() || !!pending}
              className="px-3 py-1.5 rounded-md btn-sky-gradient text-white text-[13px] font-medium disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer"
            >
              <span>Send</span>
              <CornerDownLeft size={12} aria-hidden="true" />
            </button>
          </div>
        </div>
        <Sovereignty health={health} />
      </div>
    </div>
  );
}

// One answer sentence with its cited source IDs as clickable chips.
function Sentence({ s, onCitationClick }) {
  return (
    <p>
      {polish(s.text)}{' '}
      {(s.source_ids || []).map(id => (
        <IdChip key={id} id={id} className="ml-0.5 kst-citation" onClick={() => onCitationClick && onCitationClick(id)} />
      ))}
    </p>
  );
}

function Answer({ res, onCitationClick, actions }) {
  if (res.refused) {
    // One look for every refusal: no evidence and restricted evidence are indistinguishable by design.
    return (
      <div className="max-w-[92%] rounded-xl p-3.5 border-2 border-dashed border-slate-300 bg-white text-[13px]" data-refusal="true">
        <div className="flex items-center gap-2 font-semibold text-[#334155]"><SearchX size={16} aria-hidden="true" /> No recorded decision</div>
        <p className="mt-1 text-[#0F172A] text-[14px]">{polish(res.answer) || REFUSAL}</p>
        <p className="mt-1 text-[12px] text-[#64748B]">Keystone answers only from records it can cite, as of {day(res.as_of)}.</p>
        {actions}
      </div>
    );
  }
  const nodes = res.subgraph?.nodes || [];
  const checks = res.compliance || [];
  return (
    <div className="max-w-[92%] rounded-xl p-3.5 bg-white border border-slate-200 text-[13px] text-[#1E293B] leading-relaxed space-y-2">
      {(res.sentences || []).map((s, i) => <Sentence key={i} s={s} onCitationClick={onCitationClick} />)}
      {!(res.sentences || []).length && <p>{polish(res.answer)}</p>}
      {res.warnings?.length > 0 && (
        <p className="p-2 rounded-md badge-note-amber text-[12.5px] flex items-start gap-1.5">
          <AlertTriangle size={13} className="shrink-0 mt-0.5" aria-hidden="true" />
          Uses facts not yet reviewed by a person, with low model-reported confidence: {res.warnings.map(w => w.fact_id).join(', ')}
        </p>
      )}
      <div className="pt-2 border-t border-slate-100 text-[12px] text-[#475569] flex items-center gap-1">
        <ShieldCheck size={13} className="text-emerald-700" aria-hidden="true" />
        {plural((res.citations || []).length, 'source')} cited
      </div>
      <details className="group text-[12.5px]">
        <summary className="cursor-pointer text-[#0369A1] flex items-center gap-1 select-none">
          <ChevronDown size={13} className="group-open:rotate-180 transition-transform" aria-hidden="true" /> How I got this
        </summary>
        <div className="mt-2 space-y-2.5">
          <p>Evaluated as of {day(res.as_of)}: only facts valid on that date were retrieved.</p>
          <div>
            <div className="text-[#475569] mb-1">{plural(nodes.length, 'node')} retrieved from the graph</div>
            <div className="flex flex-wrap gap-1">{nodes.map(n => <IdChip key={n.id} id={n.id} withTitle type={n.type?.toLowerCase().replace('policyversion', 'policy_version').replace('meetingnote', 'meeting_note')} />)}</div>
          </div>
          {checks.length > 0 ? checks.map(c => (
            <div key={c.decision_id} className="rounded-lg border border-slate-200 p-2">
              <div className="mb-1 flex items-center gap-1.5 text-[#475569]">Deterministic compliance check for <IdChip id={c.decision_id} type="decision" /></div>
              <ThenNow c={c} compact />
            </div>
          )) : <p className="text-[#475569]">No compliance check applied to this question.</p>}
        </div>
      </details>
      {actions}
    </div>
  );
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

// Take an answer out of the app: copy it with its sources, save it as a Markdown evidence file, print it (the
// browser saves PDF), or copy a link that reopens it (GET /answers/{id}).
function AnswerActions({ res, auditRow, askedBy }) {
  const [done, setDone] = useState(null);
  const md = () => evidenceMarkdown(res, { askedBy, auditRow, link: res.answer_id ? answerLink(res.answer_id) : null });
  const flash = (what, ok = true) => { setDone(ok ? what : 'failed'); setTimeout(() => setDone(null), 2000); };
  const download = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([md()], { type: 'text/markdown' }));
    a.download = `keystone-evidence-${(res.answer_id || 'answer').slice(0, 8)}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    flash('download');
  };
  const print = () => {
    const w = window.open('', '_blank');
    if (!w) return flash('print', false);
    w.document.write(evidenceHtml(md()));
    w.document.close();
    w.focus();
    w.print();
  };
  const btn = 'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[12px] text-[#475569] hover:bg-slate-100 hover:text-[#0369A1] cursor-pointer';
  return (
    <div className="pt-1.5 flex flex-wrap items-center gap-1" aria-label="Answer actions">
      <button className={btn} onClick={async () => flash('copy', await copyText(md()))} title="Copy the answer with its sources, as Markdown">
        {done === 'copy' ? <Check size={12} /> : <Copy size={12} />} Copy with sources
      </button>
      <button className={btn} onClick={download} title="Save an evidence file: question, as-of date, cited passages, compliance and audit block">
        <Download size={12} /> Evidence (.md)
      </button>
      <button className={btn} onClick={print} title="Open a printable page; choose Save as PDF in the print dialog"><Printer size={12} /> Print / PDF</button>
      {res.answer_id && (
        <button className={btn} onClick={async () => flash('link', await copyText(answerLink(res.answer_id)))} title="Copy a link that reopens this answer">
          {done === 'link' ? <Check size={12} /> : <Link2 size={12} />} Copy link
        </button>
      )}
      {done === 'failed' && <span className="text-[12px] text-rose-700">The browser blocked it.</span>}
      {done && done !== 'failed' && <span className="text-[12px] text-emerald-700">{done === 'download' ? 'Saved' : 'Copied'}</span>}
    </div>
  );
}

function ErrorCard({ err }) {
  const status = err.status;
  const title = err.title || (status === 503 ? 'Local model unreachable (Ollama)' : status === 0 ? 'Backend unreachable' : `Keystone backend error${status ? ` (HTTP ${status})` : ''}`);
  const detail = typeof err.detail === 'string' ? err.detail : err.message;
  return (
    <div className="max-w-[92%] rounded-xl p-3.5 bg-rose-50 border border-rose-200 text-[13px] text-rose-950" role="alert">
      <div className="font-semibold flex items-center gap-1.5"><AlertTriangle size={14} aria-hidden="true" /> {title}</div>
      <p className="mt-1 font-mono text-[12px] break-all">{detail}</p>
      <p className="mt-1 text-[12px]">No answer was produced; nothing was guessed.</p>
    </div>
  );
}

// From GET /health (re-read every 15 s by the dashboard): model names, telemetry flag, and whether each local
// service answers. Nothing here is a fixed label.
function Sovereignty({ health }) {
  if (health === undefined) return <p className="mt-1.5 text-[11.5px] text-[#64748B]">Checking the local engine…</p>;
  if (health === null) return <p className="mt-1.5 text-[11.5px] text-rose-700">GET /health did not answer.</p>;
  const ok = (v) => (v === true ? '✓' : '✗');
  const ollamaOk = health.ollama && Object.values(health.ollama).every(v => v === true);
  return (
    <p className="mt-1.5 text-[11.5px] text-[#475569] flex flex-wrap gap-x-2" title={health.ollama_error || ''}>
      <span>Answers: <span className="font-mono">{health.models?.answer}</span></span>
      <span>Embeddings: <span className="font-mono">{health.models?.embed}</span></span>
      <span>Telemetry: {health.telemetry === false ? 'off' : String(health.telemetry)}</span>
      <span>Ollama {ok(ollamaOk)} · Postgres {ok(health.postgres)} · Neo4j {ok(health.neo4j)}</span>
      <span className="font-mono">{ts(health.checkedAt).time}</span>
    </p>
  );
}
