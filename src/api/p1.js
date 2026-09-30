// Person 1 API calls (auth, org, access, chat, devices, plugins, agent actions). src/api.js is frozen.
// The session is an HTTP-only cookie set by the API, so every call sends credentials. On a phone that reached the
// app by the laptop's LAN address, the API is the same host on :8000 (localhost there would be the phone itself).
const LOCAL = ['localhost', '127.0.0.1'].includes(window.location.hostname);
export const API = import.meta.env.VITE_API_URL
  ?? (LOCAL ? 'http://localhost:8000' : `${window.location.protocol}//${window.location.hostname}:8000`);

export class P1Error extends Error {
  constructor(status, detail) {
    super(typeof detail === 'string' ? detail : detail?.message || JSON.stringify(detail));
    this.status = status;
    this.detail = detail;
  }
}

async function call(method, path, body) {
  let res;
  try {
    res = await window.fetch(`${API}${path}`, {
      method, credentials: 'include',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    throw new P1Error(0, `cannot reach the Keystone backend at ${API} (${e.message})`);
  }
  const text = await res.text();
  let data = text;
  try { data = text ? JSON.parse(text) : null; } catch { /* plain text */ }
  if (!res.ok) throw new P1Error(res.status, data?.detail ?? data ?? res.statusText);
  return data;
}

const q = (params) => {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString();
  return s ? `?${s}` : '';
};

// ---- A: identity ----
export const me = () => call('GET', '/auth/me');
// The one permission map (tier, domains, capabilities): the UI hides what a role cannot use; the API enforces it.
export const permissions = () => call('GET', '/me/permissions');
export const login = (employee_id, password) => call('POST', '/auth/login', { employee_id, password });
export const demoAccounts = () => call('GET', '/auth/demo');
export const demoLogin = (employee_id) => call('POST', '/auth/demo', { employee_id });
export const logout = () => call('POST', '/auth/logout');
export const register = (body) => call('POST', '/auth/register', body);
export const join = (body) => call('POST', '/auth/join', body);

// ---- A/B: org admin ----
export const org = () => call('GET', '/org');
export const rotateCode = (body = {}) => call('POST', '/org/code/rotate', body);
export const codeSettings = (body) => call('PATCH', '/org/code', body);
export const members = (status) => call('GET', `/org/members${q({ status })}`);
export const approveJoin = (userId, body) => call('POST', `/org/members/${encodeURIComponent(userId)}/approve`, body);
export const rejectJoin = (userId) => call('POST', `/org/members/${encodeURIComponent(userId)}/reject`);
export const editMember = (userId, body) => call('PATCH', `/org/members/${encodeURIComponent(userId)}`, body);
export const teams = () => call('GET', '/org/teams');
export const createTeam = (body) => call('POST', '/org/teams', body);
export const editTeam = (id, body) => call('PATCH', `/org/teams/${encodeURIComponent(id)}`, body);

// ---- B: access ----
export const grants = () => call('GET', '/access/grants');
export const grant = (user_id, resource_id) => call('POST', '/access/grants', { user_id, resource_id });
export const revokeGrant = (id) => call('DELETE', `/access/grants/${id}`);
export const relabel = (docId, visibility, team) => call('PATCH', `/access/labels/${encodeURIComponent(docId)}`, { visibility, team: team || null });
export const people = () => call('GET', '/people');
export const personCard = (userId) => call('GET', `/people/${encodeURIComponent(userId)}`);
// Jurisdiction (B): opening a node outside it answers 403 with who to ask (and is audited as ACCESS_DENIED_ATTEMPT).
export const nodeAccess = (id) => call('GET', `/nodes/${encodeURIComponent(id)}/source`);
export const decisions = () => call('GET', '/decisions');
export const policies = () => call('GET', '/policies');
// An access request is a plain 1:1 message to the lead, so it is in their bell and in the chat history.
export async function requestAccess(userId, what) {
  const ch = await openDm([userId]);
  return postMessage(ch.id, `Access request: I need context on ${what}, which is outside my jurisdiction. Could you share what I need or grant me access?`);
}

// ---- E: chat and notifications ----
export const channels = () => call('GET', '/channels');
// body: {name, topic, is_private, team_id?, members?} (executives and leads)
export const createChannel = (body) => call('POST', '/channels', body);
export const markRead = (cid) => call('POST', `/channels/${cid}/read`);
export const promoteMessage = (cid, mid, title, meeting_date) => call('POST', `/channels/${cid}/messages/${mid}/promote`, { title, meeting_date });
export const openDm = (userIds) => call('POST', '/channels/dm', { user_ids: userIds });
export const messages = (cid, after = 0) => call('GET', `/channels/${cid}/messages${q({ after })}`);
export const postMessage = (cid, body, ref) => call('POST', `/channels/${cid}/messages`, { body, ref: ref || null });
export const saveThread = (cid, title, meeting_date) => call('POST', `/channels/${cid}/save`, { title, meeting_date });
export const notifications = () => call('GET', '/notifications');
export const readNotification = (id) => call('POST', `/notifications/${id}/read`);
export const readAllNotifications = () => call('POST', '/notifications/read-all');

// ---- E/G: agent actions (the gate) ----
export const actions = (status) => call('GET', `/actions${q({ status })}`);
export const proposeAction = (tool, payload) => call('POST', '/actions', { tool, payload });
export const editAction = (id, payload) => call('PATCH', `/actions/${id}`, { payload });
export const approveAction = (id) => call('POST', `/actions/${id}/approve`);
export const rejectAction = (id, reason) => call('POST', `/actions/${id}/reject`, { reason });

// ---- G: plugins ----
export const plugins = () => call('GET', '/plugins');
export const setPlugin = (id, enabled) => call('POST', `/plugins/${encodeURIComponent(id)}/${enabled ? 'enable' : 'disable'}`);
export const pluginResults = (id) => call('GET', `/plugins/${encodeURIComponent(id)}/results`);

// ---- H: devices ----
export const startPairing = () => call('POST', '/devices/pair');
export const pairingStatus = (token) => call('GET', `/devices/pair/status${q({ token })}`);
export const claimPairing = (token, label) => call('POST', '/devices/claim', { token, label });
export const devices = () => call('GET', '/devices');
export const revokeDevice = (id) => call('DELETE', `/devices/${id}`);

// ---- the review queue, for the phone (api.js is pinned to localhost, which a phone cannot reach) ----
export const proposals = (status = 'proposed') => call('GET', `/proposals${q({ status })}`);
export const flags = () => call('GET', '/flags');
export const approveProposal = (id) => call('POST', `/proposals/${id}/approve`);
export const rejectProposal = (id, reason) => call('POST', `/proposals/${id}/reject`, { reason });

// ---- the role-aware workspace: My Inbox, flags, proposed decisions, corrections, dashboard ----
export const inbox = () => call('GET', '/inbox');
export const inboxReadAll = () => call('POST', '/inbox/read-all');
export const correctionDone = (nid) => call('POST', `/inbox/corrections/${nid}/done`);
export const resolveFlag = (id, note) => call('POST', `/flags/${encodeURIComponent(id)}/resolve`, { note });
export const proposeDecision = (markdown) => call('POST', '/decision-proposals', { markdown });
export const decisionProposals = (status) => call('GET', `/decision-proposals${q({ status })}`);
export const acceptDecisionProposal = (id) => call('POST', `/decision-proposals/${id}/accept`);
export const rejectDecisionProposal = (id, reason) => call('POST', `/decision-proposals/${id}/reject`, { reason });
export const flagAnswer = (id, note) => call('POST', `/answers/${encodeURIComponent(id)}/flag`, { note });
export const editProposal = (id, body) => call('PATCH', `/proposals/${id}`, body);
export const dashboard = () => call('GET', '/dashboard');
