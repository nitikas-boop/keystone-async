// Person 2 API calls (knowledge, conflicts, reasoning). src/api.js is frozen after Commit 0.
import { ApiError, getCurrentUser } from '../api';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

async function req(path, { method = 'GET', body, form, raw } = {}) {
  const headers = { 'X-User': getCurrentUser() };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(`${API}${path}`, { method, headers, body: form ?? (body !== undefined ? JSON.stringify(body) : undefined) });
  } catch (e) {
    throw new ApiError(0, `cannot reach the Keystone backend at ${API} (${e.message})`);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let detail = text;
    try { detail = JSON.parse(text).detail ?? text; } catch { /* plain text */ }
    throw new ApiError(res.status, detail);
  }
  return raw ? res : res.json();
}

const q = (params) => {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString();
  return s ? `?${s}` : '';
};

// L: session start
export const modelStatus = () => req('/session/model-status');
export const heartbeat = () => req('/session/heartbeat', { method: 'POST' });
export const latestScan = () => req('/session/scan/latest');
export const rescan = () => req('/session/scan', { method: 'POST' });
export const confirmBaseline = (runId) => req(`/session/scan/${runId}/confirm-baseline`, { method: 'POST' });
export const scanFiles = (reviewStatus = 'waiting') => req(`/scan/files${q({ review_status: reviewStatus })}`);
export const ingestScanFile = (id, body = {}) => req(`/scan/files/${id}/ingest`, { method: 'POST', body });
export const ignoreScanFile = (id) => req(`/scan/files/${id}/ignore`, { method: 'POST' });

// C: proposals, collisions, claims
export const policyProposals = (status) => req(`/policy-proposals${q({ status })}`);
export const createProposal = (body) => req('/policy-proposals', { method: 'POST', body });
export const editProposal = (id, version, changes) => req(`/policy-proposals/${id}`, { method: 'PATCH', body: { version, changes } });
export const submitProposal = (id, resolution = null) =>
  req(`/policy-proposals/${id}/submit`, { method: 'POST', body: resolution ? { resolution } : {} });
export const startReview = (id) => req(`/policy-proposals/${id}/review`, { method: 'POST' });
export const approvePolicyProposal = (id) => req(`/policy-proposals/${id}/approve`, { method: 'POST' });
export const rejectPolicyProposal = (id, reason) => req(`/policy-proposals/${id}/reject`, { method: 'POST', body: { reason } });
export const collisions = (status) => req(`/collisions${q({ status })}`);
export const collision = (id) => req(`/collisions/${id}`);
export const resolveCollision = (id, outcome, reason, merged = null) =>
  req(`/collisions/${id}/resolve`, { method: 'POST', body: { outcome, reason, merged } });
export const scanDecisionConflicts = () => req('/collisions/scan-decisions', { method: 'POST' });
export const checkDuplicates = (text) => req('/conflicts/check', { method: 'POST', body: { text } });
export const overrideClaim = (id, reassignTo = null) => req(`/claims/${id}/override`, { method: 'POST', body: { reassign_to: reassignTo } });

// D: /whatif and slash commands
export const whatIf = (question, asOf) => req('/whatif', { method: 'POST', body: { question, as_of: asOf } });
export const promoteWhatIf = (simId) => req(`/whatif/${simId}/promote`, { method: 'POST' });
export const slashFlags = () => req('/slash/flags');
export const slashExplain = (flagId) => req(`/slash/explain/${encodeURIComponent(flagId)}`);
export const slashCompliance = (id, asOf) => req(`/slash/compliance/${encodeURIComponent(id)}${q({ as_of: asOf })}`);
export const slashHistory = (project) => req(`/slash/history/${encodeURIComponent(project)}`);
export const slashWhois = (who) => req(`/slash/whois${q({ q: who })}`);

// J: reports (Markdown as text; PDF as a blob to download)
export const reportUrl = (kind, params) => `/reports/${kind}${q(params)}`;
export async function reportText(kind, params) {
  return (await req(reportUrl(kind, { ...params, format: 'md' }), { raw: true })).text();
}
export async function reportBlob(kind, params, format) {
  return (await req(reportUrl(kind, { ...params, format }), { raw: true })).blob();
}

// F: audio
export const audioSources = () => req('/audio');
export const audioSource = (id) => req(`/audio/${id}`);
export const audioForDocument = (docId) => req(`/audio/by-document/${encodeURIComponent(docId)}`);
export function uploadAudio(file, meetingDate, title, consent) {
  const form = new FormData();
  form.append('file', file);
  form.append('meeting_date', meetingDate);
  form.append('title', title);
  form.append('consent', consent ? 'true' : 'false');
  return req('/audio', { method: 'POST', form });
}
export const ingestAudio = (id, speakers) => req(`/audio/${id}/ingest`, { method: 'POST', body: { speakers } });
export const deleteAudioFile = (id) => req(`/audio/${id}/file`, { method: 'DELETE' });
export async function audioBlobUrl(id) {
  return URL.createObjectURL(await (await req(`/audio/${id}/file`, { raw: true })).blob());
}

// I: answer translation
export const translateAnswer = (answerId, lang) => req('/i18n/translate-answer', { method: 'POST', body: { answer_id: answerId, lang } });
