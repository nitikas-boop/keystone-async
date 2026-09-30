-- Person 1 (B): jurisdiction. Idempotent.
-- assigned_projects: an employee (member) with projects set sees only those projects' items, their department's
--   policies and the org chart; NULL keeps the team scope. approval_authority_inr: the largest amount this person
--   may approve (NULL = no ceiling). A team's policies make its department the owner of those policy ids.

ALTER TABLE memberships ADD COLUMN IF NOT EXISTS assigned_projects text[];
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS approval_authority_inr bigint;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS policies text[] NOT NULL DEFAULT '{}';

-- The demo org (id = GROUP_ID 'keystone'), when it is already seeded: department policies and approval ceilings.
UPDATE teams SET policies = '{POL-PROC}' WHERE id = 'team-operations' AND policies = '{}';
UPDATE teams SET policies = '{POL-RET}' WHERE id = 'team-compliance' AND policies = '{}';
UPDATE memberships SET approval_authority_inr = 500000
 WHERE org_id = 'keystone' AND role = 'lead' AND approval_authority_inr IS NULL;
UPDATE memberships SET approval_authority_inr = 0
 WHERE org_id = 'keystone' AND role = 'member' AND approval_authority_inr IS NULL;
