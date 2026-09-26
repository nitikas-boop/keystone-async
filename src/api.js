// Keystone backend client. Hardcoded user for the demo (real auth is roadmap).
const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';
const USER = import.meta.env.VITE_KEYSTONE_USER ?? 'priya';

export async function ask(question, asOf) {
  const res = await fetch(`${API}/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User': USER },
    body: JSON.stringify({ question, as_of: asOf }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}
