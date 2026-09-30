-- Commit 0: the audit log accepts both people's event names (KEYSTONE-BUILD-SPLIT.md sections 2, 3 and 5).
-- The enum CHECKs become a name pattern, so neither branch has to re-create the other's list; `user:<id>:mcp`
-- (proposals made through the MCP server) and any `system:<process>` actor become valid.
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_actor_check;
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_action_check;
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_object_type_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_actor_check
    CHECK (actor ~ '^(user:[a-z0-9_.-]+(:mcp)?|system:[a-z_]+|executor)$');
ALTER TABLE audit_log ADD CONSTRAINT audit_log_action_check CHECK (action ~ '^[a-z_]{2,40}$');
ALTER TABLE audit_log ADD CONSTRAINT audit_log_object_type_check CHECK (object_type ~ '^[a-z_]{2,40}$');
