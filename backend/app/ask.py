"""/ask: as-of hybrid retrieval, relevance threshold, deterministic compliance context, per-sentence citations.

Delegates to ReasoningEngine and BaseRetrievalAdapter.
"""
from datetime import date
from typing import Any, Dict, Optional

from . import config
from .reasoning import LOW_CONFIDENCE, ReasoningEngine
from .retrieval import get_retrieval_adapter

RELEVANCE_MIN = float(config.E('RELEVANCE_MIN', '0.78'))

# Global engine instance
_engine = ReasoningEngine(get_retrieval_adapter())


async def ask(question: str, as_of: date, actor: str, session_id: Optional[str] = None) -> Dict[str, Any]:
    """Execute temporal question answering pipeline."""
    return await _engine.answer(question, as_of, actor=actor, session_id=session_id)
