"""Short-Term Conversational Memory for Keystone.

Maintains approximately the last 4-6 conversation turns per session.
Note: Long-term organizational memory is strictly the temporal knowledge graph.
Mem0 / Letta are explicitly disallowed per architectural specification.
"""
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, List, Optional


@dataclass
class ConversationTurn:
    role: str  # 'user' | 'assistant'
    content: str
    as_of: Optional[str] = None
    citations: List[str] = field(default_factory=list)
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


class ShortTermMemory:
    """Manages a sliding window of recent conversation turns."""

    def __init__(self, max_turns: int = 6):
        self.max_turns = max_turns
        self.sessions: Dict[str, List[ConversationTurn]] = {}

    def add_turn(self, session_id: str, role: str, content: str, as_of: Optional[str] = None, citations: Optional[List[str]] = None):
        if session_id not in self.sessions:
            self.sessions[session_id] = []
        turns = self.sessions[session_id]
        turns.append(ConversationTurn(
            role=role,
            content=content,
            as_of=as_of,
            citations=citations or []
        ))
        # Keep sliding window of max_turns
        if len(turns) > self.max_turns:
            self.sessions[session_id] = turns[-self.max_turns:]

    def get_history(self, session_id: str) -> List[ConversationTurn]:
        return list(self.sessions.get(session_id, []))

    def format_for_prompt(self, session_id: str) -> str:
        turns = self.get_history(session_id)
        if not turns:
            return ""
        lines = ["Recent conversation context:"]
        for t in turns:
            prefix = "User" if t.role == 'user' else "Keystone"
            lines.append(f"{prefix}: {t.content}")
        return "\n".join(lines)

    def clear(self, session_id: Optional[str] = None):
        if session_id:
            self.sessions.pop(session_id, None)
        else:
            self.sessions.clear()


# Global memory manager instance
conversation_memory = ShortTermMemory(max_turns=6)
