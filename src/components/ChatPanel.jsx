import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, 
  Sparkles, 
  Terminal, 
  ShieldCheck, 
  FileText, 
  Clock, 
  CheckCircle2, 
  ExternalLink,
  Cpu,
  CornerDownLeft,
  RotateCcw,
  Info
} from 'lucide-react';
import { DEMO_QUERIES } from '../data/mockData';
import { ask } from '../api';

// Turn a live /ask response into the message shape this panel renders.
function toMessage(res) {
  const parts = res.refused
    ? [`🛑 ${res.answer}`]
    : (res.sentences || []).map(s => `${s.text} ${(s.source_ids || []).map(id => `[${id}]`).join('')}`);
  for (const c of res.compliance || []) {
    parts.push(`Deterministic check [${c.decision_id}]: ${c.result} when decided (${c.decided_on}` +
      `${(c.checks || []).map(k => `, ${k.source_id}`).join('')}); ${c.current_result} as of ${c.as_of}` +
      `${(c.current || []).map(k => `, ${k.source_id}`).join('')}.`);
  }
  if (res.warnings?.length) {
    parts.push(`⚠️ Unverified low-confidence facts used: ${res.warnings.map(w => w.fact_id).join(', ')}`);
  }
  return {
    id: `asst-${Date.now()}`,
    role: "assistant",
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    content: parts.join('\n\n') || res.answer || "No response received.",
    citations: (res.citations || []).map(c => ({
      id: c.id,
      label: c.label || c.id,
      type: c.type,
      title: c.title || c.label || c.id,
      date: c.date,
      quote: c.quote,
      source_doc: c.source_doc
    }))
  };
}

