import React, { useState, useEffect, useCallback } from 'react';
import { 
  ShieldCheck, 
  Terminal, 
  Clock, 
  GitBranch, 
  Upload, 
  Layers, 
  Lock, 
  ListChecks, 
  FileText, 
  LogOut, 
  Cpu, 
  Bell,
  LayoutGrid,
  FileSearch,
  Home
} from 'lucide-react';
import Logo from './Logo';
import TemporalSlider from './TemporalSlider';
import ChatPanel from './ChatPanel';
import GraphVisualizer from './GraphVisualizer';
import ReviewQueue from './ReviewQueue';
import AuditLogTable from './AuditLogTable';
import IngestionReview from './IngestionReview';
import IngestModal from './IngestModal';
import { 
  fetchGraph, 
  fetchProposals, 
  approveProposal, 
  rejectProposal, 
  editProposal, 
  fetchAudit, 
  healthCheck,
  setCurrentUser 
} from '../api';

export default function Dashboard({ currentUser, onSignOut, onHome }) {
  const [asOfDate, setAsOfDate] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [activeView, setActiveView] = useState('UNIFIED');
  const [selectedNodeId, setSelectedNodeId] = useState('DEC-007');
  const [highlightNodeIds, setHighlightNodeIds] = useState(['DEC-007', 'RET-2.1@v2']);
  const [liveGraphData, setLiveGraphData] = useState(null);
  // Only ever backend data: an empty list is shown as empty, never padded with mock rows.
  const [queueItems, setQueueItems] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [answerModel, setAnswerModel] = useState(null);
  const [engineOk, setEngineOk] = useState(null);  // null = not checked yet
  const [isIngestModalOpen, setIsIngestModalOpen] = useState(false);
  const [notification, setNotification] = useState(null);
  const [policyRefresh, setPolicyRefresh] = useState(0);

  const showNotification = (msg, type = "info") => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3500);
  };

  // Sync current user with api.js X-User header
  useEffect(() => {
    if (currentUser?.id || currentUser?.name) {
      setCurrentUser(currentUser.name || currentUser.id);
    }
  }, [currentUser]);

  // Load graph valid as of asOfDate
  useEffect(() => {
    let active = true;
    fetchGraph(asOfDate)
      .then(res => {
        if (active && res && res.nodes) {
          setLiveGraphData(res);
        }
      })
      .catch(err => {
        if (active) {
          setLiveGraphData({ nodes: [], edges: [] });
          showNotification(`Graph unavailable: ${err.message}`, "warning");
        }
      });
    return () => { active = false; };
  }, [asOfDate]);

  // Show the model actually serving answers, and whether the backend can reach it (Ollama up, models pulled).
  // Re-checked every 15 s so the badge turns red when Ollama stops and green again when it is back.
  useEffect(() => {
    const check = () => healthCheck().then(h => {
      setAnswerModel(h?.models?.answer ?? null);
      setEngineOk(!!h && !!h.ollama && Object.values(h.ollama).every(v => v === true));
    });
    check();
    const t = setInterval(check, 15000);
    return () => clearInterval(t);
  }, []);

  // Load proposals from GET /proposals
  const loadProposals = useCallback(async () => {
    try {
      setQueueItems(await fetchProposals());
    } catch (err) {
      showNotification(`Review queue unavailable: ${err.message}`, "warning");
    }
  }, []);

  // Load audit trail from GET /audit
  const loadAudit = useCallback(async () => {
    try {
      setAuditLogs(await fetchAudit(0, 500));
    } catch (err) {
      showNotification(`Audit log unavailable: ${err.message}`, "warning");
    }
  }, []);

  useEffect(() => {
    loadProposals();
    loadAudit();
  }, [loadProposals, loadAudit]);

  // Human Review Actions
  const handleApproveAction = async (actionId) => {
    try {
      await approveProposal(actionId);
      showNotification(`Proposal #${actionId} approved. The executor picks it up within seconds.`, "success");
      loadProposals();
      loadAudit();
      // The executor is a separate process polling every ~2s; refresh so the row flips to executed.
      setTimeout(() => { loadProposals(); loadAudit(); }, 4000);
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
      showNotification(`Proposal #${actionId} updated successfully.`, "success");
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
    setPolicyRefresh(k => k + 1);
    fetchGraph(asOf)
      .then(res => { if (res && res.nodes) setLiveGraphData(res); })
      .catch(err => showNotification(`Graph unavailable: ${err.message}`, "warning"));
    showNotification(`${uploadRes?.document_id ?? 'Document'} ingested. Scanner raised ${flagged.length} flag(s).`, "info");
  };

  return (
    <div className="h-dvh bg-[#F8FAFC] text-[#0F172A] flex flex-col overflow-hidden">
      {/* Top Header Bar */}
      <header className="h-14 shrink-0 bg-white border-b border-slate-200/80 px-5 flex items-center justify-between gap-4 z-30 select-none shadow-xs">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onHome}
            className="h-8 w-8 shrink-0 rounded-lg flex items-center justify-center text-[#64748B] hover:bg-slate-100 hover:text-[#0284C7] transition-colors cursor-pointer"
            title="Home (public landing page)"
            aria-label="Home"
          >
            <Home size={16} />
          </button>
          <Logo size={26} subtitle="" />
          <div className="hidden min-[1720px]:flex items-center gap-2 pl-3 border-l border-slate-200 font-mono text-[11px] leading-none whitespace-nowrap">
            <span className="text-[#64748B]">NODE:</span>
            <span className="text-[#0F172A] font-medium">nimbus-ledger.local</span>
            <span className="text-slate-300">|</span>
            {engineOk !== false && (
              <span className="text-emerald-700 flex items-center gap-1 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                {answerModel ? `Local Engine Active (Ollama · ${answerModel})` : 'Checking local engine…'}
              </span>
            )}
          </div>
          {engineOk === false && (
            <span className="font-mono text-[11px] leading-none px-2 py-1.5 rounded-md badge-note-rose whitespace-nowrap"
                  title="The backend cannot reach Ollama or a model is missing. Start Ollama and check `ollama list`.">
              Local model unreachable: start Ollama
            </span>
          )}
        </div>

        {/* View Switcher Segmented Pills */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200 text-xs font-mono shrink-0">
          <button
            onClick={() => setActiveView('UNIFIED')}
            className={`h-8 px-3 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeView === 'UNIFIED' ? 'bg-white text-[#0F172A] font-semibold shadow-xs' : 'text-[#64748B] hover:text-[#0F172A]'
            }`}
          >
            <LayoutGrid size={13} className={activeView === 'UNIFIED' ? 'text-[#0284C7]' : ''} />
            <span>Unified Workspace</span>
          </button>

          <button
            onClick={() => setActiveView('GRAPH')}
            className={`h-8 px-3 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeView === 'GRAPH' ? 'bg-white text-[#0F172A] font-semibold shadow-xs' : 'text-[#64748B] hover:text-[#0F172A]'
            }`}
          >
            <GitBranch size={13} className={activeView === 'GRAPH' ? 'text-[#0284C7]' : ''} />
            <span>Temporal Graph</span>
          </button>

          <button
            onClick={() => setActiveView('QUEUE')}
            className={`h-8 px-3 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeView === 'QUEUE' ? 'bg-white text-[#0F172A] font-semibold shadow-xs' : 'text-[#64748B] hover:text-[#0F172A]'
            }`}
          >
            <ListChecks size={13} className={activeView === 'QUEUE' ? 'text-[#0284C7]' : ''} />
            <span>Review Queue</span>
            {queueItems.filter(i => i.status === 'proposed' || i.status === 'Pending Approval').length > 0 && (
              <span className="min-w-4 h-4 px-1 rounded-full bg-[#0284C7] text-[10px] leading-none font-bold text-white flex items-center justify-center">
                {queueItems.filter(i => i.status === 'proposed' || i.status === 'Pending Approval').length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveView('EXTRACTIONS')}
            className={`h-8 px-3 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeView === 'EXTRACTIONS' ? 'bg-white text-[#0F172A] font-semibold shadow-xs' : 'text-[#64748B] hover:text-[#0F172A]'
            }`}
          >
            <FileSearch size={13} className={activeView === 'EXTRACTIONS' ? 'text-[#0284C7]' : ''} />
            <span>Ingestion Review</span>
          </button>

          <button
            onClick={() => setActiveView('AUDIT')}
            className={`h-8 px-3 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeView === 'AUDIT' ? 'bg-white text-[#0F172A] font-semibold shadow-xs' : 'text-[#64748B] hover:text-[#0F172A]'
            }`}
          >
            <ShieldCheck size={13} className={activeView === 'AUDIT' ? 'text-emerald-600' : ''} />
            <span>Audit Trail</span>
          </button>
        </div>

        {/* Right Action Icons & User Profile */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => setIsIngestModalOpen(true)}
            className="h-8 px-3 rounded-lg btn-sky-gradient text-white text-xs font-mono font-medium flex items-center gap-1.5 shadow-xs cursor-pointer hover:scale-102 transition-all"
            title="Upload a policy version, decision or meeting note (Markdown)"
          >
            <Upload size={13} />
            <span className="hidden sm:inline">Ingest Document</span>
          </button>

          <div className="h-8 flex items-center gap-2 pl-3 border-l border-slate-200 font-mono text-xs">
            <div className="flex flex-col justify-center text-right leading-tight">
              <span className="text-[#0F172A] font-semibold text-[11.5px]">{currentUser.name}</span>
              <span className="text-[#64748B] text-[10px]">{currentUser.id}</span>
            </div>
            <button
              onClick={onSignOut}
              className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-slate-100 text-[#64748B] hover:text-rose-600 transition-colors cursor-pointer"
              title="Sign Out"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </header>

      {/* Global "As-Of" Date Slider Ribbon */}
      <div className="px-4 pt-3 bg-[#F8FAFC] shrink-0">
        <TemporalSlider 
          refreshKey={policyRefresh}
          asOfDate={asOfDate} 
          onDateChange={(newDate) => {
            setAsOfDate(newDate);
            showNotification(`Temporal Horizon set to ${newDate}`, "info");
          }} 
        />
      </div>

      {/* Non-Alarmist Toast Notification */}
      {notification && (
        <div className="absolute bottom-5 right-5 z-50 animate-fade-in">
          <div className={`px-4 py-2.5 rounded-xl text-xs font-mono shadow-md border flex items-center gap-2 ${
            notification.type === 'success' ? 'badge-note-green' :
            notification.type === 'warning' ? 'badge-note-amber' :
            'bg-white border-slate-200 text-[#0F172A]'
          }`}>
            <Bell size={13} className="text-[#0284C7]" />
            <span>{notification.msg}</span>
          </div>
        </div>
      )}

      {/* Main Workspace Body with Generous Padding */}
      <div className="flex-1 p-4 overflow-y-auto lg:overflow-hidden flex flex-col min-h-0 bg-[#F8FAFC]">
        {(activeView === 'UNIFIED' || activeView === 'GRAPH') && (
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 lg:grid-rows-1 gap-4 min-h-0">
            {/* Chat: same element in both views, so the conversation survives switching tabs */}
            <div className={`${activeView === 'GRAPH' ? 'lg:col-span-4' : 'lg:col-span-5'} h-[560px] lg:h-auto min-h-0`}>
              <ChatPanel
                asOfDate={asOfDate}
                onCitationClick={(citId) => {
                  setSelectedNodeId(citId);
                  setHighlightNodeIds([citId]);
                  showNotification(`Selected node ${citId}`, "info");
                }}
                onQueryExecuted={(query, res) => {
                  if (query?.asOfDateSuggested) {
                    setAsOfDate(query.asOfDateSuggested);
                  }
                  if (res?.subgraph?.nodes?.length) {
                    setLiveGraphData(res.subgraph);
                  }
                }}
                onNodeHighlight={(nodeIds) => {
                  setHighlightNodeIds(nodeIds);
                  // Inspect what the answer cited; the previous selection may not be in the answer's subgraph.
                  if (nodeIds.length) setSelectedNodeId(nodeIds[0]);
                }}
                onSubgraph={(subgraph) => {
                  if (subgraph && subgraph.nodes && subgraph.nodes.length > 0) {
                    setLiveGraphData(subgraph);
                  }
                }}
              />
            </div>

            {/* Graph (plus the review queue preview on the unified view) */}
            <div className={`${activeView === 'GRAPH' ? 'lg:col-span-8' : 'lg:col-span-7'} flex flex-col gap-4 h-[800px] lg:h-auto min-h-0`}>
              <div className={activeView === 'GRAPH' ? 'flex-1 min-h-0' : 'flex-[6] min-h-0'}>
                <GraphVisualizer
                  asOfDate={asOfDate}
                  selectedNodeId={selectedNodeId}
                  onSelectNode={(id) => setSelectedNodeId(id)}
                  highlightNodeIds={highlightNodeIds}
                  liveGraphData={liveGraphData}
                  onOpenCitation={(citId) => {
                    setSelectedNodeId(citId);
                    setHighlightNodeIds([citId]);
                  }}
                />
              </div>

              {activeView === 'UNIFIED' && (
                <div className="flex-[4] min-h-0">
                  <ReviewQueue
                    queueItems={queueItems}
                    onApproveAction={handleApproveAction}
                    onRejectAction={handleRejectAction}
                    onEditAction={handleEditAction}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {activeView === 'QUEUE' && (
          <div className="flex-1 h-full min-h-0">
            <ReviewQueue
              queueItems={queueItems}
              onApproveAction={handleApproveAction}
              onRejectAction={handleRejectAction}
              onEditAction={handleEditAction}
            />
          </div>
        )}

        {activeView === 'EXTRACTIONS' && (
          <div className="flex-1 h-full min-h-0">
            <IngestionReview onNotify={showNotification} />
          </div>
        )}

        {activeView === 'AUDIT' && (
          <div className="flex-1 h-full min-h-0">
            <AuditLogTable
              auditLogs={auditLogs}
              onRefresh={loadAudit}
              onVerifyChain={(result) => showNotification(result.message, result.ok ? "success" : "warning")}
            />
          </div>
        )}
      </div>

      {/* Ingestion & Document Parser Modal */}
      <IngestModal
        isOpen={isIngestModalOpen}
        onClose={() => setIsIngestModalOpen(false)}
        onPolicyUploaded={handlePolicyUploaded}
        onProceedToQueue={() => setActiveView('QUEUE')}
      />
    </div>
  );
}
