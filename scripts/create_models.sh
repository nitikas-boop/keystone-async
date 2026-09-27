#!/usr/bin/env sh
# Creates qwen2.5-7b-16k (qwen2.5:7b with num_ctx 16384) in the local Ollama and verifies it.
# Run on the machine that runs Ollama:  sh scripts/create_models.sh
set -eu
cd "$(dirname "$0")/.."
MODEL=qwen2.5-7b-16k
BASE=qwen2.5:7b

command -v ollama >/dev/null 2>&1 || { echo "ollama CLI not found on PATH" >&2; exit 1; }
if ! ollama show "$BASE" >/dev/null 2>&1; then
  echo "pulling $BASE ..."
  ollama pull "$BASE"
fi
ollama create "$MODEL" -f ollama/Modelfile.qwen2.5-7b-16k
if ollama show "$MODEL" --parameters | grep -Eq '^[[:space:]]*num_ctx[[:space:]]+16384[[:space:]]*$'; then
  echo "OK: $MODEL has num_ctx 16384"
else
  echo "FAILED: $MODEL does not report num_ctx 16384:" >&2
  ollama show "$MODEL" --parameters >&2
  exit 1
fi
