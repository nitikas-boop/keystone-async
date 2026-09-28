# 16k context for `qwen2.5:7b`

**Team decision:** `qwen2.5:7b` for both extraction and reasoning, run as **`qwen2.5-7b-16k`** (the same weights with `num_ctx 16384`).

I haven't touched `llm.py`, `extract.py` or `config.py`; those are yours. This note covers why the change is needed, how to create the model, and the exact lines to point at it.

## Why: Ollama truncates silently

Ollama runs every model with a fixed context window (`num_ctx`). The default is 4096, and on some versions or hardware it's lower. A longer prompt doesn't cause an error: Ollama **drops tokens from the front of the prompt**. The only signal is a `truncating input prompt` line in the Ollama server log. The front of the prompt is where our system prompt, the known-entities list and the start of the meeting note sit. The model still answers confidently; it just never saw that part.

This matters to us because an extraction prompt (known entities + a meeting note) and an `/ask` prompt (retrieved sources + subgraph + instructions) can both go past 4k tokens as the graph grows.

Measured on this machine (Ollama 0.33.3) with `scripts/check_context.py`. The script puts a secret code at the start of a ~10k-token prompt and asks the model to repeat it:

```
        qwen2.5:7b: prompt_eval_count=2050  code returned=False  TRUNCATED  answer='0358'
    qwen2.5-7b-16k: prompt_eval_count=9965  code returned=True  full prompt  answer='KESTREL-4711'
```

The default model evaluated 2,050 of about 9,965 tokens and lost the start of the prompt without any error.

## How to create the model (once per machine that runs Ollama)

```sh
sh scripts/create_models.sh        # pulls qwen2.5:7b if missing, creates qwen2.5-7b-16k, checks num_ctx 16384
python3 scripts/check_context.py   # exit 0 = the 16k model saw the whole >4k-token prompt
```

The Modelfile is `ollama/Modelfile.qwen2.5-7b-16k`:

```
FROM qwen2.5:7b
PARAMETER num_ctx 16384
```

The script calls the host's Ollama at `http://localhost:11434`. Pass `--url` or set `OLLAMA_URL` to check another machine, e.g. the extraction box over the LAN. The 16k window costs roughly 1 GB of extra KV-cache memory for a 7B model (28 layers × 4 KV heads × 128 dims, fp16 ≈ 56 KB per token).

## What to change (pick A; B is optional on top)

### A. Point the model settings at `qwen2.5-7b-16k` (recommended, covers everything)

`backend/app/config.py` already reads both names from the environment:

```python
ANSWER_MODEL = E('ANSWER_MODEL', 'qwen3:8b')     # config.py line 12
EXTRACT_MODEL = E('EXTRACT_MODEL', 'qwen3:14b')  # config.py line 13
```

`docker-compose.yml` passes `ANSWER_MODEL` and `EXTRACT_MODEL` through from `.env`. So either:

- set them in `.env`. The commented lines are already at the bottom of `.env.example`, so just uncomment:
  ```
  ANSWER_MODEL=qwen2.5-7b-16k
  EXTRACT_MODEL=qwen2.5-7b-16k
  ```
- or change the two defaults in `config.py` to `'qwen2.5-7b-16k'`, which is your call as the owner of that file. If you do, also change the `ANSWER_MODEL`/`EXTRACT_MODEL` defaults in `docker-compose.yml`: compose always sets those variables, so its `qwen3:*` defaults would override `config.py`.

This covers every model call. That includes `llm.chat_json` (extraction and `explain`), and also Graphiti's clients in `graph.make()` (`LLMConfig(model=config.ANSWER_MODEL, ...)`). Graphiti talks to Ollama through the OpenAI-compatible `/v1` endpoint, which **cannot** pass `num_ctx`. That's why baking the context into the model with a Modelfile is the route that works everywhere.

After switching, `backend/tests/test_pipeline.py` (line 142) asserts `p['extracted_by'] == 'qwen3:8b'`. That assertion needs to become `config.EXTRACT_MODEL`, or the new name.

`/health` already works with the new name: it accepts `qwen2.5-7b-16k:latest`.

### B. Also pass `num_ctx` per request in `llm.py` (optional belt-and-braces)

In `llm.chat_json`, the request body currently has `'options': {'temperature': 0}`. Changing it to

```python
'options': {'temperature': 0, 'num_ctx': int(config.E('OLLAMA_NUM_CTX', '16384'))},
```

makes every `/api/chat` call request 16k, even against a plain `qwen2.5:7b`. It does **not** cover Graphiti's `/v1` calls, so do A anyway. `OLLAMA_NUM_CTX` isn't read anywhere yet; the commented line in `.env.example` is there for this option.

## Notes

- `llm.chat_json` sends `think: false` (meant for qwen3). I checked that `qwen2.5-7b-16k` accepts that exact request shape: `think: false` plus a JSON-schema `format` returns valid JSON.
- The embeddings model (`nomic-embed-text`) is unaffected.
- Don't let a truncating model near the final seed. Run `check_context.py` on the lead's machine before the seed.
