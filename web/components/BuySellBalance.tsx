/**
 * Buyer vs. seller risk/reward asymmetry as two mirrored silhouettes rather
 * than another paragraph — a buyer's capped rectangle of loss under an
 * open-ended wedge of profit, and a seller's mirror image: a capped
 * rectangle of profit over an open-ended wedge of risk.
 */
function Silhouette({ variant }: { variant: "buyer" | "seller" }) {
  const seller = variant === "seller";
  const W = 160;
  const H = 150;
  const mid = H / 2;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      <line x1={0} y1={mid} x2={W} y2={mid} stroke="#3f3f46" strokeWidth={1} />
      {seller ? (
        <>
          <rect x={W / 2 - 26} y={mid - 22} width={52} height={22} fill="#10b981" fillOpacity={0.35} />
          <path d={`M0 ${mid} L${W} ${mid} L${W} ${H} L0 ${H} Z`} fill="#f43f5e" fillOpacity={0.22} />
          <path d={`M${W / 2 - 40} ${H - 4} L${W / 2 + 40} ${H - 4}`} stroke="#f43f5e" strokeWidth={1.5} strokeDasharray="2 3" />
          <text x={W / 2} y={mid - 30} textAnchor="middle" fontSize="9" fill="#10b981">
            capped profit
          </text>
          <text x={W / 2} y={H - 10} textAnchor="middle" fontSize="9" fill="#f43f5e">
            open-ended risk ↓
          </text>
        </>
      ) : (
        <>
          <rect x={W / 2 - 26} y={mid} width={52} height={20} fill="#f43f5e" fillOpacity={0.3} />
          <path d={`M0 ${mid} L${W} ${mid} L${W / 2} 6 Z`} fill="#10b981" fillOpacity={0.35} />
          <text x={W / 2} y={mid + 34} textAnchor="middle" fontSize="9" fill="#f43f5e">
            capped loss
          </text>
          <text x={W / 2} y={20} textAnchor="middle" fontSize="9" fill="#10b981">
            profit runs ↑
          </text>
        </>
      )}
    </svg>
  );
}

export function BuySellBalance() {
  return (
    <div className="dk-panel grid grid-cols-2 divide-x divide-zinc-800/70 rounded-lg">
      <div className="p-3 text-center">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Buyer</p>
        <Silhouette variant="buyer" />
      </div>
      <div className="p-3 text-center">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Seller</p>
        <Silhouette variant="seller" />
      </div>
    </div>
  );
}
