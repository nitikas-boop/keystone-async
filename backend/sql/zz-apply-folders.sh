#!/bin/sh
# Postgres initdb only runs top-level files in /docker-entrypoint-initdb.d (00-roles.sh, init.sql, then this),
# never subfolders. This applies sql/p0/ (shared contract), then sql/p1/, then sql/p2/, to keystone and
# keystone_test. Every migration is idempotent, so the same script updates an EXISTING volume:
#   docker compose exec postgres sh /docker-entrypoint-initdb.d/zz-apply-folders.sh
set -e
DIR=/docker-entrypoint-initdb.d
for db in keystone keystone_test; do
  for f in "$DIR"/p0/*.sql "$DIR"/p1/*.sql "$DIR"/p2/*.sql; do
    [ -f "$f" ] || continue
    echo "applying $f to $db"
    PGOPTIONS="-c client_min_messages=warning" psql -v ON_ERROR_STOP=1 -q -U "${POSTGRES_USER:-keystone_owner}" -d "$db" -f "$f"
  done
done
