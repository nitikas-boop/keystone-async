// Glass tooltip for a hovered graph node: ID, title, date, owner.
export default function Tooltip({ tip }) {
  const { info, x, y } = tip;
  const flip = x > window.innerWidth - 320; // keep it on screen near the right edge
  return (
    <div className="ks-tip" style={{ left: x, top: y, transform: flip ? 'translate(calc(-100% - 14px), -50%)' : undefined }} role="status">
      <b>{info.id}</b>
      <span>{info.title}</span>
      <em>{info.date}{info.owner ? ` · ${info.owner}` : ''}</em>
    </div>
  );
}
