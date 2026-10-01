-- Role-aware workspace: tiers and domains, domains on proposals and flags, resolvable flags, org channels with a
-- topic and privacy, per-user read state, member-proposed decisions, notification detail. Idempotent.

-- Tier (executive | lead | member) and domain (compliance | procurement | engineering | ops) per member. NULL tier is
-- derived from role and designation in app/permissions.py; NULL domain from the member's team.
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS tier text CHECK (tier IN ('executive', 'lead', 'member'));
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS domain text;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS domain text;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS description text;
UPDATE teams SET domain = 'engineering' WHERE id = 'team-engineering' AND domain IS NULL;
UPDATE teams SET domain = 'ops' WHERE id = 'team-operations' AND domain IS NULL;
UPDATE teams SET domain = 'compliance' WHERE id = 'team-compliance' AND domain IS NULL;
UPDATE memberships SET tier = 'executive' WHERE org_id = 'keystone' AND user_id IN ('ananya', 'karthik', 'nitika') AND tier IS NULL;
UPDATE memberships SET tier = 'lead', domain = 'ops' WHERE org_id = 'keystone' AND user_id = 'priya' AND tier IS NULL;
UPDATE memberships SET tier = 'lead', domain = 'compliance' WHERE org_id = 'keystone' AND user_id = 'farhan' AND tier IS NULL;

-- Every proposal, agent action and flag carries a domain; a lead approves only their own. proposed_by: who asked
-- (MCP proposals); the scanner's proposals have none.
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS domain text;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS proposed_by text;
ALTER TABLE flags ADD COLUMN IF NOT EXISTS domain text;
ALTER TABLE flags ADD COLUMN IF NOT EXISTS resolved_by text;
ALTER TABLE flags ADD COLUMN IF NOT EXISTS resolved_at timestamptz;
ALTER TABLE proposed_actions ADD COLUMN IF NOT EXISTS domain text NOT NULL DEFAULT 'ops';
UPDATE proposals SET domain = CASE split_part(clause_id, '-', 1) WHEN 'PROC' THEN 'procurement' WHEN 'RET' THEN 'compliance' END
 WHERE domain IS NULL;
UPDATE flags SET domain = CASE split_part(clause_id, '-', 1) WHEN 'PROC' THEN 'procurement' WHEN 'RET' THEN 'compliance' END
 WHERE domain IS NULL;

-- Channels: several org-wide channels (#general, #announcements, ...) and several per team. post_tier limits who may
-- post (announcements: executive). A private org channel is readable by its channel_members only.
ALTER TABLE channels ADD COLUMN IF NOT EXISTS topic text;
ALTER TABLE channels ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false;
ALTER TABLE channels ADD COLUMN IF NOT EXISTS post_tier text;
DROP INDEX IF EXISTS channels_global;
DROP INDEX IF EXISTS channels_team;
CREATE UNIQUE INDEX IF NOT EXISTS channels_named ON channels (org_id, coalesce(team_id, ''), name)
    WHERE type IN ('global', 'team');

CREATE TABLE IF NOT EXISTS read_state (
    user_id      text NOT NULL REFERENCES users(id),
    channel_id   bigint NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    last_read_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, channel_id)
);

-- A member proposes a decision; a lead of its domain (or an executive), never the proposer, accepts it into
-- ingestion or rejects it with a reason.
CREATE TABLE IF NOT EXISTS decision_proposals (
    id          bigserial PRIMARY KEY,
    org_id      text NOT NULL REFERENCES organizations(id),
    proposed_by text NOT NULL REFERENCES users(id),
    domain      text,
    title       text NOT NULL,
    markdown    text NOT NULL,
    status      text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'accepted', 'rejected')),
    decided_by  text,
    decided_at  timestamptz,
    reason      text,
    document_id text,
    created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS detail text;  -- e.g. the reviewer's reason for a rejection

GRANT SELECT, INSERT, UPDATE, DELETE ON read_state, decision_proposals TO keystone_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO keystone_app;
