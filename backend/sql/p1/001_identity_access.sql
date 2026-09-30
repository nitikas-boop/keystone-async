-- Person 1 (A, B): organisations, users, memberships, teams, access grants. Idempotent (migrate.sh re-runs it).
-- org_id is on every row; the default org's id equals the backend's GROUP_ID, so its graph partition is the
-- existing one. users.id is the pseudonymous id used in the graph and the audit log (actor 'user:<id>').

CREATE TABLE IF NOT EXISTS organizations (
    id               text PRIMARY KEY,
    name             text NOT NULL,
    join_code_hash   text,                               -- sha256 of the normalised code; plaintext is never stored
    code_expires_at  timestamptz,
    code_max_uses    int,
    code_uses        int NOT NULL DEFAULT 0,
    code_disabled    boolean NOT NULL DEFAULT false,
    require_approval boolean NOT NULL DEFAULT true,
    created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS organizations_code ON organizations (join_code_hash);

CREATE TABLE IF NOT EXISTS users (
    id            text PRIMARY KEY CHECK (id ~ '^[a-z0-9_.-]+$'),
    org_id        text NOT NULL REFERENCES organizations(id),
    employee_id   text NOT NULL UNIQUE,                  -- the login handle
    password_hash text NOT NULL,
    display_name  text NOT NULL,
    designation   text,
    person_key    text,                                  -- the Person node this user is in the graph (p-priya)
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS teams (
    id       text PRIMARY KEY,
    org_id   text NOT NULL REFERENCES organizations(id),
    name     text NOT NULL,
    lead_id  text REFERENCES users(id),
    projects text[] NOT NULL DEFAULT '{}',               -- a node's team is its source's team, else its project's
    UNIQUE (org_id, name)
);

CREATE TABLE IF NOT EXISTS memberships (
    user_id    text PRIMARY KEY REFERENCES users(id),    -- one org per user in this build
    org_id     text NOT NULL REFERENCES organizations(id),
    role       text NOT NULL CHECK (role IN ('owner', 'lead', 'member', 'compliance', 'auditor')),
    team_id    text REFERENCES teams(id),
    status     text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'removed')),
    joined_at  timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz,                              -- auditors: time-limited
    audit_from date,                                     -- auditors: the date range they were invited for
    audit_to   date
);

CREATE TABLE IF NOT EXISTS team_members (
    team_id text NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id text NOT NULL REFERENCES users(id),
    org_id  text NOT NULL REFERENCES organizations(id),
    PRIMARY KEY (team_id, user_id)
);

CREATE TABLE IF NOT EXISTS access_grants (
    id          bigserial PRIMARY KEY,
    org_id      text NOT NULL REFERENCES organizations(id),
    user_id     text NOT NULL REFERENCES users(id),
    resource_id text NOT NULL,                           -- a graph key or document id (DEC-008)
    granted_by  text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    revoked_at  timestamptz
);

-- Sources can now be team-scoped (B): the label lives on the document and on every node it produced.
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_visibility_check;
ALTER TABLE documents ADD CONSTRAINT documents_visibility_check CHECK (visibility IN ('org', 'team', 'restricted'));

GRANT SELECT, INSERT, UPDATE, DELETE ON organizations, users, teams, memberships, team_members, access_grants
    TO keystone_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO keystone_app;
