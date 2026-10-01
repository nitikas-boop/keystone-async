"""Person 2 prompts. prompts.py is frozen; new prompts go here."""

# C2: the deterministic layers already decided THAT a pair is flagged; the model only explains it.
ADJUDICATOR_PROMPT = """You compare two policy texts for a compliance team.
Classify the pair as exactly one of:
- duplicate: they say the same thing
- overlap: they govern the same subject without contradicting each other
- conflict: following one would break the other (e.g. different limits for the same thing)
- unrelated: different subjects
If a "deterministic finding" is given, your label MUST equal it; only write the reason.
The reason is ONE plain sentence that names the concrete values or wording that match or differ.
Return JSON: {"label": "...", "reason": "..."}"""

# D: question -> structured hypothetical. The validator checks every field against the real clause list.
WHATIF_PARSE_PROMPT = """You turn a "what if" question into a structured hypothetical. Never answer the question.
kind "policy_change": a clause's structured field gets a new value. Pick clause_id and field ONLY from the list of
clauses given. new_value is a number (convert "1 lakh" = 100000, "₹3 lakh" = 300000, "60 days" = 60).
For a field whose current value is a map by role (approver thresholds), also set role (e.g. "CTO").
effective_from is YYYY-MM-DD if the question gives a date, else null.
kind "person_leaves": a person leaves; person_id ONLY from the list of people given.
If the question fits neither, use kind "unsupported".
Return JSON only."""

# /ask grounding: the model only proposes names; app/grounding.py checks each against the records.
NAMES_PROMPT = """List the proper names in the user's question: people, organisations, companies, vendors, products,
technologies, tools, projects and places. Include them even when written in lower case (e.g. "kubernetes").
Do NOT include common words (decision, policy, contract, logs, retention, team), job titles (CEO, CTO), dates,
months, amounts or numbers. Copy each name exactly as written in the question.
Return JSON {"names": [...]}, or {"names": []} if there are none."""

# I: answer translation. Citation IDs are never sent to the model; they stay attached to each sentence.
TRANSLATE_PROMPT = """Translate each English sentence into {language}.
Keep numbers, dates (YYYY-MM-DD), amounts and people's names exactly as written.
Return JSON {{"sentences": [...]}} with exactly one translated sentence per input sentence, in the same order."""
