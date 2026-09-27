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

async function handleResponse(res) {
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status} ${text}`);
  }
  return res.json();
}

// ---- Ask (Chat) ----

export async function ask(question, asOf) {
  const res = await fetch(`${API}/ask`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ question, as_of: asOf }),
  });
  return handleResponse(res);
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

export async function uploadDocument(file) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API}/documents`, {
    method: 'POST',
    headers: headers(),  // no Content-Type — browser sets multipart boundary
    body: formData,
  });
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

// ---- Health ----

export async function healthCheck() {
  try {
    const res = await fetch(`${API}/health`, { headers: headers() });
    return handleResponse(res);
  } catch {
    return null;
  }
}