export default function ChatPanel({ 
  asOfDate, 
  onCitationClick, 
  onQueryExecuted,
  onNodeHighlight,
  onSubgraph
}) {
  const [messages, setMessages] = useState([
    {
      id: "msg-welcome",
      role: "assistant",
      timestamp: "System Online",
      content: `### Sovereign Temporal Intelligence Ready\n\nI am **Keystone**, connected to the private knowledge graph for **Nimbus Ledger**. You can inquire about historical engineering decisions, architectural rationales, or point-in-time compliance against versioned policy clauses.\n\n*All responses are strictly grounded in bi-temporal graph edges with zero cloud data egress.*`,
      citations: []
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState('');
  const chatBottomRef = useRef(null);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isProcessing]);

  const handleSelectQuery = (demoQuery) => {
    setInputValue(demoQuery.query);
    executeQuestion(demoQuery.query, demoQuery);
  };

  const executeQuestion = async (queryText, matchedDemoQuery = null) => {
    if (!queryText.trim() || isProcessing) return;

    const userMsg = {
      id: `usr-${Date.now()}`,
      role: "user",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      content: queryText
    };

    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setIsProcessing(true);

    // Demo chips carry their own as-of date; typed questions use the slider's date.
    const asOf = matchedDemoQuery?.asOfDateSuggested || asOfDate;
    if (onQueryExecuted && matchedDemoQuery?.asOfDateSuggested) {
      onQueryExecuted(matchedDemoQuery);
    }
    setProcessingStep(`Traversing bi-temporal graph as of ${asOf} & running deterministic checks...`);

    try {
      const res = await ask(queryText, asOf);
      if (onNodeHighlight && res.highlight_nodes) onNodeHighlight(res.highlight_nodes);
      if (onSubgraph && res.subgraph) onSubgraph(res.subgraph);
      setMessages(prev => [...prev, toMessage(res)]);
    } catch (err) {
      // Never substitute a canned answer: an answer that did not come from the graph must not look like one.
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`,
        role: "assistant",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        content: `⚠️ Keystone backend error: ${err.message}`,
        citations: []
      }]);
    } finally {
      setIsProcessing(false);
      setProcessingStep('');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      executeQuestion(inputValue);
    }
  };

  const clearChat = () => {
    setMessages([
      {
        id: "msg-welcome-reset",
        role: "assistant",
        timestamp: "System Reset",
        content: "Chat history cleared. Active point-in-time reference is set to **" + asOfDate + "**. Choose a prompt chip or ask any question.",
        citations: []
      }
    ]);
  };

  const renderMessageContent = (content) => {
    return (
      <div className="space-y-2 text-xs leading-relaxed text-[#1E293B]">
        {content.split('\n\n').map((paragraph, pIdx) => {
          if (paragraph.startsWith('### ')) {
            return (
              <h3 key={pIdx} className="font-heading font-semibold text-sm text-[#0F172A] tracking-tight mt-1 mb-1">
                {paragraph.replace('### ', '')}
              </h3>
            );
          }
          if (paragraph.startsWith('1. ') || paragraph.startsWith('2. ') || paragraph.startsWith('3. ') || paragraph.startsWith('4. ')) {
            return (
              <div key={pIdx} className="pl-2.5 border-l-2 border-sky-300 py-0.5 text-[#334155]">
                {paragraph}
              </div>
            );
          }
          if (paragraph.startsWith('⚠️') || paragraph.startsWith('⚡')) {
            return (
              <div key={pIdx} className="p-2.5 rounded-lg badge-note-amber my-1.5 font-mono text-[11px] leading-normal">
                {paragraph}
              </div>
            );
          }
          if (paragraph.startsWith('🛑')) {
            return (
              <div key={pIdx} className="p-2.5 rounded-lg badge-note-sky my-1.5 font-mono text-[11px] leading-normal">
                {paragraph}
              </div>
            );
          }
          return (
            <p key={pIdx}>
              {paragraph}
            </p>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full paper-sheet overflow-hidden">
      {/* Chat Header */}
      <div className="px-4 py-3 bg-white border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
          <div>
            <div className="font-heading font-semibold text-xs tracking-tight text-[#0F172A] flex items-center gap-1.5">
              <span>TEMPORAL REASONING CONSOLE</span>
              <span className="font-mono text-[10px] px-1.5 py-0.2 bg-sky-50 text-[#0284C7] rounded border border-sky-100 font-semibold">
                LOCAL OLLAMA
              </span>
            </div>
            <div className="text-[10.5px] font-mono text-[#64748B]">
              Evaluated as of: <span className="text-[#0284C7] font-bold">{asOfDate}</span>
            </div>
          </div>
        </div>

        <button 
          onClick={clearChat}
          className="p-1.5 rounded-md hover:bg-slate-100 text-[#64748B] hover:text-[#0F172A] transition-colors cursor-pointer"
          title="Reset Conversation"
        >
          <RotateCcw size={13} />
        </button>
      </div>

      {/* Quick-Query Prompt Chips (Organized Notes Aesthetic) */}
      <div className="px-3 py-2 bg-slate-50/70 border-b border-slate-100 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        <span className="text-[10.5px] font-mono text-[#64748B] uppercase shrink-0 flex items-center gap-1">
          <Sparkles size={11} className="text-[#0284C7]" />
          Demo Queries:
        </span>
        {DEMO_QUERIES.map(q => (
          <button
            key={q.id}
            onClick={() => handleSelectQuery(q)}
            className="shrink-0 px-2.5 py-1 text-[11px] font-mono rounded-lg bg-white hover:bg-sky-50 text-[#334155] hover:text-[#0284C7] border border-slate-200 hover:border-sky-200 transition-all flex items-center gap-1 shadow-xs cursor-pointer"
          >
            <span>{q.shortLabel}</span>
          </button>
        ))}
      </div>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#F8FAFC]">
        {messages.map(msg => (
          <div 
            key={msg.id}
            className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div className="flex items-center gap-2 text-[10px] font-mono text-[#94A3B8] mb-1 px-1">
              <span>{msg.role === 'user' ? 'Local Analyst (You)' : 'Keystone Reasoning Core'}</span>
              <span>•</span>
              <span>{msg.timestamp}</span>
            </div>

            <div 
              className={`max-w-[92%] rounded-xl p-4 shadow-sm ${
                msg.role === 'user' 
                  ? 'bg-sky-50 text-[#0F172A] border border-sky-100' 
                  : 'bg-white text-[#0F172A] border border-slate-200/80'
              }`}
            >
              {renderMessageContent(msg.content)}

              {/* Sourced Citations Pill Bar */}
              {msg.citations && msg.citations.length > 0 && (
                <div className="mt-3 pt-2.5 border-t border-slate-100">
                  <div className="text-[10.5px] font-mono text-[#64748B] uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <ShieldCheck size={12} className="text-emerald-600" />
                    Verified Graph Citations ({msg.citations.length}):
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {msg.citations.map((cit, cIdx) => (
                      <button
                        key={cIdx}
                        onClick={() => onCitationClick && onCitationClick(cit.id)}
                        className="citation-pill-paper"
                        title={`Inspect node ${cit.id}`}
                      >
                        <FileText size={11} />
                        <span>[{cit.label}]</span>
                        <ExternalLink size={9} className="opacity-60" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {isProcessing && (
          <div className="flex flex-col items-start animate-fade-in">
            <div className="text-[10px] font-mono text-[#94A3B8] mb-1 px-1">
              Keystone Pipeline Running...
            </div>
            <div className="bg-white rounded-xl p-3.5 border border-sky-200 text-xs text-[#0F172A] flex items-center gap-3 shadow-xs">
              <div className="w-4 h-4 border-2 border-[#0284C7] border-t-transparent rounded-full animate-spin"></div>
              <div className="font-mono text-[11.5px] text-[#0284C7]">
                {processingStep || "Traversing bi-temporal graph edges..."}
              </div>
            </div>
          </div>
        )}

        <div ref={chatBottomRef} />
      </div>

      {/* Input Bar */}
      <div className="p-3 bg-white border-t border-slate-100">
        <div className="relative flex items-center">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Keystone (e.g., 'Was keeping customer logs for 180 days compliant in Q2 2025?')..."
            rows={1}
            className="w-full bg-[#F8FAFC] border border-slate-200 rounded-lg pl-3 pr-20 py-2.5 text-xs text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-300 resize-none font-sans"
          />
          <div className="absolute right-2 flex items-center gap-1.5">
            <button
              onClick={() => executeQuestion(inputValue)}
              disabled={!inputValue.trim() || isProcessing}
              className="px-3 py-1.5 rounded-md btn-sky-gradient text-white text-xs font-mono font-medium disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer"
            >
              <span>Ask</span>
              <CornerDownLeft size={11} />
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between text-[10px] font-mono text-[#64748B] mt-1.5 px-1">
          <span>Grounding: 100% Strict Provenance</span>
          <span>Press Enter to Query</span>
        </div>
      </div>
    </div>
  );
}
