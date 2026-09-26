# Restore a snapshot made by snapshot.ps1: REPLACES this machine's keystone database and Neo4j graph.
# Run from the repo root:  powershell -File scripts/restore.ps1 -Name nimbus-seed
# (expects backups/<name>/keystone.dump, neo4j.dump, manifest.json). keystone_test is not touched.
param([Parameter(Mandatory = $true)][string]$Name)
$ErrorActionPreference = 'Stop'

function Step([string]$what, [scriptblock]$cmd) {
    Write-Host "== $what"
    & $cmd
    if ($LASTEXITCODE -ne 0) { throw "failed: $what (exit $LASTEXITCODE)" }
}

$dir = Join-Path (Get-Location) "backups\$Name"
foreach ($f in 'keystone.dump', 'neo4j.dump', 'manifest.json') {
    if (-not (Test-Path "$dir\$f")) { throw "missing $dir\$f" }
}

Step 'stop writers (backend, executor)' { docker compose stop backend executor }
Step 'ensure postgres is up' { docker compose up -d --wait postgres }
Step 'copy postgres dump in' { docker compose cp "$dir\keystone.dump" postgres:/tmp/keystone.dump }
Step 'recreate keystone database' {
    docker compose exec -T postgres psql -U keystone_owner -d postgres -v ON_ERROR_STOP=1 `
        -c 'DROP DATABASE IF EXISTS keystone WITH (FORCE)' -c 'CREATE DATABASE keystone OWNER keystone_owner'
}
# --disable-triggers: load audit rows exactly as captured. Without it the hash-chain trigger would re-stamp
# every row's ts/prev_hash/hash on load, silently rewriting the audit trail.
Step 'restore postgres' {
    docker compose exec -T postgres pg_restore -U keystone_owner -d keystone --disable-triggers --exit-on-error /tmp/keystone.dump
}
Step 'stop neo4j (offline load)' { docker compose stop neo4j }
Step 'load neo4j' { docker compose run --rm --no-deps -v "${dir}:/backups" neo4j neo4j-admin database load neo4j --from-path=/backups --overwrite-destination=true }
Step 'restart stack' { docker compose up -d --wait }

$m = Get-Content "$dir\manifest.json" | ConvertFrom-Json
$docs = (docker compose exec -T postgres psql -U keystone_owner -d keystone -Atc 'SELECT count(*) FROM documents') -join ''
$audit = (docker compose exec -T postgres psql -U keystone_owner -d keystone -Atc 'SELECT count(*) FROM audit_log') -join ''
$nodes = (docker compose exec -T neo4j cypher-shell -u neo4j -p keystone-dev-pw --format plain 'MATCH (n) RETURN count(n)' | Select-Object -Last 1)
Write-Host ("documents  {0} (snapshot {1})" -f $docs, $m.documents)
Write-Host ("audit rows {0} (snapshot {1})" -f $audit, $m.audit_rows)
Write-Host ("graph nodes {0} (snapshot {1})" -f $nodes, $m.graph_nodes)
if ([int]$docs -ne $m.documents -or [int]$audit -ne $m.audit_rows -or [int]$nodes -ne $m.graph_nodes) {
    throw 'restore does not match the snapshot manifest'
}
Write-Host "Restored $Name (seeded with $($m.extract_model), commit $($m.git_commit))"
