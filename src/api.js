// Keystone backend client. Hardcoded user for the demo (real auth is roadmap).
const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';
const USER = import.meta.env.VITE_KEYSTONE_USER ?? 'priya';

export async function ask(question, asOf, sessionId = null) {
  const payload = { question, as_of: asOf };
  if (sessionId) payload.session_id = sessionId;
  const res = await fetch(`${API}/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User': USER },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}
