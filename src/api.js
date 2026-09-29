// Keystone backend client.
const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';
let activeUser = import.meta.env.VITE_KEYSTONE_USER ?? 'priya';

export function setCurrentUser(user) {
  if (user) {
    // Strip prefix like "user:" or "p-" or get first name if persona
    const cleaned = user.toLowerCase().replace(/^(user:|p-)/, '').split(/[\s(]/)[0];
    activeUser = cleaned;
  }
}

export function getCurrentUser() {
  return activeUser;
}

function headers(extra = {}) {
  return { 'X-User': activeUser, ...extra };
}

function jsonHeaders() {
  return headers({ 'Content-Type': 'application/json' });
}

// Errors carry the HTTP status and the backend's own `detail`, so screens can tell "Ollama unreachable" (503)
// from "bad front-matter" (422) from "backend down" (fetch failed, status 0).
export class ApiError extends Error {
  constructor(status, detail) {
    super(`${status || 'network'} ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
    this.status = status;
    this.detail = detail;
  }
}

async function handleResponse(res) {
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let detail = text;
    try { detail = JSON.parse(text).detail ?? text; } catch { /* plain text body */ }
    throw new ApiError(res.status, detail);
  }
  return res.json();
}

async function send(url, opts = {}) {
  let res;
  try {
    res = await fetch(url, opts);
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ApiError(0, `cannot reach the Keystone backend at ${API} (${e.message})`);
  }
  return handleResponse(res);
}

// ---- Ask (Chat) ----

export async function ask(question, asOf, sessionId = null, signal = undefined) {
  const payload = { question, as_of: asOf };
  if (sessionId) payload.session_id = sessionId;  // short-term conversation memory (last few turns)
  return send(`${API}/ask`, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify(payload), signal });
}

// ---- Graph ----

export async function fetchGraph(asOf) {
  const res = await fetch(`${API}/graph?as_of=${asOf}`, {
    headers: headers(),
  });
  return handleResponse(res);
}

// ---- Proposals (Review Queue) ----

export async function fetchProposals(status = null) {
  const url = status ? `${API}/proposals?status=${status}` : `${API}/proposals`;
  const res = await fetch(url, { headers: headers() });
  return handleResponse(res);
}

export async function approveProposal(pid) {
  const res = await fetch(`${API}/proposals/${pid}/approve`, {
    method: 'POST',
    headers: jsonHeaders(),
  });
  return handleResponse(res);
}

export async function rejectProposal(pid, reason = null) {
  const res = await fetch(`${API}/proposals/${pid}/reject`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ reason }),
  });
  return handleResponse(res);
}

export async function editProposal(pid, changes) {
  const res = await fetch(`${API}/proposals/${pid}`, {
    method: 'PATCH',
    headers: jsonHeaders(),
    body: JSON.stringify(changes),
  });
  return handleResponse(res);
}

// ---- Audit Log ----

export async function fetchAudit(afterId = 0, limit = 100) {
  const res = await fetch(`${API}/audit?after_id=${afterId}&limit=${limit}`, {
    headers: headers(),
  });
  return handleResponse(res);
}

// ---- Documents (Upload / Ingest) ----

export async function uploadDocument(file, signal = undefined) {
  const formData = new FormData();
  formData.append('file', file);
  // no Content-Type: the browser sets the multipart boundary
  return send(`${API}/documents`, { method: 'POST', headers: headers(), body: formData, signal });
}

// Local Whisper on the backend. With meetingDate the result also carries a meeting_note Markdown document.
export async function transcribe(blob, filename = 'recording.webm', meetingDate = null, title = null, signal = undefined) {
  const formData = new FormData();
  formData.append('file', blob, filename);
  if (meetingDate) formData.append('meeting_date', meetingDate);
  if (title) formData.append('title', title);
  return send(`${API}/transcribe`, { method: 'POST', headers: headers(), body: formData, signal });
}

export async function verifyAuditServer() {
  const res = await fetch(`${API}/audit/verify`, { headers: headers() });
  return handleResponse(res);
}

// ---- Decisions / Compliance ----

export async function fetchDecisions(asOf) {
  const url = asOf ? `${API}/decisions?as_of=${asOf}` : `${API}/decisions`;
  const res = await fetch(url, { headers: headers() });
  return handleResponse(res);
}

export async function fetchDecisionCompliance(decisionId, asOf) {
  const url = asOf
    ? `${API}/decisions/${decisionId}/compliance?as_of=${asOf}`
    : `${API}/decisions/${decisionId}/compliance`;
  const res = await fetch(url, { headers: headers() });
  return handleResponse(res);
}

// ---- Policies ----

export async function fetchPolicies() {
  const res = await fetch(`${API}/policies`, { headers: headers() });
  return handleResponse(res);
}

// ---- Flags ----

export async function fetchFlags(impactType = null) {
  const url = impactType ? `${API}/flags?impact_type=${impactType}` : `${API}/flags`;
  const res = await fetch(url, { headers: headers() });
  return handleResponse(res);
}

// ---- Extractions (Ingestion Review) ----

export async function fetchExtractions(status = null, documentId = null) {
  let url = `${API}/extractions`;
  const params = [];
  if (status) params.push(`status=${status}`);
  if (documentId) params.push(`document_id=${documentId}`);
  if (params.length) url += '?' + params.join('&');
  const res = await fetch(url, { headers: headers() });
  return handleResponse(res);
}

export async function reviewExtraction(id, decision) {
  const res = await fetch(`${API}/extractions/${id}/${decision}`, { method: 'POST', headers: jsonHeaders() });
  return handleResponse(res);
}

// Edit = accept with human corrections (fields: name, fact, status, effect, fields).
export async function editExtraction(id, changes) {
  return send(`${API}/extractions/${id}`, { method: 'PATCH', headers: jsonHeaders(), body: JSON.stringify(changes) });
}

// ---- Read views ----

export async function fetchTeam() {
  return send(`${API}/team`, { headers: headers() });
}

// The as-of graph with the server's visibility filter (restricted items only with includeRestricted).
export async function fetchGraphView(asOf, includeRestricted = false) {
  return send(`${API}/graph/view?as_of=${asOf}${includeRestricted ? '&include_restricted=true' : ''}`, { headers: headers() });
}

export async function fetchNodeSource(nodeId, includeRestricted = false) {
  return send(`${API}/nodes/${encodeURIComponent(nodeId)}/source${includeRestricted ? '?include_restricted=true' : ''}`,
    { headers: headers() });
}

export async function fetchDocument(docId) {
  return send(`${API}/documents/${encodeURIComponent(docId)}`, { headers: headers() });
}

// GET /audit pages by `after_id` (max 500 per call): follow the cursor so the browser sees every row.
export async function fetchAuditAll() {
  const rows = [];
  for (let after = 0; ; ) {
    const page = await send(`${API}/audit?after_id=${after}&limit=500`, { headers: headers() });
    rows.push(...page);
    if (page.length < 500) return rows;
    after = page[page.length - 1].id;
  }
}

// ---- Health ----

export async function healthCheck() {
  try {
    const res = await fetch(`${API}/health`, { headers: headers() });
    return handleResponse(res);
  } catch {
    return null;
  }
}
