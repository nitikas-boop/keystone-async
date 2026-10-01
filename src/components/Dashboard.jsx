import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ShieldCheck,
  GitBranch,
  Upload,
  LogOut,
  Bell,
  Home,
  PanelLeftClose,
  PanelLeftOpen,
  MessageSquare,
  Table2,
  BookOpen,
  Search,
  Inbox as InboxIcon,
  LayoutDashboard
} from 'lucide-react';
import Logo from './Logo';
import Sidebar from './Sidebar';
import ViewBoundary from './ViewBoundary';
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
import Inbox from './Inbox';
import ReviewHub from './ReviewHub';
import WorkspaceDashboard from './WorkspaceDashboard';
import * as p1api from '../api/p1';
import AuthorModal from './AuthorModal';
import { AppContext } from '../context';
import { RESTRICTED_READERS, userKey as toUserKey } from '../utils/people';
import { todayIST } from '../utils/format';
import { nodeTitle } from '../utils/entities';
import {
  fetchProposals,
  approveProposal,
  rejectProposal,
  editProposal,
  fetchAnswer,
  fetchAuditAll,
  fetchDecisions,
  fetchExtractions,
  fetchGraphView,
  fetchTeam,
  healthCheck,
  setCurrentUser,
} from '../api';

// cap: the capability (GET /me/permissions) a view needs; views without one are open to every role.
const VIEWS = [
  { id: 'DASHBOARD', label: 'Dashboard', short: 'Home', Icon: LayoutDashboard, cap: 'dashboard' },
  { id: 'GRAPH', label: 'Graph', short: 'Graph', Icon: GitBranch, cap: 'graph' },
  { id: 'UNIFIED', label: 'Ask Keystone', short: 'Ask', Icon: MessageSquare, cap: 'ask' },
  { id: 'INBOX', label: 'Inbox', short: 'Inbox', Icon: InboxIcon },
  { id: 'DECISIONS', label: 'Decisions', short: 'Decisions', Icon: Table2, hidden: true },  // the Inbox's Decision Registry
  { id: 'POLICIES', label: 'Policies', short: 'Policies', Icon: BookOpen, cap: 'policies.read' },
  { id: 'AUDIT', label: 'Audit Log', short: 'Audit', Icon: ShieldCheck, cap: 'audit.own' },
];
// Sidebar order; any other view follows.
const NAV_ORDER = ['DASHBOARD', 'GRAPH', 'UNIFIED', 'INBOX', 'P1_CHAT', 'DECISIONS', 'P1_AGENT', 'POLICIES', 'AUDIT', 'P2', 'P1_ORG'];

