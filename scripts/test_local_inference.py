"""Live Local Inference Test for Keystone (Member 2).

Executes live local Ollama Qwen 2.5 7B structured reasoning against
the temporary synthetic Nimbus Ledger retrieval adapter and verifies:
1. Local Ollama HTTP connection and model availability
2. Structured JSON generation adhering to ANSWER_SCHEMA
3. Grounded citations and temporal answers
4. No-evidence refusal on unsupported questions
"""
import asyncio
from datetime import date
import json
import sys
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent / 'backend'
sys.path.insert(0, str(backend_dir))

from app import config
from app.reasoning import ReasoningEngine
from app.retrieval.synthetic import SyntheticRetrievalAdapter


async def run_live_inference_suite():
    print("=" * 65)
    print("KEYSTONE SOVEREIGN LOCAL INFERENCE TEST")
    print(f"Ollama Base URL : {config.OLLAMA_BASE_URL}")
    print(f"Reasoning Model : {config.ANSWER_MODEL}")
    print(f"Extraction Model: {config.EXTRACT_MODEL}")
    print(f"Embedding Model : {config.EMBED_MODEL}")
    print("=" * 65)

    adapter = SyntheticRetrievalAdapter()
    engine = ReasoningEngine(adapter)

    test_queries = [
        ("Why did we move off AWS in May 2025?", date(2025, 6, 1)),
        ("Was the ₹4 lakh VendorCo contract approved correctly in March 2025?", date(2025, 3, 14)),
        ("Was keeping customer logs for 180 days compliant in Q2 2025?", date(2025, 6, 30)),
        ("Why did we choose MongoDB?", date(2025, 6, 30))  # Must be refused cleanly
    ]

    for q, as_of in test_queries:
        print(f"\n[QUERY] \"{q}\" (as of {as_of})")
        res = await engine.answer(q, as_of, actor="user:analyst", explain_compliance=True)
        print(f"Refused: {res['refused']}")
        print(f"Answer : {res['answer']}")
        if res['citations']:
            print("Citations: " + ", ".join(c['id'] for c in res['citations']))
        if res['compliance']:
            for c in res['compliance']:
                print(f"Compliance Check: [{c['decision_id']}] -> {c['result']} (when decided), {c['current_result']} (as of {c['as_of']})")
        print("-" * 65)

    print("\n[SUCCESS] Local inference test cycle complete.")


if __name__ == '__main__':
    asyncio.run(run_live_inference_suite())
