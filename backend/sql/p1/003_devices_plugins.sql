-- Person 1 (H, G): linked phones, one-time pairing tokens, plugin on/off state. Idempotent.

CREATE TABLE IF NOT EXISTS linked_devices (
    id         bigserial PRIMARY KEY,
    org_id     text NOT NULL REFERENCES organizations(id),
    user_id    text NOT NULL REFERENCES users(id),
    label      text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_seen  timestamptz,
    revoked_at timestamptz
);

CREATE TABLE IF NOT EXISTS pairing_tokens (
    token_hash text PRIMARY KEY,                         -- sha256 of the token in the QR; plaintext is never stored
    org_id     text NOT NULL REFERENCES organizations(id),
    user_id    text NOT NULL REFERENCES users(id),
    expires_at timestamptz NOT NULL,
    used_at    timestamptz,
    device_id  bigint REFERENCES linked_devices(id)
);

CREATE TABLE IF NOT EXISTS plugin_state (
    org_id     text NOT NULL REFERENCES organizations(id),
    plugin_id  text NOT NULL,
    enabled    boolean NOT NULL,
    updated_by text,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (org_id, plugin_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON linked_devices, pairing_tokens, plugin_state TO keystone_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO keystone_app;
