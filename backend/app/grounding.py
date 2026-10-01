"""Grounding gate for /ask, by name. Embedding cosine alone cannot decide "is this recorded?": with
nomic-embed-text an unrelated "Why did we choose MongoDB?" scores 0.84 against a bare project name, while the
AWS decision that answers "why did we move off AWS?" scores 0.75. Names separate them cleanly:
- a question naming something no record the asker may see mentions (MongoDB, Kubernetes, Joel) is refused.
  Capitalised names are found by pattern; the local model proposes names in any casing ("kubernetes"), and the
  records, not the model, decide whether each is known;
- records ranked by hybrid search whose title shares a content word with the question are retrieved even when
  their cosine is below the threshold ("why did we move off aws" -> "Move from AWS to ...")."""
import re

from . import access, db, graph, llm
from .prompts_p2 import NAMES_PROMPT

# Words that name dates or the app itself, not recorded subjects; digits (2025, Q2, ₹4) are handled by as-of logic.
STOP = {'I', 'Keystone', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
        'October', 'November', 'December', 'Jan', 'Feb', 'Mar', 'Apr', 'Jun', 'Jul', 'Aug', 'Sep', 'Sept', 'Oct',
        'Nov', 'Dec', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
        # currency and amount words ("Rs 4 lakh"): the records write ₹ and digits
        'Rs', 'INR', 'USD', 'Rupee', 'Rupees', 'Lakh', 'Lakhs', 'Crore', 'Crores'}
STOP_LOWER = {w.lower() for w in STOP}
# Question and function words: never evidence that a record is about the question.
FUNCTION = set('why what who whom whose when where which how did does do done was were is are be been being the a an '
               'and or but for with from off our ours we us you your they them their this that these those it its of '
               'in on at to by into onto about any all can could would should will shall may might must has have '
               'had not no yes show tell give list me my i there here then than also just only ever still'.split())
WORD = re.compile(r"[A-Za-z][A-Za-z0-9&-]*[A-Za-z0-9]|[A-Za-z]")


def salient_terms(question: str) -> list[str]:
    """Names in the question: capitalised or mixed-case words after the first word (which is capitalised anyway)."""
    out = []
    for i, w in enumerate(WORD.findall(question or '')):
        if i and w[0].isupper() and w not in STOP and not any(c.isdigit() for c in w):
            out.append(w)
    return list(dict.fromkeys(out))


def content_words(question: str) -> list[str]:
    """Lower-cased words that can tie a question to a record title (for seeding, any casing)."""
    return list(dict.fromkeys(w.lower() for w in WORD.findall(question or '')
                              if len(w) > 2 and w.lower() not in FUNCTION and w.lower() not in STOP_LOWER
                              and not any(c.isdigit() for c in w)))


_NAMES: dict[str, list[str]] = {}  # question -> model names: the jurisdiction check asks twice (asker, then org-wide)


async def model_names(question: str) -> list[str]:
    """Names the local model finds in any casing, kept only if they appear verbatim in the question (so it cannot
    add one). Model unavailable -> [] (the answer step then fails visibly anyway)."""
    if question in _NAMES:
        return _NAMES[question]
    try:
        out = await llm.chat_json(NAMES_PROMPT, question, {'type': 'object', 'required': ['names'], 'properties': {
            'names': {'type': 'array', 'items': {'type': 'string'}}}}, timeout=60)
    except Exception:
        return []
    q = (question or '').lower()
    names = list(dict.fromkeys(n.strip() for n in out.get('names', [])
                               if isinstance(n, str) and n.strip() and n.strip().lower() in q
                               and not any(c.isdigit() for c in n) and n.strip().lower() not in STOP_LOWER))
    if len(_NAMES) > 64:
        _NAMES.clear()
    _NAMES[question] = names
    return names


async def unknown_terms(terms: list[str], user: dict | None) -> list[str]:
    """Terms found in no document and no graph node this asker may see (the access check, B; user None = a system
    process, which sees everything). A term known only from hidden records counts as unknown, so the refusal looks
    the same as for a term never recorded."""
    if not terms or db.pool is None or graph.g is None:
        return []
    ok = access.visible_filter(user)
    pats = [r'\m' + re.escape(t) + r'\M' for t in terms]
    docs = await db.pool.fetch('SELECT i, d.id, d.front_matter, d.visibility FROM generate_subscripts($1::text[], 1) i '
                               'JOIN documents d ON d.raw ~* ($1::text[])[i]', pats)
    in_docs = {r['i'] for r in docs if ok({**(r['front_matter'] or {}), 'key': r['id'], 'visibility': r['visibility']})}
    rows = await graph.q('UNWIND range(0, size($ts) - 1) AS i MATCH (n:Entity {group_id: $g}) '
                         'WHERE (toLower(n.name) CONTAINS toLower($ts[i]) OR toLower(coalesce(n.role, "")) = toLower($ts[i])) '
                         'AND coalesce(n.rejected, false) = false '
                         'RETURN i, n {.key, .type, .project, .team, .policy_id, .visibility, .decided_on, .meeting_date, '
                         '.valid_from} AS p', ts=terms, g=graph.gid())
    known = in_docs | {r['i'] + 1 for r in rows if ok(r['p'])}  # generate_subscripts is 1-based
    return [t for i, t in enumerate(terms, 1) if i not in known]


async def unrecorded(question: str, user: dict | None) -> list[str]:
    """Names in the question that no visible record mentions; any -> refuse.
    Pattern names are strict (each must be known). A model-proposed name counts as unknown only when none of its
    words is known, so a loosely extracted "project atlas history" is still known through "atlas"."""
    strict = salient_terms(question)
    if unknown := await unknown_terms(strict, user):
        return unknown
    seen = {t.lower() for t in strict}
    names = [n for n in await model_names(question) if n.lower() not in seen]
    words = {n: [w for w in WORD.findall(n) if len(w) > 2 and w.lower() not in FUNCTION] or [n] for n in names}
    missing = set(await unknown_terms(sorted({w for ws in words.values() for w in ws}), user))
    return [n for n, ws in words.items() if all(w in missing for w in ws)]


if __name__ == '__main__':
    assert salient_terms('Why did we choose MongoDB?') == ['MongoDB']
    assert salient_terms('Why did we move off AWS in May 2025?') == ['AWS']
    assert salient_terms('Was the ₹4 lakh VendorCo contract approved correctly in March 2025?') == ['VendorCo']
    assert salient_terms('Was the Rs 4 lakh VendorCo contract approved correctly in March 2025?') == ['VendorCo']
    assert salient_terms('Was keeping customer logs for 180 days compliant in Q2 2025?') == []
    assert salient_terms('Show the history of Project Atlas.') == ['Project', 'Atlas']
    assert salient_terms("Why did Karthik's team pick the India-hosted provider?") == ['Karthik', 'India-hosted']
    assert content_words('why did we move off aws in may 2025?') == ['move', 'aws']
    print('grounding self-check ok')
