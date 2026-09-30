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

# --- P1 ---

# --- P2 ---
KEYSTONE_DIR = E('KEYSTONE_DIR', 'data/keystone')        # L2 sign-in scan root: Organisation/, Team/<name>/, Groups/<name>/
AUDIO_DIR = E('AUDIO_DIR', 'audio_store')                  # F: uploaded meeting audio (raw audio is deletable)
MODEL_KEEP_ALIVE = E('MODEL_KEEP_ALIVE', '30m')            # L1: Ollama keep_alive while a session is active
MODEL_IDLE_MINUTES = float(E('MODEL_IDLE_MINUTES', '15'))  # L1: unload after this long with no heartbeat
SCAN_MAX_FILES = int(E('SCAN_MAX_FILES', '500'))           # L2: cap per scan; the next scan picks up the rest
ANSWER_LANGUAGE = E('ANSWER_LANGUAGE', 'hi')               # I: the one extra answer language (Hindi)
