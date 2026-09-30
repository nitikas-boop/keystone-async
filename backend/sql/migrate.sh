#!/bin/sh
# Applies the numbered migrations in p0/ (shared contract), then p1/ (Person 1), then p2/ (Person 2), to both
# databases. initdb runs top-level files only, in name order: 00-roles.sh, init.sql, then this file, so on a fresh
# volume it runs after init.sql. Every migration is idempotent, so on an existing volume run it again by hand:
#   docker compose exec postgres sh /docker-entrypoint-initdb.d/migrate.sh
set -e
DIR=$(dirname "$0")
for db in "$POSTGRES_DB" keystone_test; do
  for f in "$DIR"/p0/*.sql "$DIR"/p1/*.sql "$DIR"/p2/*.sql; do
    [ -f "$f" ] || continue
    echo "migrate $db: $f"
    psql -v ON_ERROR_STOP=1 -q -U "$POSTGRES_USER" -d "$db" -f "$f"
  done
done
