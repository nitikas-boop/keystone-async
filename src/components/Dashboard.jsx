import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ShieldCheck,
  GitBranch,
  Upload,
  ListChecks,
  LogOut,
  Bell,
  FileSearch,
  Home,
  PanelLeftClose,
  PanelLeftOpen,
  MessageSquare,
  Table2,
  BookOpen,
  Search
} from 'lucide-react';
import Logo from './Logo';
import TemporalSlider from './TemporalSlider';
import ChatPanel from './ChatPanel';
import GraphVisualizer from './GraphVisualizer';
import ReviewQueue from './ReviewQueue';
import AuditLogTable from './AuditLogTable';
import IngestionReview from './IngestionReview';
import IngestModal from './IngestModal';
import DecisionRegister from './DecisionRegister';
import PoliciesView from './PoliciesView';
import CommandPalette from './CommandPalette';
import { AppContext } from '../context';
import { RESTRICTED_READERS, userKey as toUserKey } from '../utils/people';
import { todayIST } from '../utils/format';
import { nodeTitle } from '../utils/entities';
import {
  fetchProposals,
  approveProposal,
  rejectProposal,
  editProposal,
  fetchAuditAll,
  fetchDecisions,
  fetchExtractions,
  fetchGraphView,
  fetchTeam,
  healthCheck,
  setCurrentUser
} from '../api';

const VIEWS = [
  { id: 'UNIFIED', label: 'Ask', short: 'Ask', Icon: MessageSquare },
  { id: 'GRAPH', label: 'Temporal Graph', short: 'Graph', Icon: GitBranch },
  { id: 'QUEUE', label: 'Review Queue', short: 'Review', Icon: ListChecks },
  { id: 'EXTRACTIONS', label: 'Ingestion Review', short: 'Ingestion', Icon: FileSearch },
  { id: 'DECISIONS', label: 'Decisions', short: 'Decisions', Icon: Table2 },
  { id: 'POLICIES', label: 'Policies', short: 'Policies', Icon: BookOpen },
  { id: 'AUDIT', label: 'Audit Trail', short: 'Audit', Icon: ShieldCheck },
];

