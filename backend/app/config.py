import os
from pathlib import Path

# Load .env if present (root or backend)
def _load_env():
    for p in [Path('.env'), Path(__file__).resolve().parent.parent / '.env', Path(__file__).resolve().parent.parent.parent / '.env']:
        if p.is_file():
            # An unreadable .env must fail loudly, not silently run with defaults.
            for line in p.read_text(encoding='utf-8').splitlines():
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, v = line.split('=', 1)
                    os.environ.setdefault(k.strip(), v.strip().strip('"\''))
            break

_load_env()

E = os.environ.get

DATABASE_URL = E('DATABASE_URL', 'postgresql://keystone_app:keystone_app_dev@localhost:5432/keystone')
NEO4J_URI = E('NEO4J_URI', 'bolt://localhost:7687')
NEO4J_USER = E('NEO4J_USER', 'neo4j')
NEO4J_PASSWORD = E('NEO4J_PASSWORD', 'keystone-dev-pw')

OLLAMA_BASE_URL = E('OLLAMA_BASE_URL', 'http://localhost:11434')
EXTRACT_OLLAMA_URL = E('EXTRACT_OLLAMA_URL', OLLAMA_BASE_URL)
ANSWER_MODEL = E('ANSWER_MODEL', 'qwen2.5-7b-16k')
EXTRACT_MODEL = E('EXTRACT_MODEL', 'qwen2.5-7b-16k')
EMBED_MODEL = E('EMBED_MODEL', 'nomic-embed-text')
EMBEDDING_DIM = int(E('EMBEDDING_DIM', '768'))

GROUP_ID = E('GROUP_ID', 'keystone')
VAULT_DIR = E('VAULT_DIR', 'data/vault')
OUTBOX_DIR = E('OUTBOX_DIR', 'outbox')
KEYSTONE_RETRIEVAL_ADAPTER = E('KEYSTONE_RETRIEVAL_ADAPTER', 'graphiti')

# ponytail: visibility filter by user list; full RBAC / source-level ACLs are roadmap
RESTRICTED_READERS = set(E('RESTRICTED_READERS', 'nitika,farhan,ananya').split(','))
WHISPER_MODEL = E('WHISPER_MODEL', 'base.en')

# Browser origins allowed to call the API with the session cookie. Default: any localhost port.
CORS_ORIGIN_REGEX = E('CORS_ORIGIN_REGEX', r'http://(localhost|127\.0\.0\.1)(:\d+)?')

# --- P1 --- (access, identity, comms)
# Signs the session JWT. Unset: a random key per process start, so a restart signs everyone out.
JWT_SECRET = E('JWT_SECRET') or os.urandom(32).hex()
SESSION_HOURS = int(E('SESSION_HOURS', '8'))
DEVICE_SESSION_DAYS = int(E('DEVICE_SESSION_DAYS', '30'))
# Dev-only: X-User header sign-in (tests and scripts). Never set on a real deployment.
DEV_AUTH = E('KEYSTONE_DEV_AUTH') == '1'
# On an empty organizations table the backend creates the synthetic Nimbus Ledger org and its demo users
# (identity.DEMO_USERS), all with DEMO_PASSWORD, joinable with DEMO_JOIN_CODE. Set DEMO_SEED=0 to start empty.
DEMO_SEED = E('DEMO_SEED', '1') == '1'
DEMO_PASSWORD = E('DEMO_PASSWORD', 'nimbus-demo-2026')
DEMO_JOIN_CODE = E('DEMO_JOIN_CODE', 'NMBL-7K2Q')
# One-click sign-in buttons for the demo accounts (still only while their password is DEMO_PASSWORD). Demo only.
DEMO_LOGIN = E('DEMO_LOGIN', '1' if DEMO_SEED else '0') == '1'
PAIRING_TTL_SECONDS = int(E('PAIRING_TTL_SECONDS', '60'))

# --- P2 --- (knowledge, conflicts, reasoning)
KEYSTONE_DIR = E('KEYSTONE_DIR', 'data/keystone')        # L2 sign-in scan root: Organisation/, Team/<name>/, Groups/<name>/
AUDIO_DIR = E('AUDIO_DIR', 'audio_store')                  # F: uploaded meeting audio (raw audio is deletable)
MODEL_KEEP_ALIVE = E('MODEL_KEEP_ALIVE', '30m')            # L1: Ollama keep_alive while a session is active
MODEL_IDLE_MINUTES = float(E('MODEL_IDLE_MINUTES', '15'))  # L1: unload after this long with no heartbeat
SCAN_MAX_FILES = int(E('SCAN_MAX_FILES', '500'))           # L2: cap per scan; the next scan picks up the rest
ANSWER_LANGUAGE = E('ANSWER_LANGUAGE', 'hi')               # I: the one extra answer language (Hindi)
