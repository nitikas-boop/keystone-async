#!/bin/sh
# Runs once on a fresh volume, before init.sql (initdb runs files in name order).
# init.sql is applied to `keystone` by initdb itself; here we also apply it to
# `keystone_test` so tests can write audit rows without polluting the real chain.
set -e
# ponytail: hardcoded dev password, real secrets management is roadmap (§9 "hardcoded auth is fine")
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<'SQL'
CREATE ROLE keystone_app LOGIN PASSWORD 'keystone_app_dev';
CREATE DATABASE keystone_test;
SQL
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d keystone_test -f /docker-entrypoint-initdb.d/init.sql
