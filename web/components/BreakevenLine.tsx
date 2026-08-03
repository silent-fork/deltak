/**
 * A single breakeven marked on a number line, loss and profit zones shaded
 * the same way every payoff chart on this wiki shades them — so a reader
 * who's seen one strategy page recognizes the color language here too.
 */
export function BreakevenLine() {
  const W = 460;
  const H = 60;
  const strikeX = W * 0.4;
  const beX = W * 0.58;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      <rect x={0} y={20} width={strikeX} height={12} fill="#f43f5e" fillOpacity={0.22} />
      <rect x={strikeX} y={20} width={beX - strikeX} height={12} fill="#f43f5e" fillOpacity={0.12} />
      <rect x={beX} y={20} width={W - beX} height={12} fill="#10b981" fillOpacity={0.3} />
      <line x1={0} y1={26} x2={W} y2={26} stroke="#3f3f46" strokeWidth={1} />

      <line x1={strikeX} y1={12} x2={strikeX} y2={40} stroke="#00f0ff" strokeWidth={1.5} strokeDasharray="3 2" />
      <text x={strikeX} y={8} textAnchor="middle" fontSize="9" fill="#00f0ff">
        strike 25,000
      </text>

      <circle cx={beX} cy={26} r={4} fill="#18181b" stroke="#e4e4e7" strokeWidth={1.5} />
      <text x={beX} y={50} textAnchor="middle" fontSize="9" fill="#e4e4e7">
        breakeven 25,180
      </text>

      <text x={strikeX / 2} y={44} textAnchor="middle" fontSize="8" fill="#f43f5e">
        premium lost
      </text>
      <text x={(beX + W) / 2} y={44} textAnchor="middle" fontSize="8" fill="#10b981">
        profit
      </text>
    </svg>
  );
}
