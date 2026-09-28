# Recording the Keystone demo on another PC

Everything runs locally; after setup no internet is needed. Expect about 30 minutes, mostly model downloads.

## 1. What the PC needs

- **Windows 10/11** with **16 GB RAM** or more.
- **An NVIDIA GPU with 6 GB+ VRAM is strongly recommended.** Answers take about 10–20 s on an RTX 4070 laptop.
  Without a GPU Ollama falls back to CPU and each answer can take minutes, which makes recording painful.
- About **15 GB free disk** (models ~5 GB, Docker images ~3 GB).
- A screen at least **1500 px wide** in the browser (1920×1080 at 100% or 125% scaling is fine); below that the
  top bar overflows.
- Free ports: 5173, 8000, 5432, 7474, 7687.

## 2. Install (once)

1. [Docker Desktop](https://www.docker.com/products/docker-desktop/) — start it and wait until it says running.
2. [Ollama for Windows](https://ollama.com/download) — it runs in the tray after install.
3. [Node.js 20 LTS or newer](https://nodejs.org/).
4. [Git](https://git-scm.com/download/win).

## 3. Get the code and set it up

In PowerShell:

```powershell
git clone https://github.com/nitikas-boop/keystone-async.git
cd keystone-async
git checkout backend-finished
powershell -ExecutionPolicy Bypass -File scripts/setup-demo.ps1
npm run dev
```

Open http://localhost:5173. The setup script checks Docker and Ollama, downloads the models, starts the stack,
loads the demo data from `backups/nimbus-seed` and installs the frontend. It ends with the restore check:
`documents 17`, `audit rows 23`, `graph nodes 56`.

## 4. Check it works before recording

```powershell
docker compose exec backend python tests/calibrate_threshold.py http://localhost:8000
```

It asks the demo questions and prints each answer. Compare with the expected answers below. Then **reset the
data** (the check writes query rows to the audit log):

```powershell
powershell -ExecutionPolicy Bypass -File scripts/restore.ps1 -Name nimbus-seed
```

## 5. Reset before every take

```powershell
powershell -ExecutionPolicy Bypass -File scripts/restore.ps1 -Name nimbus-seed
Remove-Item outbox\*.eml
```

Then reload the browser page. The live upload in step 5 can only happen once per reset.

## 6. The recording (about 3 minutes)

Sign in as **Priya Menon**. Close other apps so the GPU is free. Each answer takes a few seconds: wait for it.

| # | Do this | You should see |
|---|---|---|
| 1 | Click chip **Project Atlas History** | DEC-003 → DEC-006 → DEC-010 in date order, with owners |
| 2 | Click **Why We Left AWS (May 2025)** | Vikram Shah, 2025-05-20, data residency and cost; cites DEC-006 and the meeting note |
| 3 | Click **VendorCo Contract Approval** | Approved correctly under PROC-3.1@v1; today it would need CEO sign-off (v2) |
| 4 | Click **180-Day Retention in Q2 2025**, then click **Jan 2024** on the timeline | Compliant under RET-2.1@v2; at Jan 2024 the graph shows only v1 clauses |
| 5 | **Ingest Document** → preset **Policy RET-2.1 v3** → **Upload & Run Scanner** (~20 s) | DEC-007 `ONGOING_PRACTICE_BREACH` + DEC-002 `SUPERSEDED`; header switches to RET-2.1@v3 |
| 6 | **Proceed to Review Queue** → **Approve** on #2 | Status becomes Executed; `outbox/proposal-2.eml` appears |
| 7 | **Audit Trail** → **Verify Full Chain**; scroll to the bottom | "Verified N rows"; the last rows show ingested → flagged → proposed → approved by priya → executed |
| 8 | Back to **Unified Workspace**, click **Trick Query (MongoDB Choice)** | "I have no recorded decision about that" |

Optional: show the **Ingestion Review** tab (facts the model extracted, each with its source sentence).
For the sovereignty point, record one take with Wi-Fi switched off: everything above still works.

## 7. If something goes wrong

| Symptom | Fix |
|---|---|
| Chat says "Failed to fetch" | The backend is not reachable: `curl http://localhost:8000/health` must answer. If not, `docker compose up -d --wait`. Open the app at `http://localhost:…`, not the PC's network IP |
| Chat says "local model error … Connection error", or the top bar says "Local model unreachable" | The backend container cannot reach Ollama. 1) Start Ollama (the Windows app; tray icon) and check `curl http://localhost:11434/api/tags` answers. 2) `ollama list` must show `qwen2.5-7b-16k` and `nomic-embed-text` (else re-run the setup script). 3) Ollama must run on Windows, not inside WSL. 4) If Docker runs without Docker Desktop (inside WSL/Linux), set the Windows env var `OLLAMA_HOST=0.0.0.0`, restart Ollama, then `docker compose up -d`. 5) Pause VPN/firewall for port 11434. Check with `curl http://localhost:8000/health`: `ollama` must list both models as `true`; `ollama_error` says why not |
| Chat says "local model error … not found" | A model is missing: re-run the setup script |
| A vague question ("explain the latest policy") is refused | Expected: nothing scores above the relevance cutoff. Ask specifically, e.g. "What does the current customer log retention policy say?" |
| Page shows nothing, or API errors | `docker compose up -d --wait` (Docker Desktop must be running) |
| After the PC slept, everything is dead | Start Docker Desktop and Ollama again, then `docker compose up -d --wait` |
| Answers take minutes | No GPU in use: check `ollama ps` shows the model on GPU; close other GPU apps |
| Upload shows 0 flags | v3 was already uploaded since the last reset: run the reset (section 5) |
| Restore fails | Make sure the stack is up (`docker compose up -d --wait`), then run it again |
