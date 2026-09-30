import React, { useState, useRef, useEffect } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  CornerDownLeft,
  Loader2,
  Mic,
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

const now = () => ts(new Date().toISOString()).time;
const REFUSAL = 'I have no recorded decision about that';

// The console: questions go to POST /ask (as of the timeline date) and every answer is rendered from the response
// itself: cited sentences, the as-of date used, and "how I got this" (retrieved nodes, clause versions, the
// deterministic compliance result then vs now). A refusal, whether there is no evidence or the evidence is
// restricted for this viewer, is the same exact sentence and looks identical.
export default function ChatPanel({ asOfDate, health, viewer, onCitationClick, onQueryExecuted, onNodeHighlight, onAnswer, onReset, headerAction }) {
  const [messages, setMessages] = useState([]);
  const [sessionId, setSessionId] = useState(() => 'sess-' + Math.random().toString(36).substring(2, 10));
  const [inputValue, setInputValue] = useState('');
  const [pending, setPending] = useState(null);  // {asOf, startedAt} while /ask runs
  const [, tick] = useState(0);
  const feedRef = useRef(null);

  useEffect(() => {
    // Scroll only the feed; scrollIntoView would also scroll the page and panel ancestors.
    const el = feedRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages, pending]);

  useEffect(() => {  // elapsed seconds while an answer is being generated (real time, no invented stages)
    if (!pending) return undefined;
    const t = setInterval(() => tick(n => n + 1), 500);
    return () => clearInterval(t);
  }, [pending]);

  const push = (m) => setMessages(prev => [...prev, { id: `${m.role}-${Date.now()}-${prev.length}`, timestamp: now(), ...m }]);

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
    setSessionId('sess-' + Math.random().toString(36).substring(2, 10));
    setMessages([]);
    if (onReset) onReset();
  };

  const modelDown = health === null || (health && !(health.ollama && Object.values(health.ollama).every(v => v === true)));

  return (
    <div className="flex flex-col h-full paper-sheet overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 bg-ks-surface border-b border-ks-line flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-heading font-semibold text-[13px] text-ks-text">Ask the decision record</h2>
          <div className="text-[12.5px] text-ks-muted truncate">
            As of <span className="text-ks-text font-semibold">{day(asOfDate)}</span>
            {viewer && <> · Viewing as <span className="text-ks-text font-semibold">{viewer.name}</span> ({viewer.role})</>}
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
      <div className="px-3 py-2 bg-ks-raised/70 border-b border-ks-line flex flex-wrap items-center gap-1.5">
        <span className="text-[12px] text-ks-muted flex items-center gap-1">
          <Sparkles size={12} className="text-ks-orange" aria-hidden="true" /> Try:
        </span>
        {DEMO_QUERIES.map(q => (
          <button key={q.id} onClick={() => { setInputValue(q.query); executeQuestion(q.query, q); }} disabled={!!pending}
            title={`${q.query} (as of ${day(q.asOfDateSuggested)})`}
            className="px-2 py-0.5 text-[12px] rounded-md bg-ks-surface hover:bg-ks-orange/10 text-ks-text-2 hover:text-ks-orange border border-ks-line hover:border-ks-orange/40 cursor-pointer disabled:opacity-50">
            {q.shortLabel}
          </button>
        ))}
      </div>

      {/* Feed */}
      <div ref={feedRef} className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 bg-ks-bg" aria-live="polite">
        {messages.length === 0 && (
          <div className="rounded-xl border border-ks-line bg-ks-surface p-4 text-[13px] text-ks-text-2 leading-relaxed">
            <h3 className="font-heading font-semibold text-[14px] text-ks-text mb-1">Ask about Nimbus Ledger's decisions</h3>
            <p>Answers come from the organization's own decision graph, as of the date on the timeline. Every sentence cites
              the record it came from. With no recorded evidence the answer is exactly “{REFUSAL}”.</p>
            <p className="mt-1 text-ks-muted">Answers are generated by the local model on this machine (about 10 s each).</p>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div className="flex items-center gap-1.5 text-[11.5px] text-ks-muted mb-1 px-1">
              <span>{msg.role === 'user' ? (viewer?.name || 'You') : 'Keystone'}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">{msg.timestamp}</span>
              {msg.res && <><span aria-hidden="true">·</span><span>as of {day(msg.res.as_of)}</span>
                <span aria-hidden="true">·</span><span>{msg.seconds.toFixed(1)} s</span></>}
            </div>
            {msg.role === 'user' && (
              <div className="max-w-[92%] rounded-xl px-3.5 py-2.5 bg-ks-orange/10 border border-ks-orange/15 text-[13px] text-ks-text">{msg.content}</div>
            )}
            {msg.res && <Answer res={msg.res} onCitationClick={onCitationClick} />}
            {msg.error && <ErrorCard err={msg.error} />}
          </div>
        ))}

        {pending && (
          <div className="flex flex-col items-start" data-testid="answer-loading">
            <div className="text-[11.5px] text-ks-muted mb-1 px-1">Keystone Pipeline Running...</div>
            <div className="bg-ks-surface rounded-xl p-3 border border-ks-orange/25 text-[13px] text-ks-text flex items-center gap-2.5">
              <Loader2 size={16} className="animate-spin text-ks-orange" aria-hidden="true" />
              <span>Answering as of {day(pending.asOf)} with the local model · <span className="font-mono">{((Date.now() - pending.startedAt) / 1000).toFixed(0)} s</span></span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-3 bg-ks-surface border-t border-ks-line">
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
            className="w-full bg-ks-bg border border-ks-line-strong rounded-lg pl-3 pr-28 py-2.5 text-[13px] leading-snug text-ks-text placeholder-ks-muted focus:outline-none focus:border-ks-orange focus:ring-1 focus:ring-ks-orange/45 resize-none overflow-hidden font-sans"
          />
          <div className="absolute right-2 flex items-center gap-1.5">
            <button
              onClick={toggleMic}
              disabled={!!pending || micState === 'transcribing'}
              title={micState === 'recording' ? 'Stop and transcribe (local Whisper)' : 'Ask by voice (transcribed locally)'}
              aria-label={micState === 'recording' ? 'Stop recording' : 'Ask by voice'}
              data-testid="mic-button"
              className={`p-1.5 rounded-md border cursor-pointer disabled:opacity-40 ${micState === 'recording' ? 'bg-ks-red border-ks-red text-ks-on-accent animate-pulse' : 'bg-ks-surface border-ks-line-strong text-ks-text-2 hover:border-ks-orange/60'}`}
            >
              {micState === 'transcribing' ? <Loader2 size={13} className="animate-spin" /> : micState === 'recording' ? <Square size={13} /> : <Mic size={13} />}
            </button>
            <button
              onClick={() => executeQuestion(inputValue)}
              disabled={!inputValue.trim() || !!pending}
              className="px-3 py-1.5 rounded-md btn-sky-gradient text-ks-on-accent text-[13px] font-medium disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer"
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

function Answer({ res, onCitationClick }) {
  if (res.refused) {
    // One look for every refusal: no evidence and restricted evidence are indistinguishable by design.
    return (
      <div className="max-w-[92%] rounded-xl p-3.5 border-2 border-dashed border-ks-line-strong bg-ks-surface text-[13px]" data-refusal="true">
        <div className="flex items-center gap-2 font-semibold text-ks-text-2"><SearchX size={16} aria-hidden="true" /> No recorded decision</div>
        <p className="mt-1 text-ks-text text-[14px]">{polish(res.answer) || REFUSAL}</p>
        <p className="mt-1 text-[12px] text-ks-muted">Keystone answers only from records it can cite, as of {day(res.as_of)}.</p>
      </div>
    );
  }
  const nodes = res.subgraph?.nodes || [];
  const checks = res.compliance || [];
  return (
    <div className="max-w-[92%] rounded-xl p-3.5 bg-ks-surface border border-ks-line text-[13px] text-ks-text leading-relaxed space-y-2">
      {(res.sentences || []).map((s, i) => <Sentence key={i} s={s} onCitationClick={onCitationClick} />)}
      {!(res.sentences || []).length && <p>{polish(res.answer)}</p>}
      {res.warnings?.length > 0 && (
        <p className="p-2 rounded-md badge-note-amber text-[12.5px] flex items-start gap-1.5">
          <AlertTriangle size={13} className="shrink-0 mt-0.5" aria-hidden="true" />
          Uses facts not yet reviewed by a person, with low model-reported confidence: {res.warnings.map(w => w.fact_id).join(', ')}
        </p>
      )}
      <div className="pt-2 border-t border-ks-line text-[12px] text-ks-muted flex items-center gap-1">
        <ShieldCheck size={13} className="text-ks-ok" aria-hidden="true" />
        {plural((res.citations || []).length, 'source')} cited
      </div>
      <details className="group text-[12.5px]">
        <summary className="cursor-pointer text-ks-orange flex items-center gap-1 select-none">
          <ChevronDown size={13} className="group-open:rotate-180 transition-transform" aria-hidden="true" /> How I got this
        </summary>
        <div className="mt-2 space-y-2.5">
          <p>Evaluated as of {day(res.as_of)}: only facts valid on that date were retrieved.</p>
          <div>
            <div className="text-ks-muted mb-1">{plural(nodes.length, 'node')} retrieved from the graph</div>
            <div className="flex flex-wrap gap-1">{nodes.map(n => <IdChip key={n.id} id={n.id} withTitle type={n.type?.toLowerCase().replace('policyversion', 'policy_version').replace('meetingnote', 'meeting_note')} />)}</div>
          </div>
          {checks.length > 0 ? checks.map(c => (
            <div key={c.decision_id} className="rounded-lg border border-ks-line p-2">
              <div className="mb-1 flex items-center gap-1.5 text-ks-muted">Deterministic compliance check for <IdChip id={c.decision_id} type="decision" /></div>
              <ThenNow c={c} compact />
            </div>
          )) : <p className="text-ks-muted">No compliance check applied to this question.</p>}
        </div>
      </details>
    </div>
  );
}

function ErrorCard({ err }) {
  const status = err.status;
  const title = err.title || (status === 503 ? 'Local model unreachable (Ollama)' : status === 0 ? 'Backend unreachable' : `Keystone backend error${status ? ` (HTTP ${status})` : ''}`);
  const detail = typeof err.detail === 'string' ? err.detail : err.message;
  return (
    <div className="max-w-[92%] rounded-xl p-3.5 bg-ks-red/10 border border-ks-red/35 text-[13px] text-ks-red-text" role="alert">
      <div className="font-semibold flex items-center gap-1.5"><AlertTriangle size={14} aria-hidden="true" /> {title}</div>
      <p className="mt-1 font-mono text-[12px] break-all">{detail}</p>
      <p className="mt-1 text-[12px]">No answer was produced; nothing was guessed.</p>
    </div>
  );
}

// From GET /health (re-read every 15 s by the dashboard): model names, telemetry flag, and whether each local
// service answers. Nothing here is a fixed label.
function Sovereignty({ health }) {
  if (health === undefined) return <p className="mt-1.5 text-[11.5px] text-ks-muted">Checking the local engine…</p>;
  if (health === null) return <p className="mt-1.5 text-[11.5px] text-ks-red-text">GET /health did not answer.</p>;
  const ok = (v) => (v === true ? '✓' : '✗');
  const ollamaOk = health.ollama && Object.values(health.ollama).every(v => v === true);
  return (
    <p className="mt-1.5 text-[11.5px] text-ks-muted flex flex-wrap gap-x-2" title={health.ollama_error || ''}>
      <span>Answers: <span className="font-mono">{health.models?.answer}</span></span>
      <span>Embeddings: <span className="font-mono">{health.models?.embed}</span></span>
      <span>Telemetry: {health.telemetry === false ? 'off' : String(health.telemetry)}</span>
      <span>Ollama {ok(ollamaOk)} · Postgres {ok(health.postgres)} · Neo4j {ok(health.neo4j)}</span>
      <span className="font-mono">{ts(health.checkedAt).time}</span>
    </p>
  );
}
