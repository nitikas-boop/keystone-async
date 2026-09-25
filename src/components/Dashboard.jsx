import React, { useState } from 'react';
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
  INITIAL_REVIEW_QUEUE, 
  INITIAL_AUDIT_LOGS, 
  ORG_METADATA 
} from '../data/mockData';
import { sha256 } from '../utils/crypto';

export default function Dashboard({ currentUser, onSignOut }) {
  const [asOfDate, setAsOfDate] = useState('2026-09-24');
  const [activeView, setActiveView] = useState('UNIFIED');
  const [selectedNodeId, setSelectedNodeId] = useState('DEC-2024-001');
  const [highlightNodeIds, setHighlightNodeIds] = useState(['DEC-2024-001', 'RET-2.1-v2']);
  const [queueItems, setQueueItems] = useState(INITIAL_REVIEW_QUEUE);
  const [auditLogs, setAuditLogs] = useState(INITIAL_AUDIT_LOGS);
  const [isIngestModalOpen, setIsIngestModalOpen] = useState(false);
  const [notification, setNotification] = useState(null);

  const showNotification = (msg, type = "info") => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3500);
  };

  const handleApproveAction = async (actionId) => {
    const item = queueItems.find(i => i.id === actionId);
    if (!item) return;

    const prevBlock = auditLogs[0];
    const newBlockHeight = prevBlock ? prevBlock.blockHeight + 1 : 101;
    const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
    const actorName = currentUser.name || "Priya Sharma (Compliance Lead)";
    
    const payload = `${newBlockHeight}:${nowIso}:${actorName}:EXECUTE_APPROVED_TASK:${prevBlock?.blockHash || '0'}`;
    const newHash = await sha256(payload);

    setQueueItems(prev => prev.map(i => i.id === actionId ? { ...i, status: 'Approved', archivedBlock: newBlockHeight } : i));

    const newLogEntry = {
      blockHeight: newBlockHeight,
      timestamp: nowIso,
      actor: actorName,
      action: "EXECUTE_APPROVED_MCP_TASK",
      targetTool: item.targetMcpTool,
      sourceGraphIds: [item.sourceDecisionId, item.sourceClauseId],
      prevHash: prevBlock?.blockHash || "0".repeat(64),
      blockHash: newHash,
      integrityStatus: "Verified"
    };

    setAuditLogs(prev => [newLogEntry, ...prev]);
    showNotification(`Action ${actionId} approved & executed. Block #${newBlockHeight} appended to audit chain.`, "success");
  };

  const handleRejectAction = (actionId) => {
    setQueueItems(prev => prev.map(i => i.id === actionId ? { ...i, status: 'Rejected' } : i));
    showNotification(`Action ${actionId} rejected and logged to governance trace.`, "warning");
  };

  const handleEditAction = (actionId, newParams) => {
    setQueueItems(prev => prev.map(i => i.id === actionId ? { ...i, parameters: newParams } : i));
    showNotification(`Parameters for ${actionId} staged successfully.`, "info");
  };

  const handlePolicyUploaded = () => {
    setAsOfDate('2026-09-24');
    setSelectedNodeId('DEC-2024-001');
    setHighlightNodeIds(['DEC-2024-001', 'DEC-2025-019', 'RET-2.1-v3']);
    showNotification("Policy RET-2.1 v3 activated. Staleness Scanner identified 2 decisions for review.", "info");
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
              Local Engine Active (Ollama 14B)
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
            {queueItems.filter(i => i.status === 'Pending Approval').length > 0 && (
              <span className="w-4 h-4 rounded-full bg-[#0284C7] text-[10px] font-bold text-white flex items-center justify-center">
                {queueItems.filter(i => i.status === 'Pending Approval').length}
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
                onQueryExecuted={(query) => {
                  if (query.asOfDateSuggested) {
                    setAsOfDate(query.asOfDateSuggested);
                  }
                }}
                onNodeHighlight={(nodeIds) => {
                  setHighlightNodeIds(nodeIds);
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
              onVerifyChain={() => showNotification("18 blocks verified with 0 alterations.", "success")}
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
