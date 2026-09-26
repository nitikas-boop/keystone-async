-- Keystone schema. Owner: keystone_owner. App connects as keystone_app.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Original documents and chunks: every citation resolves to an exact passage.
CREATE TABLE documents (
    id           text PRIMARY KEY,               -- DEC-004, POL-RET@v2, MTG-2025-05-14
    path         text NOT NULL,
    doc_type     text NOT NULL CHECK (doc_type IN ('decision', 'policy_version', 'meeting_note')),
    ref_time     date NOT NULL,                  -- from front-matter, never ingestion time
    front_matter jsonb NOT NULL,
    raw          text NOT NULL,
    sha256       text NOT NULL,
    visibility   text NOT NULL DEFAULT 'org' CHECK (visibility IN ('org', 'restricted')),
    ingested_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE chunks (
    document_id text NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    idx         int  NOT NULL,
    start_off   int  NOT NULL,                   -- offsets into documents.raw
    end_off     int  NOT NULL,
    text        text NOT NULL,
    PRIMARY KEY (document_id, idx)
);

-- Policy metadata: clause versions with validity windows from front-matter only.
CREATE TABLE policy_clauses (
    policy_id      text NOT NULL,
    version        text NOT NULL,
    clause_id      text NOT NULL,                -- stable across versions: RET-2.1
    document_id    text NOT NULL REFERENCES documents(id),
    title          text NOT NULL,
    text           text NOT NULL,
    fields         jsonb NOT NULL DEFAULT '{}',
    checkable      boolean NOT NULL,
    effective_from date NOT NULL,
    effective_to   date,                         -- next version's effective_from
    PRIMARY KEY (policy_id, version, clause_id)
);

-- Extraction provenance + ingestion review (§6.8).
CREATE TABLE extractions (
    id             bigserial PRIMARY KEY,
    document_id    text NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    kind           text NOT NULL CHECK (kind IN ('node', 'edge')),
    graph_uuid     text NOT NULL,
    type           text NOT NULL,                -- node type or edge relation
    source_key     text,
    target_key     text,
    text           text NOT NULL,
    source_start   int,
    source_end     int,
    source_quote   text,
    confidence     real NOT NULL CHECK (confidence BETWEEN 0 AND 1),
    extracted_by   text NOT NULL,
    human_verified boolean NOT NULL,
    visibility     text NOT NULL DEFAULT 'org',
    status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
    created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE flags (
    id           text PRIMARY KEY,
    decision_id  text NOT NULL,
    clause_id    text NOT NULL,
    old_version  text,
    new_version  text NOT NULL,
    impact_type  text NOT NULL CHECK (impact_type IN ('ONGOING_PRACTICE_BREACH', 'RULE_CHANGED_SINCE', 'SUPERSEDED')),
    severity     text NOT NULL,
    old_result   text,
    new_result   text NOT NULL,
    explanation  text NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now()
);

-- Review queue. Only a human (via the API) moves proposed -> approved; only the executor moves approved -> executed.
CREATE TABLE proposals (
    id          bigserial PRIMARY KEY,
    flag_id     text REFERENCES flags(id),
    decision_id text NOT NULL,
    clause_id   text NOT NULL,
    impact_type text NOT NULL,
    status      text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'approved', 'rejected', 'executed')),
    to_addr     text NOT NULL,
    subject     text NOT NULL,
    body        text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    decided_by  text,
    decided_at  timestamptz,
    executed_at timestamptz,
    outbox_file text
);

CREATE TABLE answers (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    question   text NOT NULL,
    as_of      date NOT NULL,
    response   jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Append-only, hash-chained audit log (§6.10, extended action/object_type enums).
CREATE TABLE audit_log (
    id           bigserial PRIMARY KEY,
    ts           timestamptz NOT NULL DEFAULT now(),
    actor        text NOT NULL CHECK (actor ~ '^(user:[a-z0-9_.-]+|system:scanner|system:watcher|executor)$'),
    action       text NOT NULL CHECK (action IN ('query', 'flag_created', 'action_proposed', 'approved',
                                                 'rejected', 'executed', 'edited', 'extraction_reviewed',
                                                 'policy_ingested')),
    object_type  text NOT NULL CHECK (object_type IN ('decision', 'flag', 'proposal', 'answer',
                                                      'extraction', 'policy_version')),
    object_id    text NOT NULL,
    source_ids   text[] NOT NULL DEFAULT '{}',
    payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
    prev_hash    text NOT NULL,
    hash         text NOT NULL
);

-- canonical_json(row without hash) = Postgres jsonb text output: keys ordered by (length, bytes),
-- ", " and ": " separators, ts as UTC ISO-8601 with microseconds. Mirrored in app/db.py.
CREATE FUNCTION audit_chain() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prev text;
BEGIN
    -- Serialises writers; app/db.py takes the same lock before INSERT so ids and chain order agree.
    PERFORM pg_advisory_xact_lock(hashtext('audit_log'));
    NEW.ts := now();
    SELECT hash INTO prev FROM audit_log ORDER BY id DESC LIMIT 1;
    NEW.prev_hash := coalesce(prev, repeat('0', 64));
    NEW.hash := encode(digest(jsonb_build_object(
        'id', NEW.id,
        'ts', to_char(NEW.ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        'actor', NEW.actor,
        'action', NEW.action,
        'object_type', NEW.object_type,
        'object_id', NEW.object_id,
        'source_ids', to_jsonb(NEW.source_ids),
        'payload_hash', NEW.payload_hash,
        'prev_hash', NEW.prev_hash
    )::text, 'sha256'), 'hex');
    RETURN NEW;
END $$;
CREATE TRIGGER audit_chain BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION audit_chain();

-- Defence in depth: even the owner cannot rewrite history without dropping the trigger.
CREATE FUNCTION audit_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'audit_log is append-only'; END $$;
CREATE TRIGGER audit_no_update BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION audit_immutable();
CREATE TRIGGER audit_no_truncate BEFORE TRUNCATE ON audit_log FOR EACH STATEMENT EXECUTE FUNCTION audit_immutable();

-- Grants: full DML on working tables, INSERT/SELECT only on the audit log.
GRANT SELECT, INSERT, UPDATE, DELETE ON documents, chunks, policy_clauses, extractions, flags, proposals, answers TO keystone_app;
GRANT SELECT, INSERT ON audit_log TO keystone_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO keystone_app;
