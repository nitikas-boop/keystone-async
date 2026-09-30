// Lineage cards: the compact hover card (a chain like DEC-007 → Reason → RET-2.1 v2 → 'max 180 days' →
// MTG-2025-06-11) and the vertical "Explain" card with the cited clause and the butter-highlighted source sentence.
import { ArrowRight, ArrowDown } from 'lucide-react';
import { lineage, byId, RULE, DEC007_SOURCE } from './graphData';

export function LineageChip({ node, style }) {
  const steps = lineage(node.id);
  return (
    <div className="kb-lineage" style={style} role="status" aria-live="polite">
      <div className="kb-lineage__head">
        <span className="kb-mono-label">{node.kind === 'evidence' ? 'meeting note' : node.kind === 'policy' ? 'policy version' : node.kind}</span>
        {node.date && <span className="kb-mono-label">{node.date}</span>}
      </div>
      <div className="kb-lineage__title">{node.title}</div>
      <ol className="kb-lineage__chain">
        {steps.map((s, i) => (
          <li key={i} title={s.sub}>
            {i > 0 && <ArrowRight size={11} aria-hidden="true" className="kb-lineage__arrow" />}
            <span className={`kb-lineage__step kb-lineage__step--${s.kind}`}>{s.text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// Story step 6: why DEC-007 existed, top to bottom.
export function ExplainCard() {
  const d = byId('DEC-007');
  const m = byId(DEC007_SOURCE.meeting);
  const rows = [
    { k: 'Decision', id: d.id, text: d.title, meta: `${d.date} · ${byId(d.owner).title}` },
    { k: 'Reason', text: d.reason },
    { k: 'Rule relied on', id: 'RET-2.1 v2', text: `Customer log retention, ${RULE['RET-2.1@v2']}`, meta: 'in force 2025-01-06 → 2026-09-28' },
    { k: 'Source', id: m.id, text: m.title, meta: m.date, quote: true },
  ];
  return (
    <div className="kb-explain__inner" aria-label="Why DEC-007 exists">
      {rows.map((r, i) => (
        <div key={r.k}>
          {i > 0 && <div className="kb-explain__link" aria-hidden="true"><ArrowDown size={13} /></div>}
          <div className="kb-explain__row">
            <div className="kb-mono-label">{r.k}{r.id && <span className="kb-explain__id">{r.id}</span>}</div>
            <div className="kb-explain__text">{r.text}</div>
            {r.meta && <div className="kb-explain__meta">{r.meta}</div>}
            {r.quote && (
              <blockquote className="kb-explain__quote">
                “{DEC007_SOURCE.before}<mark className="kb-highlight">{DEC007_SOURCE.highlight}</mark>{DEC007_SOURCE.after}”
              </blockquote>
            )}
          </div>
        </div>
      ))}
      <div className="kb-explain__flag">
        <span className="kb-dot kb-dot--alert" aria-hidden="true" />
        Now: RET-2.1 v3 allows 90 days. DEC-007 keeps 180, an ongoing breach flagged on 2026-09-28.
      </div>
    </div>
  );
}
