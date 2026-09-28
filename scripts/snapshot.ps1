# Capture the seeded state (Neo4j graph + Postgres) into backups/<name>/ so another machine can restore it.
# Run from the repo root:  powershell -File scripts/snapshot.ps1 [-Name nimbus-seed]
# Stops backend + executor so both stores are captured at the same moment; Neo4j Community can only dump offline.
param([string]$Name = (Get-Date -Format 'yyyyMMdd-HHmmss'))
$ErrorActionPreference = 'Stop'

function Step([string]$what, [scriptblock]$cmd) {
    Write-Host "== $what"
    & $cmd
    if ($LASTEXITCODE -ne 0) { throw "failed: $what (exit $LASTEXITCODE)" }
}

$dir = Join-Path (Get-Location) "backups\$Name"
New-Item -ItemType Directory -Force $dir | Out-Null
# Delete old dumps first: overwriting a larger file through the Docker Desktop bind mount can leave trailing bytes,
# and neo4j-admin then rejects the dump as "Not a valid Neo4j archive" at restore time.
Remove-Item -Force -ErrorAction SilentlyContinue "$dir\keystone.dump", "$dir\neo4j.dump", "$dir\manifest.json"

# Record what is being captured, so the receiving side can check the restore.
$extract = (docker compose exec -T backend printenv EXTRACT_MODEL) -join ''
$docs = (docker compose exec -T postgres psql -U keystone_owner -d keystone -Atc 'SELECT count(*) FROM documents') -join ''
$audit = (docker compose exec -T postgres psql -U keystone_owner -d keystone -Atc 'SELECT count(*) FROM audit_log') -join ''
$nodes = (docker compose exec -T neo4j cypher-shell -u neo4j -p keystone-dev-pw --format plain 'MATCH (n) RETURN count(n)' | Select-Object -Last 1)

Step 'stop writers (backend, executor)' { docker compose stop backend executor }
Step 'dump postgres' { docker compose exec -T postgres pg_dump -U keystone_owner -d keystone -Fc -f /tmp/keystone.dump }
Step 'copy postgres dump out' { docker compose cp postgres:/tmp/keystone.dump "$dir\keystone.dump" }
Step 'stop neo4j (offline dump)' { docker compose stop neo4j }
Step 'dump neo4j' { docker compose run --rm --no-deps -v "${dir}:/backups" neo4j neo4j-admin database dump neo4j --to-path=/backups --overwrite-destination=true }
Step 'restart stack' { docker compose up -d }

@{
    name = $Name; created = (Get-Date).ToUniversalTime().ToString('o'); git_commit = (git rev-parse HEAD)
    extract_model = $extract; documents = [int]$docs; audit_rows = [int]$audit; graph_nodes = [int]$nodes
} | ConvertTo-Json | Set-Content -Encoding utf8 "$dir\manifest.json"
Get-Content "$dir\manifest.json"
Write-Host "Snapshot written to $dir (keystone.dump, neo4j.dump, manifest.json)"
