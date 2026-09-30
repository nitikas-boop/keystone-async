"""Grounding gate for /ask, by name. Embedding cosine alone cannot decide "is this recorded?": with
nomic-embed-text an unrelated "Why did we choose MongoDB?" scores 0.84 against a bare project name, while the
AWS decision that answers "why did we move off AWS?" scores 0.75. Names separate them cleanly:
- a question naming something no record the asker may see mentions (MongoDB, Kubernetes, Joel) is refused.
  Capitalised names are found by pattern; the local model proposes names in any casing ("kubernetes"), and the
  records, not the model, decide whether each is known;
- records ranked by hybrid search whose title shares a content word with the question are retrieved even when
  their cosine is below the threshold ("why did we move off aws" -> "Move from AWS to ...")."""
import re

from . import config, db, graph, llm
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


async def model_names(question: str) -> list[str]:
    """Names the local model finds in any casing, kept only if they appear verbatim in the question (so it cannot
    add one). Model unavailable -> [] (the answer step then fails visibly anyway)."""
    try:
        out = await llm.chat_json(NAMES_PROMPT, question, {'type': 'object', 'required': ['names'], 'properties': {
            'names': {'type': 'array', 'items': {'type': 'string'}}}}, timeout=60)
    except Exception:
        return []
    q = (question or '').lower()
    return list(dict.fromkeys(n.strip() for n in out.get('names', [])
                              if isinstance(n, str) and n.strip() and n.strip().lower() in q
                              and not any(c.isdigit() for c in n) and n.strip().lower() not in STOP_LOWER))


async def unknown_terms(terms: list[str], reader: bool) -> list[str]:
    """Terms found in no document and no graph node this asker may see. A term known only from restricted
    records counts as unknown for a non-reader, so the refusal looks the same as for a term never recorded."""
    if not terms or db.pool is None or graph.g is None:
        return []
    pats = [r'\m' + re.escape(t) + r'\M' for t in terms]
    in_docs = {r['i'] for r in await db.pool.fetch(
        'SELECT i FROM generate_subscripts($1::text[], 1) i WHERE EXISTS (SELECT 1 FROM documents '
        "WHERE raw ~* ($1::text[])[i] AND (visibility = 'org' OR $2))", pats, reader)}
    rows = await graph.q('UNWIND range(0, size($ts) - 1) AS i MATCH (n:Entity {group_id: $g}) '
                         'WHERE (toLower(n.name) CONTAINS toLower($ts[i]) OR toLower(coalesce(n.role, "")) = toLower($ts[i])) '
                         'AND coalesce(n.rejected, false) = false AND (coalesce(n.visibility, "org") = "org" OR $r) '
                         'RETURN DISTINCT i', ts=terms, g=config.GROUP_ID, r=reader)
    known = in_docs | {r['i'] + 1 for r in rows}  # generate_subscripts is 1-based
    return [t for i, t in enumerate(terms, 1) if i not in known]


async def unrecorded(question: str, reader: bool) -> list[str]:
    """Names in the question that no visible record mentions; any -> refuse.
    Pattern names are strict (each must be known). A model-proposed name counts as unknown only when none of its
    words is known, so a loosely extracted "project atlas history" is still known through "atlas"."""
    strict = salient_terms(question)
    if unknown := await unknown_terms(strict, reader):
        return unknown
    seen = {t.lower() for t in strict}
    names = [n for n in await model_names(question) if n.lower() not in seen]
    words = {n: [w for w in WORD.findall(n) if len(w) > 2 and w.lower() not in FUNCTION] or [n] for n in names}
    missing = set(await unknown_terms(sorted({w for ws in words.values() for w in ws}), reader))
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
