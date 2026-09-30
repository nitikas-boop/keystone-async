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

# --- P2 --- (knowledge, conflicts, reasoning)
