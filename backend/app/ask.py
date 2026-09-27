"""/ask: as-of hybrid retrieval, relevance threshold, deterministic compliance context, per-sentence citations.

Delegates to ReasoningEngine and BaseRetrievalAdapter.
"""
from datetime import date
from typing import Any, Dict, Optional

from . import config
from .reasoning import LOW_CONFIDENCE, ReasoningEngine
from .retrieval import get_retrieval_adapter

RELEVANCE_MIN = float(config.E('RELEVANCE_MIN', '0.78'))

# Engine instance
_engine: Optional[ReasoningEngine] = None


def get_engine() -> ReasoningEngine:
    global _engine
    adapter = get_retrieval_adapter()
    if _engine is None or type(_engine.adapter) is not type(adapter):
        _engine = ReasoningEngine(adapter)
    return _engine


async def ask(question: str, as_of: date, actor: str, session_id: Optional[str] = None) -> Dict[str, Any]:
    """Execute temporal question answering pipeline."""
    engine = get_engine()
    return await engine.answer(question, as_of, actor=actor, session_id=session_id)