// extraViews / headerExtras: Person 1 and Person 2 screens (src/features/p1, p2), mounted by App.jsx.
export default function Dashboard({ currentUser, onSignOut, onHome, extraViews = [], headerExtras = null,
  initialView = 'DASHBOARD', canApprove = true, employee = false, userSwitcher = null }) {
  const [asOfDate, setAsOfDate] = useState(() => todayIST());
  // The open view (and Inbox segment) survive a reload of this browser tab; a view the role cannot open falls back
  // to initialView once the permission map is known (below).
  const stored = (k) => { try { return sessionStorage.getItem(k); } catch { return null; } };
  const [activeView, setActiveView] = useState(() => stored('kst.view') || initialView);
  // The demo opens on the retention story; an employee opens with nothing selected (DEC-007 may be outside their
  // jurisdiction, and opening a locked node is an audited access attempt).
  const [selectedNodeId, setSelectedNodeId] = useState(employee ? null : 'DEC-007');
  const [highlightNodeIds, setHighlightNodeIds] = useState(employee ? [] : ['DEC-007', 'RET-2.1@v2']);
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
  const [inboxTab, setInboxTab] = useState('proposals');   // the review screens (REVIEW): proposals | facts
  const [inboxSegment, setInboxSegment] = useState(() => stored('kst.inbox') || 'mine'); // Inbox: mine | registry
  const [registryFocus, setRegistryFocus] = useState(null);
  const [chatFocus, setChatFocus] = useState(null);
  const [inboxCounts, setInboxCounts] = useState(null);
  const [authorMode, setAuthorMode] = useState(null);  // 'decision' | 'policy' while the authoring form is open
  const [openedAnswer, setOpenedAnswer] = useState(null);  // {res} from a #answer= link
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
  // The server decides what is visible; this only picks list-view hints. A signed-in user carries it.
  const isReader = currentUser?.isReader ?? RESTRICTED_READERS.includes(userKey);
  const displayUser = (currentUser?.name || '').replace(/\s*\(.*\)$/, '');

  // Sync current user with api.js X-User header
  useEffect(() => { setCurrentUser(userKey); }, [userKey]);
  // Stub sign-in hooks (Commit 0): fires on_login (model warm-up, directory scan) without waiting on it. Logout fires
  // only on an explicit sign-out: an effect cleanup would also run under StrictMode, and the requests can then reach
  // the server as login, login, logout.
  // Sign-in and sign-out (and the on_login / on_logout hooks) happen in Person 1's AuthGate, not here.
  const signOut = onSignOut;

  useEffect(() => { fetchTeam().then(setTeam).catch(() => setTeam([])); }, []);

  // One title per record ID (from /graph/view, so restricted titles never reach non-readers): chips lead with it.
  useEffect(() => {
    fetchGraphView(todayIST(), isReader)
      .then(g => setTitles(new Map(g.nodes.map(n => [n.id, nodeTitle(n)]).filter(([, t]) => t))))
      .catch(() => {});
  }, [isReader, policyRefresh]);

  // IDs of restricted decisions, so list views that the backend does not filter can hide them (KNOWN_ISSUES.md).
  // Restricted decisions, plus the documents and nodes named by restricted extractions (e.g. MTG-2025-08-12).
  const loadRestricted = useCallback(() => Promise.all([fetchDecisions(), fetchExtractions()])
    .then(([ds, ex]) => {
      const secret = ex.filter(x => x.provenance?.visibility === 'restricted');
      return new Set([
        ...ds.filter(d => d.provenance?.visibility === 'restricted').map(d => d.id),
        ...secret.map(x => x.document_id), ...secret.map(x => x.source).filter(k => /^(DEC|MTG)-/.test(k || '')),
      ]);
    }), []);
  useEffect(() => { loadRestricted().then(setRestrictedIds).catch(() => {}); }, [policyRefresh, loadRestricted]);

  // GET /health every 15 s: model names, telemetry flag, and whether Ollama, Postgres and Neo4j answer.
  useEffect(() => {
    const check = () => healthCheck().then(h => setHealth(h ? { ...h, checkedAt: new Date().toISOString() } : null));
    check();
    const t = setInterval(check, 15000);
    return () => clearInterval(t);
  }, []);
  const engineOk = health ? !!health.ollama && Object.values(health.ollama).every(v => v === true) : health === null ? false : null;

  // A link to an answer (#answer=<id>) reopens it in Ask. GET /answers/{id} is not visibility-filtered, so an answer
  // that cites a restricted record is not shown to someone who could not have asked it.
  useEffect(() => {
    const open = async () => {
      const id = decodeURIComponent(/#answer=([^&]+)/.exec(window.location.hash)?.[1] || '');
      if (!id) return;
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      try {
        const res = await fetchAnswer(id);
        const cited = [...(res.highlight_nodes || []), ...(res.citations || []).map(c => c.id), ...(res.subgraph?.nodes || []).map(n => n.id)];
        if (!isReader) {
          const secret = await loadRestricted();
          if (cited.some(c => secret.has(c))) { showNotification('That answer is not available to you.', 'warning'); return; }
        }
        setActiveView('UNIFIED');
        setOpenedAnswer({ res });
        if (res.as_of) setAsOfDate(res.as_of);
        const ids = (res.subgraph?.nodes || []).map(n => n.id);
        setAnswerFocus(!res.refused && ids.length ? { ids, question: res.question } : null);
        setHighlightNodeIds(res.highlight_nodes || []);
      } catch (err) {
        showNotification(err.status === 404 ? 'That answer link does not match a stored answer.' : `Could not open the answer: ${err.message}`, 'warning');
      }
    };
    open();
    window.addEventListener('hashchange', open);
    return () => window.removeEventListener('hashchange', open);
  }, [isReader, loadRestricted, showNotification]);

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
    // Everyone gets rows: the whole chain for the CEO and Compliance Lead, their own entries for everyone else.
    try {
      setAuditLogs(await fetchAuditAll());
    } catch (err) {
      showNotification(`Audit log unavailable: ${err.message}`, "warning");
    }
  }, [showNotification, isReader]);

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
    if (opts.view === 'REGISTRY') { setRegistryFocus(String(id)); setInboxSegment('registry'); setActiveView('INBOX'); return; }
    if (type === 'proposal') { setQueueFocus(String(id).replace(/\D/g, '')); setInboxTab('proposals'); setActiveView('REVIEW'); return; }
    if (type === 'audit') { setAuditFocus(String(id).replace(/\D/g, '')); setActiveView('AUDIT'); return; }
    if (type === 'extraction') { setInboxTab('facts'); setActiveView('REVIEW'); return; }
    setSelectedNodeId(id);
    setHighlightNodeIds([id]);
    setInspectKey(k => k + 1);
    setActiveView(v => (opts.view || (v === 'UNIFIED' || v === 'GRAPH' ? v : 'GRAPH')));
  }, []);

  const perms = currentUser.p1?.perms;
  const can = useCallback((cap) => !cap || !!perms?.capabilities?.includes(cap), [perms]);
  const ctx = useMemo(() => ({ userKey, isReader, canApprove, team, openEntity, notify: showNotification, restrictedIds, titles, perms, can }),
    [userKey, isReader, canApprove, team, openEntity, showNotification, restrictedIds, titles, perms, can]);
  const rank = (id) => (NAV_ORDER.includes(id) ? NAV_ORDER.indexOf(id) : NAV_ORDER.length);
  const allowed = [...VIEWS, ...extraViews].some(v => v.id === activeView && can(v.cap)) || activeView === 'REVIEW';
  useEffect(() => { if (perms && !allowed) setActiveView(initialView); }, [perms, allowed, initialView]);
  useEffect(() => {
    try { sessionStorage.setItem('kst.view', activeView); sessionStorage.setItem('kst.inbox', inboxSegment); }
    catch { /* storage unavailable: the view just is not remembered */ }
  }, [activeView, inboxSegment]);
  const navItems = [...VIEWS, ...extraViews].filter(v => !v.hidden && can(v.cap)).sort((a, b) => rank(a.id) - rank(b.id));
  // No approval authority (an employee): ingesting and authoring go through a lead; the backend refuses amounts above it.
  const noAuthority = currentUser.p1?.approval_authority_inr === 0;
  const pendingProposals = queueItems.filter(i => i.status === 'proposed').length;
  // Sidebar badge = pending actions + unread, exactly as GET /inbox counts them.
  const loadInbox = useCallback(() => p1api.inbox().then(d => setInboxCounts(d.counts)).catch(() => {}), []);
  useEffect(() => { loadInbox(); const t = setInterval(loadInbox, 15000); return () => clearInterval(t); }, [loadInbox, activeView]);
  const inboxBadge = inboxCounts?.badge ?? 0;
  // An Inbox item opens its source.
  const openInboxItem = (item) => {
    const r = item.ref || {};
    const decisionId = r.decision_id || (/^(DEC|MTG)-/.test(r.id || '') ? r.id : null);
    const nk = r.notification_kind;
    if (r.kind === 'channel') { setChatFocus({ cid: r.id, at: Date.now() }); setActiveView('P1_CHAT'); }
    else if (r.kind === 'proposal' || nk?.startsWith('proposal_')) openEntity(r.id, 'proposal');
    else if (r.kind === 'extraction' || nk === 'note_saved') openEntity(r.id, 'extraction');
    else if (r.kind === 'agent_action' || nk?.startsWith('action_')) setActiveView('P1_AGENT');
    else if (r.kind === 'answer') window.location.hash = `answer=${encodeURIComponent(r.id)}`;
    else if (nk === 'team_added') { setChatFocus(null); setActiveView('P1_CHAT'); }
    else if (nk === 'policy_uploaded') openEntity(r.id, 'policy', { view: 'POLICIES' });
    else if (decisionId) openEntity(decisionId, 'decision', { view: 'REGISTRY' });
    else setInboxSegment('mine');
  };
  const recordDecision = can('decision.create') ? () => setAuthorMode('decision')
    : can('decision.propose') ? () => setAuthorMode('propose') : undefined;

  return (
    <AppContext.Provider value={ctx}>
    <div className="h-dvh bg-kb-bg-soft text-kb-navy flex overflow-hidden">
      <Sidebar
        items={navItems.map(v => ({ ...v, badge: v.id === 'INBOX' ? inboxBadge : 0 }))}
        active={activeView}
        onSelect={setActiveView}
        user={{ name: displayUser, role: `${currentUser.role}${perms ? ` · ${perms.tier}` : ''}` }}
      />
    <div className="flex-1 min-w-0 flex flex-col overflow-hidden relative">
      {/* Top Header Bar */}
      <header className="h-14 shrink-0 bg-kb-bg border-b border-kb-line/80 px-4 flex items-center justify-between gap-3 z-30 select-none shadow-xs">
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={onHome}
            className="h-8 w-8 shrink-0 rounded-lg flex items-center justify-center text-kb-muted hover:bg-kb-ice/60 hover:text-kb-cobalt-ink transition-colors cursor-pointer"
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
            <span className={`w-1.5 h-1.5 rounded-full ${engineOk === false ? 'bg-kb-alert' : engineOk ? 'bg-kb-cobalt' : 'bg-kb-navy/35'}`} />
            {engineOk === false ? (health === null ? 'Backend unreachable' : 'Local model unreachable')
              : engineOk ? `Local model · ${health.models?.answer}` : 'Checking engine…'}
          </span>
        </div>

        {/* Right Action Icons & User Profile */}
        <div className="flex items-center gap-3 shrink-0">
          <button onClick={() => setPaletteOpen(true)} className="btn-secondary h-8" title="Search records (Ctrl+K)" aria-label="Search records">
            <Search size={14} /> <kbd className="hidden min-[1500px]:inline font-mono text-[11px] text-kb-muted">Ctrl K</kbd>
          </button>
          <button
            onClick={() => setIsIngestModalOpen(true)}
            disabled={noAuthority || perms?.read_only}
            className="h-8 px-3 rounded-lg btn-sky-gradient text-white text-[13px] font-medium flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            title={noAuthority ? 'Your approval authority is ₹0: ask your lead to ingest documents' : 'Upload a policy version, decision or meeting note (Markdown or meeting audio)'}
          >
            <Upload size={14} />
            <span className="hidden min-[1280px]:inline">Ingest Document</span>
            <span className="min-[1280px]:hidden">Ingest</span>
          </button>

          {headerExtras}
          <div className="h-8 flex items-center gap-2 pl-3 border-l border-kb-line">
            <div className="flex flex-col justify-center text-right leading-tight" title={`Signed in (demo role picker) as ${currentUser.id}`}>
              <span className="text-kb-navy font-semibold text-[13px]">{userSwitcher ? userSwitcher(displayUser) : displayUser}</span>
              <span className="text-kb-muted text-[11.5px] capitalize">{currentUser.role}{perms && ` · ${perms.tier}`}</span>
            </div>
            <button
              onClick={signOut}
              className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-kb-ice/60 text-kb-muted hover:text-kb-alert transition-colors cursor-pointer"
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
        <div className="px-4 pt-3 bg-kb-bg-soft shrink-0">
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
        <div className="absolute bottom-5 right-5 z-50 rounded-xl bg-kb-bg" role="status">
          <div className={`px-4 py-2.5 rounded-xl text-[13px] shadow-md border flex items-center gap-2 ${
            notification.type === 'success' ? 'badge-note-green' :
            notification.type === 'warning' ? 'badge-note-amber' :
            'bg-kb-bg border-kb-line text-kb-navy'
          }`}>
            <Bell size={13} className="text-kb-cobalt-ink" />
            <span>{notification.msg}</span>
          </div>
        </div>
      )}

      {/* Main Workspace Body with Generous Padding */}
      <div className="flex-1 p-4 overflow-y-auto lg:overflow-hidden flex flex-col min-h-0 bg-kb-bg-soft">
        <ViewBoundary key={activeView}>
        {(activeView === 'UNIFIED' || activeView === 'GRAPH') && (
          <div className="flex-1 flex gap-4 min-h-0 kb-tab-in">
            {/* Ask = conversation + evidence for the latest answer. Temporal Graph = the full graph to explore, console
                on demand. The console is the same element in both (only hidden), so the conversation survives. */}
            {activeView === 'GRAPH' && chatCollapsed && (
              <button onClick={() => setChatCollapsed(false)} className="shrink-0 w-9 paper-sheet flex flex-col items-center gap-2 py-3 cursor-pointer hover:bg-kb-bg-soft"
                      title="Show the console" aria-label="Show the console">
                <PanelLeftOpen size={15} className="text-kb-cobalt-ink" />
                <span className="text-[12px] text-kb-navy [writing-mode:vertical-rl]">Console</span>
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
                employee={employee}
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
                  loadAudit();  // the query's audit block, for the evidence export
                }}
                onReset={() => setAnswerFocus(null)}
                storageKey={`kst.chat.${userKey}`}
                auditLogs={auditLogs}
                opened={openedAnswer}
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

        {activeView === 'INBOX' && (
          <div className="flex-1 h-full min-h-0 kb-tab-in">
            <Inbox segment={inboxSegment} onSegment={setInboxSegment} onOpen={openInboxItem}
              onChanged={() => { loadProposals(); loadAudit(); loadPendingFacts(); loadInbox(); }}
              registry={<DecisionRegister refreshKey={policyRefresh} focus={registryFocus} proposals={queueItems} auditLogs={auditLogs}
                onRecord={recordDecision} recordLabel={can('decision.create') ? 'Record a decision' : 'Propose decision'} />} />
          </div>
        )}

        {activeView === 'DASHBOARD' && (
          <div className="flex-1 h-full min-h-0 overflow-y-auto kb-tab-in">
            <WorkspaceDashboard onOpenInbox={() => { setInboxSegment('mine'); setActiveView('INBOX'); }}
              onOpenItem={openInboxItem} onNavigate={setActiveView} />
          </div>
        )}

        {activeView === 'REVIEW' && (
          <div className="flex-1 h-full min-h-0 kb-tab-in">
            <ReviewHub tab={inboxTab} onTab={setInboxTab} pendingProposals={pendingProposals} pendingFacts={pendingFacts}
              proposals={<ReviewQueue
              queueItems={queueItems}
              auditLogs={auditLogs}
              focusId={queueFocus}
              watchingId={watch.id}
              watchTimedOut={watch.timedOut}
              refreshKey={policyRefresh}
              onApproveAction={handleApproveAction}
              onRejectAction={handleRejectAction}
              onEditAction={handleEditAction}
            />}
              facts={<IngestionReview onNotify={showNotification} auditLogs={auditLogs} refreshKey={policyRefresh}
                             onChanged={() => { loadAudit(); loadPendingFacts(); }} />}
            />
          </div>
        )}

        {activeView === 'DECISIONS' && (
          <div className="flex-1 h-full min-h-0 kb-tab-in">
            <DecisionRegister refreshKey={policyRefresh} proposals={queueItems} auditLogs={auditLogs} onRecord={recordDecision} />
          </div>
        )}

        {activeView === 'POLICIES' && (
          <div className="flex-1 h-full min-h-0 kb-tab-in">
            <PoliciesView focus={policyFocus} refreshKey={policyRefresh} asOfDate={todayIST()} onAdd={can('policy.upload') ? () => setAuthorMode('policy') : undefined} />
          </div>
        )}

        {activeView === 'AUDIT' && (
          <div className="flex-1 h-full min-h-0 kb-tab-in">
            <AuditLogTable
              auditLogs={auditLogs}
              onRefresh={loadAudit}
              focusBlock={auditFocus}
            />
          </div>
        )}

        {extraViews.filter(v => v.render && v.id === activeView).map(v => (
          <div key={v.id} className="flex-1 h-full min-h-0 overflow-y-auto kb-tab-in">
            {v.render({ asOfDate, currentUser, notify: showNotification, refreshKey: policyRefresh, auditLogs, can, chatFocus,
                        onChanged: () => { loadAudit(); loadPendingFacts(); loadProposals(); setPolicyRefresh(k => k + 1); } })}
          </div>
        ))}
        </ViewBoundary>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>

      {/* Ingestion & Document Parser Modal */}
      <IngestModal
        isOpen={isIngestModalOpen}
        onClose={() => setIsIngestModalOpen(false)}
        onPolicyUploaded={handlePolicyUploaded}
        onProceedToQueue={(view) => { setInboxTab(view === 'EXTRACTIONS' ? 'facts' : 'proposals'); setActiveView('INBOX'); }}
        onAuthor={(mode) => { setIsIngestModalOpen(false); setAuthorMode(mode); }}
        onAudioIngested={() => { loadPendingFacts(); loadAudit(); loadInbox(); }}
      />

      <AuthorModal
        mode={authorMode === 'propose' ? 'decision' : authorMode}
        propose={authorMode === 'propose'}
        canPolicy={can('policy.upload')}
        onProposed={(r) => { showNotification(`Proposed decision #${r.id} sent to a ${r.domain || ''} lead for review.`, 'success'); loadInbox(); }}
        onMode={setAuthorMode}
        onClose={() => setAuthorMode(null)}
        onSaved={handlePolicyUploaded}
        onProceed={(tab) => { setInboxTab(tab); setActiveView('INBOX'); }}
      />
    </div>
    </AppContext.Provider>
  );
}
