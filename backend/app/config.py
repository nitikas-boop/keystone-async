import os

E = os.environ.get

DATABASE_URL = E('DATABASE_URL', 'postgresql://keystone_app:keystone_app_dev@localhost:5432/keystone')
NEO4J_URI = E('NEO4J_URI', 'bolt://localhost:7687')
NEO4J_USER = E('NEO4J_USER', 'neo4j')
NEO4J_PASSWORD = E('NEO4J_PASSWORD', 'keystone-dev-pw')

OLLAMA_BASE_URL = E('OLLAMA_BASE_URL', 'http://localhost:11434')
EXTRACT_OLLAMA_URL = E('EXTRACT_OLLAMA_URL', OLLAMA_BASE_URL)
ANSWER_MODEL = E('ANSWER_MODEL', 'qwen3:8b')
EXTRACT_MODEL = E('EXTRACT_MODEL', 'qwen3:14b')
EMBED_MODEL = E('EMBED_MODEL', 'nomic-embed-text')
EMBEDDING_DIM = int(E('EMBEDDING_DIM', '768'))

GROUP_ID = E('GROUP_ID', 'keystone')
VAULT_DIR = E('VAULT_DIR', 'data/vault')
OUTBOX_DIR = E('OUTBOX_DIR', 'outbox')
