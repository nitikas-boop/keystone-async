-- Commit 0 (shared, frozen): the agreed audit event names and object types for both people.
-- Idempotent: widens the audit_log CHECK constraints from init.sql. Applied before sql/p1/ and sql/p2/.
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_action_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_action_check CHECK (action IN (
    -- existing
    'query', 'flag_created', 'action_proposed', 'approved', 'rejected', 'executed', 'edited',
    'extraction_reviewed', 'policy_ingested',
    -- Person 1
    'join_requested', 'join_approved', 'code_rotated', 'device_paired', 'access_granted', 'restricted_view',
    'agent_message_proposed', 'agent_message_sent',
    -- Person 2
    'claim_created', 'claim_blocked', 'claim_overridden', 'collision_resolved', 'proposal_approved',
    'proposal_rejected', 'policy_proposed', 'simulation_run', 'dir_scan_started', 'dir_scan_completed',
    'file_access_removed'));

ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_object_type_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_object_type_check CHECK (object_type IN (
    'decision', 'flag', 'proposal', 'answer', 'extraction', 'policy_version',
    -- Person 1
    'organization', 'user', 'membership', 'device', 'channel', 'message', 'proposed_action',
    -- Person 2
    'claim', 'collision', 'policy_proposal', 'simulation', 'scan_run', 'file'));

-- system:<process> actors (e.g. system:session for background jobs started at sign-in).
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_actor_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_actor_check
    CHECK (actor ~ '^(user:[a-z0-9_.-]+(:mcp)?|system:[a-z_]+|executor)$');
