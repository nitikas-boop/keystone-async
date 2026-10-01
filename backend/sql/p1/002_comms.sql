-- Person 1 (E, G): channels, messages, notifications and the gate for agent-originated actions. Idempotent.

CREATE TABLE IF NOT EXISTS channels (
    id         bigserial PRIMARY KEY,
    org_id     text NOT NULL REFERENCES organizations(id),
    name       text NOT NULL,
    type       text NOT NULL CHECK (type IN ('global', 'team', 'group', 'dm')),
    team_id    text REFERENCES teams(id),
    dm_key     text,                                     -- sorted participant ids, so a pair has one DM
    created_by text,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS channels_dm ON channels (org_id, dm_key) WHERE dm_key IS NOT NULL;
-- One #general per org and one channel per team were unique here; 005_workspace.sql replaces both with
-- channels_named (several org channels, several per team), so re-running this file must not re-create them.

-- Group and DM participants. Global = every active member, team = team_members + the lead (derived, not stored).
CREATE TABLE IF NOT EXISTS channel_members (
    channel_id bigint NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id    text NOT NULL REFERENCES users(id),
    org_id     text NOT NULL REFERENCES organizations(id),
    PRIMARY KEY (channel_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
    id               bigserial PRIMARY KEY,
    org_id           text NOT NULL REFERENCES organizations(id),
    channel_id       bigint NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    sender_id        text NOT NULL,                      -- a user id, or 'keystone' for the agent
    body             text NOT NULL,
    created_at       timestamptz NOT NULL DEFAULT now(),
    is_agent_drafted boolean NOT NULL DEFAULT false,
    approved_by      text,                               -- agent-drafted messages: the human who approved them
    ref_node_id      text                                -- a shared Keystone item (DEC-007), shown as a card
);
CREATE INDEX IF NOT EXISTS messages_channel ON messages (channel_id, id);

CREATE TABLE IF NOT EXISTS notifications (
    id         bigserial PRIMARY KEY,
    org_id     text NOT NULL REFERENCES organizations(id),
    user_id    text NOT NULL REFERENCES users(id),
    kind       text NOT NULL,                            -- mention, ping, join_request, action_proposed, ...
    ref_id     text,
    created_at timestamptz NOT NULL DEFAULT now(),
    read_at    timestamptz
);
CREATE INDEX IF NOT EXISTS notifications_user ON notifications (user_id, id DESC);

-- Agent-originated actions (ping_user, send_dm, post_to_channel). Only a human moves proposed -> approved; only the
-- executor moves approved -> executed.
CREATE TABLE IF NOT EXISTS proposed_actions (
    id          bigserial PRIMARY KEY,
    org_id      text NOT NULL REFERENCES organizations(id),
    tool        text NOT NULL CHECK (tool IN ('ping_user', 'send_dm', 'post_to_channel')),
    payload     jsonb NOT NULL,
    status      text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'approved', 'rejected', 'executed', 'failed')),
    proposed_by text NOT NULL,                           -- the user the agent acted for
    via         text NOT NULL DEFAULT 'web',             -- mcp when an MCP client drafted it
    created_at  timestamptz NOT NULL DEFAULT now(),
    decided_by  text,
    decided_at  timestamptz,
    executed_at timestamptz,
    result      jsonb
);

GRANT SELECT, INSERT, UPDATE, DELETE ON channels, channel_members, messages, notifications, proposed_actions
    TO keystone_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO keystone_app;
