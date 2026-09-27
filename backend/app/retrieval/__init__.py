"""Retrieval module for Keystone."""
from typing import Optional

from .. import config
from .base import BaseRetrievalAdapter, EdgeRecord, NodeRecord, RetrievalResult, SourceRecord
from .graphiti import GraphitiRetrievalAdapter
from .synthetic import SyntheticRetrievalAdapter


def get_retrieval_adapter(mode: Optional[str] = None) -> BaseRetrievalAdapter:
    """Factory to retrieve either the temporary synthetic adapter or production Graphiti adapter.
    
    If mode is None, reads KEYSTONE_RETRIEVAL_ADAPTER env var (defaults to 'synthetic' if graphiti not ready,
    or 'graphiti' if explicitly configured).
    """
    adapter_mode = (mode or config.E('KEYSTONE_RETRIEVAL_ADAPTER', 'synthetic')).lower()
    if adapter_mode == 'graphiti':
        return GraphitiRetrievalAdapter()
    return SyntheticRetrievalAdapter()


__all__ = [
    'BaseRetrievalAdapter',
    'NodeRecord',
    'EdgeRecord',
    'SourceRecord',
    'RetrievalResult',
    'SyntheticRetrievalAdapter',
    'GraphitiRetrievalAdapter',
    'get_retrieval_adapter'
]
