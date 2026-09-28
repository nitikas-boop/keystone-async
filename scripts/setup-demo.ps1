# One-time setup of the Keystone demo on a Windows PC: local models, the Docker stack, the demo data, the frontend.
# Needs Docker Desktop and Ollama running, and Node 20+. Run from the repo root:
#   powershell -ExecutionPolicy Bypass -File scripts/setup-demo.ps1
# Safe to re-run: it restores the demo data to the committed snapshot each time.
$ErrorActionPreference = 'Stop'

function Step([string]$what, [scriptblock]$cmd) {
    Write-Host "== $what"
    & $cmd
    if ($LASTEXITCODE -ne 0) { throw "failed: $what (exit $LASTEXITCODE)" }
}

foreach ($c in 'docker', 'ollama', 'npm') {
    if (-not (Get-Command $c -ErrorAction SilentlyContinue)) { throw "$c not found on PATH: install it first (docs/DEMO-RECORDING.md)" }
}
Step 'Docker Desktop is running' { docker info --format '{{.ServerVersion}}' }
Step 'Ollama is running' { ollama list }

# Same models as the demo machine: qwen2.5:7b with a 16k context (the default 4k silently truncates prompts),
# and local embeddings.
Step 'pull qwen2.5:7b (about 4.7 GB)' { ollama pull qwen2.5:7b }
Step 'create qwen2.5-7b-16k' { ollama create qwen2.5-7b-16k -f ollama/Modelfile.qwen2.5-7b-16k }
Step 'pull nomic-embed-text' { ollama pull nomic-embed-text }

Step 'build and start the stack' { docker compose up -d --build --wait }
Step 'restore the demo data (backups/nimbus-seed)' { powershell -ExecutionPolicy Bypass -File scripts/restore.ps1 -Name nimbus-seed }
Get-ChildItem outbox -Filter *.eml -ErrorAction SilentlyContinue | Remove-Item
Step 'install frontend packages' { npm install }

Write-Host ''
Write-Host 'Setup done. Start the frontend with:  npm run dev   then open http://localhost:5173'
Write-Host 'Check the answers before recording:   docker compose exec backend python tests/calibrate_threshold.py http://localhost:8000'
