# Prints what differs between this machine and the demo machine. Run from the repo root, paste the whole output:
#   powershell -ExecutionPolicy Bypass -File scripts/diagnose.ps1
$ErrorActionPreference = 'Continue'
function Section([string]$t) { Write-Host ''; Write-Host "== $t" }

Section 'git'
git rev-parse --short HEAD
git status --short | Select-Object -First 10

Section 'containers'
docker compose ps --format '{{.Name}} {{.Status}}'

Section 'backend health'
try { Invoke-RestMethod http://localhost:8000/health | ConvertTo-Json -Compress } catch { "health failed: $_" }

Section 'ollama models (demo machine: nomic-embed-text 0a109f422b47)'
ollama list

Section 'backend env'
$null | docker compose exec -T backend printenv RELEVANCE_MIN ANSWER_MODEL EMBED_MODEL WHISPER_MODEL

Section 'whisper weights in backend/models'
if (Test-Path backend/models) { "{0} MB in backend/models" -f [math]::Round(((Get-ChildItem backend/models -Recurse -File | Measure-Object Length -Sum).Sum)/1MB) } else { 'backend/models missing' }
$null | docker compose exec -T backend python -c "from app import stt; stt._load(); print('whisper loads')"

Section 'demo data (snapshot nimbus-seed: 17 documents, 56 graph nodes)'
$null | docker compose exec -T postgres psql -U keystone_owner -d keystone -Atc 'SELECT count(*) FROM documents'
$null | docker compose exec -T neo4j cypher-shell -u neo4j -p keystone-dev-pw --format plain 'MATCH (n) RETURN count(n)' | Select-Object -Last 1

Section 'retrieval scores (demo machine: Atlas 0.929, AWS 0.836, MongoDB 0.756; threshold 0.80)'
$qs = @(
    @('Show the history of Project Atlas.', '2026-09-28'),
    @('Why did we move off AWS in May 2025?', '2025-06-01'),
    @('Why did we choose MongoDB?', '2026-09-28')
)
foreach ($q in $qs) {
    try {
        $body = @{ question = $q[0]; as_of = $q[1] } | ConvertTo-Json
        $r = Invoke-RestMethod -Method Post http://localhost:8000/ask -ContentType 'application/json' -Headers @{ 'X-User' = 'priya' } -Body $body -TimeoutSec 600
        $top = ($r.retrieval.top | Select-Object -First 3 | ForEach-Object { "$($_.keys -join '+')=$($_.score)" }) -join ', '
        "refused=$($r.refused)  top: $top  | $($q[0])"
    } catch { "ask failed: $_ | $($q[0])" }
}
