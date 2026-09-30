-- Person 2 tables (C, D, F, L). Idempotent; applied by sql/zz-apply-folders.sh. org_id on every row.

-- L2: sign-in directory scan. file_index is the hash diff; review_status is the file's place in Ingestion Review.
CREATE TABLE IF NOT EXISTS scan_runs (
    id              bigserial PRIMARY KEY,
    org_id          text NOT NULL,
    triggered_by    text NOT NULL,
    started_at      timestamptz NOT NULL DEFAULT now(),
    finished_at     timestamptz,
    new_count       int NOT NULL DEFAULT 0,
    updated_count   int NOT NULL DEFAULT 0,
    missing_count   int NOT NULL DEFAULT 0,
    unchanged_count int NOT NULL DEFAULT 0,
    skipped_count   int NOT NULL DEFAULT 0,
    capped          boolean NOT NULL DEFAULT false,
    status          text NOT NULL DEFAULT 'running'
                    CHECK (status IN ('running', 'completed', 'awaiting_baseline', 'failed')),
    error           text
);

CREATE TABLE IF NOT EXISTS file_index (
    id                 bigserial PRIMARY KEY,
    org_id             text NOT NULL,
    path               text NOT NULL,            -- relative to KEYSTONE_DIR, e.g. Team/Platform/runbook.md
    scope              text NOT NULL,            -- org | team:<name> | group:<name> (from the folder)
    visibility         text NOT NULL,            -- contracts.label_for(scope)
    size               bigint NOT NULL,
    mtime              double precision NOT NULL,
    sha256             text NOT NULL,
    status             text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'missing')),
    change             text NOT NULL CHECK (change IN ('new', 'updated', 'unchanged', 'missing')),
    review_status      text NOT NULL DEFAULT 'pending'
                       CHECK (review_status IN ('baseline', 'pending', 'ingested', 'ignored', 'failed')),
    first_seen_at      timestamptz NOT NULL DEFAULT now(),
    last_seen_at       timestamptz NOT NULL DEFAULT now(),
    last_scan_id       bigint REFERENCES scan_runs(id),
    ingested_source_id text,
    ingested_sha256    text,
    error              text,
    UNIQUE (org_id, path)
);

-- C: policy proposals (lifecycle draft -> proposed -> in_review -> active -> superseded, or -> rejected).
CREATE TABLE IF NOT EXISTS policy_proposals (
    id                    bigserial PRIMARY KEY,
    org_id                text NOT NULL,
    policy_id             text NOT NULL,
    clause_id             text NOT NULL,
    title                 text NOT NULL,
    clause_text           text NOT NULL,
    field                 text,                   -- structured field changed, e.g. retention_days_max
    new_value             jsonb,
    effective_from        date NOT NULL,
    rationale             text NOT NULL DEFAULT '',
    author_id             text NOT NULL,
    status                text NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft', 'proposed', 'in_review', 'active', 'superseded', 'rejected')),
    version               int NOT NULL DEFAULT 1,  -- optimistic lock: an out-of-date edit is rejected
    content_sha           text NOT NULL,
    embedding             real[],                 -- ponytail: cosine in Python; pgvector when proposals number thousands
    matches               jsonb NOT NULL DEFAULT '[]',
    resolution            jsonb,
    from_simulation       bigint,
    reviewer_id           text,
    decided_at            timestamptz,
    decision_reason       text,
    activated_document_id text,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now()
);

-- C3: one queue item per collision. ref_a/ref_b name the parties (PROP-n, RET-2.1@v3, DEC-007).
CREATE TABLE IF NOT EXISTS collisions (
    id                 bigserial PRIMARY KEY,
    org_id             text NOT NULL,
    type               text NOT NULL CHECK (type IN ('A', 'B', 'C')),
    proposal_a         bigint REFERENCES policy_proposals(id),
    proposal_b         bigint REFERENCES policy_proposals(id),
    ref_a              text NOT NULL,
    ref_b              text NOT NULL,
    clause_id          text,
    status             text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
    authority_id       text NOT NULL,
    summary            jsonb NOT NULL DEFAULT '{}',
    outcome            text,
    resolved_by        text,
    ruling_reason      text,
    ruling_decision_id text,
    created_at         timestamptz NOT NULL DEFAULT now(),
    resolved_at        timestamptz
);

-- C1: claims with expiry (claim before you work; review locks are claims on policy_proposal:<id>).
CREATE TABLE IF NOT EXISTS claims (
    id            bigserial PRIMARY KEY,
    org_id        text NOT NULL,
    resource_ref  text NOT NULL,
    owner_id      text NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    expires_at    timestamptz NOT NULL,
    released_at   timestamptz,
    overridden_by text
);
CREATE INDEX IF NOT EXISTS claims_active ON claims (org_id, resource_ref) WHERE released_at IS NULL;

-- D: every /whatif run. Never a real policy event.
CREATE TABLE IF NOT EXISTS simulations (
    id                bigserial PRIMARY KEY,
    org_id            text NOT NULL,
    run_by            text NOT NULL,
    question          text NOT NULL,
    hypothetical_json jsonb NOT NULL,
    result_json       jsonb NOT NULL,
    simulation        boolean NOT NULL DEFAULT true CHECK (simulation),
    created_at        timestamptz NOT NULL DEFAULT now()
);

-- F: audio sources and their timestamped transcripts. Raw audio is deletable; the transcript stays.
CREATE TABLE IF NOT EXISTS audio_sources (
    id               bigserial PRIMARY KEY,
    org_id           text NOT NULL,
    uploader_id      text NOT NULL,
    file_ref         text,                        -- NULL once the raw audio is deleted
    filename         text NOT NULL,
    title            text NOT NULL,
    meeting_date     date NOT NULL,               -- from the uploader, never guessed from audio
    consent_flag     boolean NOT NULL CHECK (consent_flag),
    visibility       text NOT NULL DEFAULT 'org',
    transcript_id    bigint,
    document_id      text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    audio_deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS transcripts (
    id            bigserial PRIMARY KEY,
    org_id        text NOT NULL,
    audio_id      bigint NOT NULL REFERENCES audio_sources(id),
    segments_json jsonb NOT NULL,                 -- [{start, end, text, speaker}]
    created_at    timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON scan_runs, file_index, policy_proposals, collisions, claims, simulations,
    audio_sources, transcripts TO keystone_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO keystone_app;