export default function Dashboard({ currentUser, onSignOut, onHome }) {
  const [asOfDate, setAsOfDate] = useState(() => todayIST());
  const [activeView, setActiveView] = useState('UNIFIED');
  const [selectedNodeId, setSelectedNodeId] = useState('DEC-007');
  const [highlightNodeIds, setHighlightNodeIds] = useState(['DEC-007', 'RET-2.1@v2']);
  const [chatCollapsed, setChatCollapsed] = useState(true);  // Temporal Graph opens graph-first; Ask always shows the console
  // Only ever backend data: an empty list is shown as empty, never padded with mock rows.
  const [queueItems, setQueueItems] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [health, setHealth] = useState(undefined);  // undefined = not checked yet, null = backend unreachable
  const [team, setTeam] = useState([]);
  const [isIngestModalOpen, setIsIngestModalOpen] = useState(false);
  const [notification, setNotification] = useState(null);
  const [policyRefresh, setPolicyRefresh] = useState(0);
  const [restrictedIds, setRestrictedIds] = useState(() => new Set());
  const [pendingFacts, setPendingFacts] = useState(0);
  const [queueFocus, setQueueFocus] = useState(null);
  const [auditFocus, setAuditFocus] = useState(null);
  const [policyFocus, setPolicyFocus] = useState(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [titles, setTitles] = useState(() => new Map());
  const [answerFocus, setAnswerFocus] = useState(null);  // {ids, question}: graph shows only what the answer used
  const [inspectKey, setInspectKey] = useState(0);        // bumped on an explicit "inspect this" (not on answer highlights)
  // Timeline ribbon collapsed per view (remembered in this browser): compact on the Workspace, open on the Graph.
  const [ribbonCollapsed, setRibbonCollapsed] = useState(() => {
    try { return { UNIFIED: true, GRAPH: false, ...JSON.parse(localStorage.getItem('kst.ribbon') || '{}') }; }
    catch { return { UNIFIED: true, GRAPH: false }; }
  });
  const toggleRibbon = (view) => setRibbonCollapsed(r => {
    const next = { ...r, [view]: !r[view] };
    try { localStorage.setItem('kst.ribbon', JSON.stringify(next)); } catch { /* storage unavailable: keep in memory */ }
    return next;
  });

  // Ctrl/Cmd+K opens record search from anywhere in the workspace.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen(o => !o); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const [watch, setWatch] = useState({ id: null, timedOut: null });  // proposal the UI waits on for the executor

  const showNotification = useCallback((msg, type = "info") => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  }, []);

  const userKey = toUserKey(currentUser?.id);
  const isReader = RESTRICTED_READERS.includes(userKey);
  const displayUser = (currentUser?.name || '').replace(/\s*\(.*\)$/, '');

  // Sync current user with api.js X-User header
  useEffect(() => { setCurrentUser(userKey); }, [userKey]);

  useEffect(() => { fetchTeam().then(setTeam).catch(() => setTeam([])); }, []);

  // One title per record ID (from /graph/view, so restricted titles never reach non-readers): chips lead with it.
  useEffect(() => {
    fetchGraphView(todayIST(), isReader)
      .then(g => setTitles(new Map(g.nodes.map(n => [n.id, nodeTitle(n)]).filter(([, t]) => t))))
      .catch(() => {});
  }, [isReader, policyRefresh]);

  // IDs of restricted decisions, so list views that the backend does not filter can hide them (KNOWN_ISSUES.md).
  // Restricted decisions, plus the documents and nodes named by restricted extractions (e.g. MTG-2025-08-12).
  useEffect(() => {
    Promise.all([fetchDecisions(), fetchExtractions()])
      .then(([ds, ex]) => {
        const secret = ex.filter(x => x.provenance?.visibility === 'restricted');
        setRestrictedIds(new Set([
          ...ds.filter(d => d.provenance?.visibility === 'restricted').map(d => d.id),
          ...secret.map(x => x.document_id), ...secret.map(x => x.source).filter(k => /^(DEC|MTG)-/.test(k || '')),
        ]));
      })
      .catch(() => {});
  }, [policyRefresh]);

  // GET /health every 15 s: model names, telemetry flag, and whether Ollama, Postgres and Neo4j answer.
  useEffect(() => {
    const check = () => healthCheck().then(h => setHealth(h ? { ...h, checkedAt: new Date().toISOString() } : null));
    check();
    const t = setInterval(check, 15000);
    return () => clearInterval(t);
  }, []);
  const engineOk = health ? !!health.ollama && Object.values(health.ollama).every(v => v === true) : health === null ? false : null;

  // Load proposals from GET /proposals
  const loadProposals = useCallback(async () => {
    try {
      setQueueItems(await fetchProposals());
    } catch (err) {
      showNotification(`Review queue unavailable: ${err.message}`, "warning");
    }
  }, [showNotification]);

  // Load audit trail from GET /audit
  const loadAudit = useCallback(async () => {
    try {
      setAuditLogs(await fetchAuditAll());
    } catch (err) {
      showNotification(`Audit log unavailable: ${err.message}`, "warning");
    }
  }, [showNotification]);

  // Pending extracted facts for the Ingestion Review badge (restricted ones are not counted for non-readers).
  const loadPendingFacts = useCallback(() => {
    fetchExtractions('pending')
      .then(rows => setPendingFacts(rows.filter(r => isReader || r.provenance.visibility !== 'restricted').length))
      .catch(() => {});
  }, [isReader]);

  useEffect(() => {
    loadProposals();
    loadAudit();
    loadPendingFacts();
  }, [loadProposals, loadAudit, loadPendingFacts]);

  // After an approval, poll GET /proposals every 2 s (the executor polls every ~2 s) until the row is executed,
  // then refresh the audit log so the executor's block appears. Gives up after 60 s and says so.
  useEffect(() => {
    if (watch.id == null) return undefined;
    const started = Date.now();
    const t = setInterval(async () => {
      const items = await fetchProposals().catch(() => null);
      if (items) setQueueItems(items);
      const p = items?.find(i => i.id === watch.id);
      if (p && p.status !== 'approved') {
        clearInterval(t);
        loadAudit();
        setWatch({ id: null, timedOut: null });
        if (p.status === 'executed') showNotification(`Executor wrote outbox/${p.outbox_file} for proposal #${p.id}.`, 'success');
      } else if (Date.now() - started > 60000) {
        clearInterval(t);
        setWatch({ id: null, timedOut: watch.id });
      }
    }, 2000);
    return () => clearInterval(t);
  }, [watch.id, loadAudit, showNotification]);

  // Human Review Actions
  const handleApproveAction = async (actionId) => {
    try {
      await approveProposal(actionId);
      await loadProposals();
      loadAudit();
      setWatch({ id: actionId, timedOut: null });
    } catch (err) {
      // No local fallback: an approval the backend did not record must not look approved.
      showNotification(`Approval failed, nothing was approved: ${err.message}`, "warning");
      loadProposals();
    }
  };

  const handleRejectAction = async (actionId, reason = null) => {
    try {
      await rejectProposal(actionId, reason);
      showNotification(`Proposal #${actionId} rejected.`, "warning");
      loadProposals();
      loadAudit();
    } catch (err) {
      showNotification(`Rejection failed, nothing was changed: ${err.message}`, "warning");
      loadProposals();
    }
  };

  const handleEditAction = async (actionId, changes) => {
    try {
      await editProposal(actionId, changes);
      showNotification(`Proposal #${actionId} updated.`, "success");
      loadProposals();
    } catch (err) {
      showNotification(`Edit failed, nothing was saved: ${err.message}`, "warning");
      loadProposals();
    }
  };

  const handlePolicyUploaded = (uploadRes) => {
    // Jump to the new version's start date and highlight what the scanner actually flagged.
    const flagged = (uploadRes?.flags || []).map(f => f.decision_id);
    const asOf = uploadRes?.ref_time || asOfDate;
    setAsOfDate(asOf);
    if (flagged.length) {
      setSelectedNodeId(flagged[0]);
      setHighlightNodeIds(flagged);
    }
    loadProposals();
    loadAudit();
    loadPendingFacts();
    setPolicyRefresh(k => k + 1);
    showNotification(`${uploadRes?.document_id ?? 'Document'} ingested. Scanner raised ${flagged.length} flag(s).`, "info");
  };

  // Any ID chip in the app lands here.
  const openEntity = useCallback((id, type, opts = {}) => {
    if (opts.view === 'POLICIES') { setPolicyFocus(String(id)); setActiveView('POLICIES'); return; }
    if (type === 'proposal') { setQueueFocus(String(id).replace(/\D/g, '')); setActiveView('QUEUE'); return; }
    if (type === 'audit') { setAuditFocus(String(id).replace(/\D/g, '')); setActiveView('AUDIT'); return; }
    if (type === 'extraction') { setActiveView('EXTRACTIONS'); return; }
    setSelectedNodeId(id);
    setHighlightNodeIds([id]);
    setInspectKey(k => k + 1);
    setActiveView(v => (opts.view || (v === 'UNIFIED' || v === 'GRAPH' ? v : 'GRAPH')));
  }, []);

  const ctx = useMemo(() => ({ userKey, isReader, team, openEntity, notify: showNotification, restrictedIds, titles }),
    [userKey, isReader, team, openEntity, showNotification, restrictedIds, titles]);
  const pendingProposals = queueItems.filter(i => i.status === 'proposed').length;

  return (
    <AppContext.Provider value={ctx}>
    <div className="h-dvh bg-ks-bg text-ks-text flex flex-col overflow-hidden">
      {/* Top Header Bar */}
      <header className="h-14 shrink-0 bg-ks-surface border-b border-ks-line/80 px-4 flex items-center justify-between gap-3 z-30 select-none shadow-xs">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            onClick={onHome}
            className="h-8 w-8 shrink-0 rounded-lg flex items-center justify-center text-ks-muted hover:bg-ks-raised-2 hover:text-ks-orange transition-colors cursor-pointer"
            title="Home (public landing page)"
            aria-label="Home"
          >
            <Home size={16} />
          </button>
          <div className="shrink-0"><Logo size={26} subtitle="" /></div>
          <span
            className={`hidden min-[1760px]:inline-flex items-center gap-1.5 text-[12px] px-2 py-1 rounded-md whitespace-nowrap ${
              engineOk === false ? 'badge-note-rose' : engineOk ? 'badge-note-green' : 'badge-note-slate'}`}
            title={health ? `Answers: ${health.models?.answer} · embeddings: ${health.models?.embed} · telemetry: ${String(health.telemetry)}`
              : health === null ? 'The backend did not answer GET /health.' : 'Checking GET /health…'}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${engineOk === false ? 'bg-ks-red' : engineOk ? 'bg-ks-ok' : 'bg-ks-subtle'}`} />
            {engineOk === false ? (health === null ? 'Backend unreachable' : 'Local model unreachable')
              : engineOk ? `Local model · ${health.models?.answer}` : 'Checking engine…'}
          </span>
        </div>

        {/* View Switcher Segmented Pills */}
        <nav aria-label="Views" className="flex items-center gap-1 p-1 rounded-xl bg-ks-raised-2 border border-ks-line text-[13px] shrink-0">
          {VIEWS.map(({ id, label, short, Icon }) => (
            <button
              key={id}
              onClick={() => setActiveView(id)}
              aria-current={activeView === id ? 'page' : undefined}
              title={label}
              className={`h-8 px-2.5 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                activeView === id ? 'bg-ks-surface text-ks-text font-semibold shadow-xs' : 'text-ks-muted hover:text-ks-text'
              }`}
            >
              <Icon size={14} className={activeView === id ? 'text-ks-orange' : ''} aria-hidden="true" />
              <span className="hidden min-[1700px]:inline">{label}</span>
              <span className="hidden min-[1280px]:inline min-[1700px]:hidden">{short}</span>
              {(id === 'QUEUE' ? pendingProposals : id === 'EXTRACTIONS' ? pendingFacts : 0) > 0 && (
                <span className="min-w-4 h-4 px-1 rounded-full bg-ks-orange text-[11px] leading-none font-bold text-ks-bg flex items-center justify-center"
                      title={id === 'QUEUE' ? `${pendingProposals} proposal(s) waiting for a human decision` : `${pendingFacts} extracted fact(s) waiting for review`}>
                  {id === 'QUEUE' ? pendingProposals : pendingFacts}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Right Action Icons & User Profile */}
        <div className="flex items-center gap-3 shrink-0">
          <button onClick={() => setPaletteOpen(true)} className="btn-secondary" title="Search records (Ctrl+K)" aria-label="Search records">
            <Search size={14} /> <kbd className="hidden min-[1500px]:inline font-mono text-[11px] text-ks-muted">Ctrl K</kbd>
          </button>
          <button
            onClick={() => setIsIngestModalOpen(true)}
            className="h-8 px-3 rounded-lg btn-sky-gradient text-ks-on-accent text-[13px] font-medium flex items-center gap-1.5 shadow-xs cursor-pointer"
            title="Upload a policy version, decision or meeting note (Markdown or meeting audio)"
          >
            <Upload size={14} />
            <span className="hidden min-[1280px]:inline">Ingest Document</span>
            <span className="min-[1280px]:hidden">Ingest</span>
          </button>

          <div className="h-8 flex items-center gap-2 pl-3 border-l border-ks-line">
            <div className="flex flex-col justify-center text-right leading-tight" title={`Signed in (demo role picker) as ${currentUser.id}`}>
              <span className="text-ks-text font-semibold text-[13px]">{displayUser}</span>
              <span className="hidden min-[1280px]:inline text-ks-muted text-[11.5px]">{currentUser.role} · <span className="font-mono">{currentUser.id}</span></span>
            </div>
            <button
              onClick={onSignOut}
              className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-ks-raised-2 text-ks-muted hover:text-ks-red-text transition-colors cursor-pointer"
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </header>

      {/* As-of ribbon: only on the views that are evaluated as of a date (chat and graph). */}
      {(activeView === 'UNIFIED' || activeView === 'GRAPH') && (
        <div className="px-4 pt-3 bg-ks-bg shrink-0">
          <TemporalSlider
            refreshKey={policyRefresh}
            asOfDate={asOfDate}
            onDateChange={setAsOfDate}
            collapsed={!!ribbonCollapsed[activeView]}
            onToggleCollapsed={() => toggleRibbon(activeView)}
          />
        </div>
      )}

      {/* Toast */}
      {notification && (
        <div className="absolute bottom-5 right-5 z-50 rounded-xl bg-ks-surface" role="status">
          <div className={`px-4 py-2.5 rounded-xl text-[13px] shadow-md border flex items-center gap-2 ${
            notification.type === 'success' ? 'badge-note-green' :
            notification.type === 'warning' ? 'badge-note-amber' :
            'bg-ks-surface border-ks-line text-ks-text'
          }`}>
            <Bell size={13} className="text-ks-orange" />
            <span>{notification.msg}</span>
          </div>
        </div>
      )}

      {/* Main Workspace Body with Generous Padding */}
      <div className="flex-1 p-4 overflow-y-auto lg:overflow-hidden flex flex-col min-h-0 bg-ks-bg">
        {(activeView === 'UNIFIED' || activeView === 'GRAPH') && (
          <div className="flex-1 flex gap-4 min-h-0 ks-tab-in">
            {/* Ask = conversation + evidence for the latest answer. Temporal Graph = the full graph to explore, console
                on demand. The console is the same element in both (only hidden), so the conversation survives. */}
            {activeView === 'GRAPH' && chatCollapsed && (
              <button onClick={() => setChatCollapsed(false)} className="shrink-0 w-9 paper-sheet flex flex-col items-center gap-2 py-3 cursor-pointer hover:bg-ks-raised"
                      title="Show the console" aria-label="Show the console">
                <PanelLeftOpen size={15} className="text-ks-orange" />
                <span className="text-[12px] text-ks-text-2 [writing-mode:vertical-rl]">Console</span>
              </button>
            )}
            <div className={`${activeView === 'GRAPH' ? (chatCollapsed ? 'hidden' : 'w-[31%]') : 'w-[56%]'} shrink-0 min-h-0 relative`}>
              <ChatPanel
                headerAction={activeView === 'GRAPH' && (
                  <button onClick={() => setChatCollapsed(true)} className="icon-btn"
                          title="Collapse the console to widen the graph" aria-label="Collapse the console">
                    <PanelLeftClose size={13} />
                  </button>
                )}
                asOfDate={asOfDate}
                health={health}
                viewer={{ name: displayUser, role: currentUser.role }}
                onCitationClick={(citId) => {
                  setSelectedNodeId(citId);
                  setHighlightNodeIds([citId]);
                  setInspectKey(k => k + 1);
                }}
                onQueryExecuted={(query) => {
                  if (query?.asOfDateSuggested) {
                    setAsOfDate(query.asOfDateSuggested);
                  }
                }}
                onNodeHighlight={(nodeIds) => {
                  setHighlightNodeIds(nodeIds);
                  // Inspect what the answer cited; the previous selection may not be in the answer's subgraph.
                  if (nodeIds.length) setSelectedNodeId(nodeIds[0]);
                }}
                onAnswer={(res, question) => {
                  const ids = (res.subgraph?.nodes || []).map(n => n.id);
                  // Answer-first graph: only the records this answer used; a refusal returns to the full graph.
                  setAnswerFocus(!res.refused && ids.length ? { ids, question } : null);
                }}
                onReset={() => setAnswerFocus(null)}
              />
            </div>

            <div className="flex-1 min-w-0 min-h-0">
              <GraphVisualizer
                asOfDate={asOfDate}
                selectedNodeId={selectedNodeId}
                onSelectNode={(id) => {
                  setSelectedNodeId(id);
                  if (id) setInspectKey(k => k + 1);
                  else setHighlightNodeIds([]);  // clearing the selection also clears the rings
                }}
                highlightNodeIds={highlightNodeIds}
                refreshKey={policyRefresh}
                focus={activeView === 'UNIFIED' ? answerFocus : null}
                evidence={activeView === 'UNIFIED'}
                onExplore={() => { setActiveView('GRAPH'); setInspectKey(k => k + 1); }}
                defaultInspector={activeView === 'GRAPH'}
                inspectKey={inspectKey}
                proposals={queueItems}
                auditLogs={auditLogs}
              />
            </div>
          </div>
        )}

        {activeView === 'QUEUE' && (
          <div className="flex-1 h-full min-h-0 ks-tab-in">
            <ReviewQueue
              queueItems={queueItems}
              auditLogs={auditLogs}
              focusId={queueFocus}
              watchingId={watch.id}
              watchTimedOut={watch.timedOut}
              refreshKey={policyRefresh}
              onApproveAction={handleApproveAction}
              onRejectAction={handleRejectAction}
              onEditAction={handleEditAction}
            />
          </div>
        )}

        {activeView === 'EXTRACTIONS' && (
          <div className="flex-1 h-full min-h-0 ks-tab-in">
            <IngestionReview onNotify={showNotification} auditLogs={auditLogs} refreshKey={policyRefresh}
                             onChanged={() => { loadAudit(); loadPendingFacts(); }} />
          </div>
        )}

        {activeView === 'DECISIONS' && (
          <div className="flex-1 h-full min-h-0 ks-tab-in">
            <DecisionRegister refreshKey={policyRefresh} />
          </div>
        )}

        {activeView === 'POLICIES' && (
          <div className="flex-1 h-full min-h-0 ks-tab-in">
            <PoliciesView focus={policyFocus} refreshKey={policyRefresh} asOfDate={todayIST()} />
          </div>
        )}

        {activeView === 'AUDIT' && (
          <div className="flex-1 h-full min-h-0 ks-tab-in">
            <AuditLogTable
              auditLogs={auditLogs}
              onRefresh={loadAudit}
              focusBlock={auditFocus}
            />
          </div>
        )}
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />

      {/* Ingestion & Document Parser Modal */}
      <IngestModal
        isOpen={isIngestModalOpen}
        onClose={() => setIsIngestModalOpen(false)}
        onPolicyUploaded={handlePolicyUploaded}
        onProceedToQueue={(view) => setActiveView(view || 'QUEUE')}
      />
    </div>
    </AppContext.Provider>
  );
}
