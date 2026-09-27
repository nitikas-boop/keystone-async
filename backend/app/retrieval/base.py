"""Retrieval Adapter Interface for Keystone.

Provides an abstract interface for retrieving knowledge graph nodes, edges,
and document source passages valid as of a specific point in time.

The reasoning layer consumes this interface directly, allowing the temporary
synthetic Nimbus Ledger adapter to be swapped with Member 1's real Graphiti/Neo4j
retrieval without changing any reasoning logic.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import date
from typing import Any, Dict, List, Optional


@dataclass
class NodeRecord:
    id: str
    type: str
    label: str
    valid_from: Optional[str] = None
    valid_to: Optional[str] = None
    created_at: Optional[str] = None
    attributes: Dict[str, Any] = field(default_factory=dict)
    provenance: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            'id': self.id,
            'type': self.type,
            'label': self.label,
            'valid_from': self.valid_from,
            'valid_to': self.valid_to,
            'created_at': self.created_at,
            'attributes': self.attributes,
            'provenance': self.provenance,
        }


@dataclass
class EdgeRecord:
    id: str
    source: str
    target: str
    relation: str
    fact: str
    valid_from: Optional[str] = None
    valid_to: Optional[str] = None
    created_at: Optional[str] = None
    provenance: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            'id': self.id,
            'source': self.source,
            'target': self.target,
            'relation': self.relation,
            'fact': self.fact,
            'valid_from': self.valid_from,
            'valid_to': self.valid_to,
            'created_at': self.created_at,
            'provenance': self.provenance,
        }


@dataclass
class SourceRecord:
    id: str
    text: str
    node: Optional[Dict[str, Any]] = None
    doc_path: Optional[str] = None
    source_span: Optional[Dict[str, Any]] = None


@dataclass
class RetrievalResult:
    as_of: str
    question: str
    seed_keys: List[str]
    nodes: List[NodeRecord]
    edges: List[EdgeRecord]
    sources: Dict[str, SourceRecord]
    ranked_scores: List[Dict[str, Any]] = field(default_factory=list)
    relevance_threshold: float = 0.66

    @property
    def is_empty(self) -> bool:
        return len(self.seed_keys) == 0 or len(self.nodes) == 0


class BaseRetrievalAdapter(ABC):
    """Abstract retrieval boundary."""

    @abstractmethod
    async def retrieve(self, question: str, as_of: date) -> RetrievalResult:
        """Retrieve point-in-time subgraph and sources relevant to question."""
        pass

    @abstractmethod
    async def get_node(self, node_id: str, as_of: Optional[date] = None) -> Optional[NodeRecord]:
        """Fetch a specific node by ID."""
        pass

    @abstractmethod
    async def get_clause_in_force(self, clause_id: str, on_date: date) -> Optional[Dict[str, Any]]:
        """Fetch the policy clause version in force on a given date."""
        pass
