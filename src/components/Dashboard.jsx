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
  LayoutGrid
} from 'lucide-react';
import Logo from './Logo';
import TemporalSlider from './TemporalSlider';
import ChatPanel from './ChatPanel';
import GraphVisualizer from './GraphVisualizer';
import ReviewQueue from './ReviewQueue';
import AuditLogTable from './AuditLogTable';
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

export default function Dashboard({ currentUser, onSignOut }) {
  const [asOfDate, setAsOfDate] = useState('2026-09-28');
  const [activeView, setActiveView] = useState('UNIFIED');
  const [selectedNodeId, setSelectedNodeId] = useState('DEC-007');
  const [highlightNodeIds, setHighlightNodeIds] = useState(['DEC-007', 'RET-2.1@v2']);
  const [liveGraphData, setLiveGraphData] = useState(null);
  // Only ever backend data: an empty list is shown as empty, never padded with mock rows.
  const [queueItems, setQueueItems] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [answerModel, setAnswerModel] = useState(null);
  const [isIngestModalOpen, setIsIngestModalOpen] = useState(false);
  const [notification, setNotification] = useState(null);

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

  // Show the model actually serving answers, as reported by the backend.
  useEffect(() => {
    healthCheck().then(h => setAnswerModel(h?.models?.answer ?? null));
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
    fetchGraph(asOf)
      .then(res => { if (res && res.nodes) setLiveGraphData(res); })
      .catch(() => {});
    showNotification(`${uploadRes?.document_id ?? 'Document'} ingested. Scanner raised ${flagged.length} flag(s).`, "info");
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex flex-col overflow-hidden">
      {/* Top Header Bar */}
      <header className="h-15 bg-white border-b border-slate-200/80 px-6 flex items-center justify-between z-30 select-none shadow-xs">
        <div className="flex items-center gap-4">
          <Logo size={28} subtitle="" />
          <div className="hidden xl:flex items-center gap-2 pl-3 border-l border-slate-200 font-mono text-[11px]">
            <span className="text-[#64748B]">NODE:</span>
            <span className="text-[#0F172A] font-medium">nimbus-ledger.local</span>
            <span className="text-slate-300">|</span>
            <span className="text-emerald-700 flex items-center gap-1 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
              {answerModel ? `Local Engine Active (Ollama · ${answerModel})` : 'Local engine unreachable'}
            </span>
          </div>
        </div>

        {/* View Switcher Segmented Pills */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200 text-xs font-mono">
          <button
            onClick={() => setActiveView('UNIFIED')}
            className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeView === 'UNIFIED' ? 'bg-white text-[#0F172A] font-semibold shadow-xs' : 'text-[#64748B] hover:text-[#0F172A]'
            }`}
          >
            <LayoutGrid size={13} className={activeView === 'UNIFIED' ? 'text-[#0284C7]' : ''} />
            <span>Unified Workspace</span>
          </button>

          <button
            onClick={() => setActiveView('GRAPH')}
            className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeView === 'GRAPH' ? 'bg-white text-[#0F172A] font-semibold shadow-xs' : 'text-[#64748B] hover:text-[#0F172A]'
            }`}
          >
            <GitBranch size={13} className={activeView === 'GRAPH' ? 'text-[#0284C7]' : ''} />
            <span>Temporal Graph</span>
          </button>

          <button
            onClick={() => setActiveView('QUEUE')}
            className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeView === 'QUEUE' ? 'bg-white text-[#0F172A] font-semibold shadow-xs' : 'text-[#64748B] hover:text-[#0F172A]'
            }`}
          >
            <ListChecks size={13} className={activeView === 'QUEUE' ? 'text-[#0284C7]' : ''} />
            <span>Review Queue</span>
            {queueItems.filter(i => i.status === 'proposed' || i.status === 'Pending Approval').length > 0 && (
              <span className="w-4 h-4 rounded-full bg-[#0284C7] text-[10px] font-bold text-white flex items-center justify-center">
                {queueItems.filter(i => i.status === 'proposed' || i.status === 'Pending Approval').length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveView('AUDIT')}
            className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeView === 'AUDIT' ? 'bg-white text-[#0F172A] font-semibold shadow-xs' : 'text-[#64748B] hover:text-[#0F172A]'
            }`}
          >
            <ShieldCheck size={13} className={activeView === 'AUDIT' ? 'text-emerald-600' : ''} />
            <span>Audit Trail</span>
          </button>
        </div>

        {/* Right Action Icons & User Profile */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsIngestModalOpen(true)}
            className="px-3 py-1.5 rounded-lg btn-sky-gradient text-white text-xs font-mono font-medium flex items-center gap-1.5 shadow-xs cursor-pointer hover:scale-102 transition-all"
            title="Ingest Policy PDF or meeting transcript"
          >
            <Upload size={13} />
            <span className="hidden sm:inline">Ingest Document</span>
          </button>

          <div className="flex items-center gap-2 pl-3 border-l border-slate-200 font-mono text-xs">
            <div className="flex flex-col text-right">
              <span className="text-[#0F172A] font-semibold text-[11.5px]">{currentUser.name}</span>
              <span className="text-[#64748B] text-[10px]">{currentUser.id}</span>
            </div>
            <button
              onClick={onSignOut}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-[#64748B] hover:text-rose-600 transition-colors cursor-pointer"
              title="Sign Out"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </header>

      {/* Global "As-Of" Date Slider Ribbon */}
      <div className="px-6 py-3 bg-[#F8FAFC] border-b border-slate-200/80 shrink-0">
        <TemporalSlider 
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
      <div className="flex-1 p-6 overflow-hidden flex flex-col min-h-0 bg-[#F8FAFC]">
        {activeView === 'UNIFIED' && (
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-0">
            {/* Left Column: Temporal Chat Console (5 Cols) */}
            <div className="lg:col-span-5 h-[560px] lg:h-full min-h-0">
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
                }}
                onSubgraph={(subgraph) => {
                  if (subgraph && subgraph.nodes && subgraph.nodes.length > 0) {
                    setLiveGraphData(subgraph);
                  }
                }}
              />
            </div>

            {/* Right Column: Split into Graph Visualizer and Review Queue */}
            <div className="lg:col-span-7 flex flex-col gap-5 h-[800px] lg:h-full min-h-0">
              {/* Graph Panel */}
              <div className="flex-[6] min-h-[300px]">
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

              {/* Review Queue Preview */}
              <div className="flex-[4] min-h-[220px]">
                <ReviewQueue
                  queueItems={queueItems}
                  onApproveAction={handleApproveAction}
                  onRejectAction={handleRejectAction}
                  onEditAction={handleEditAction}
                />
              </div>
            </div>
          </div>
        )}

        {activeView === 'GRAPH' && (
          <div className="flex-1 h-full min-h-0">
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
      />
    </div>
  );
}
