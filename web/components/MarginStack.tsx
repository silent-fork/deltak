/**
 * SPAN and exposure margin are two separate numbers that get blocked
 * together — a stacked bar makes the "SPAN alone understates the total"
 * point visible in a way a sentence of rupee figures doesn't.
 */
export function MarginStack() {
  const span = 40000;
  const exposure = 9000;
  const total = span + exposure;
  const spanPct = (span / total) * 100;

  return (
    <div className="space-y-2">
      <div className="flex h-8 w-full overflow-hidden rounded-md">
        <div
          className="flex items-center justify-center bg-quantum/30 font-mono text-[10px] font-semibold text-quantum"
          style={{ width: `${spanPct}%` }}
        >
          SPAN ₹{span.toLocaleString("en-IN")}
        </div>
        <div className="flex items-center justify-center bg-zinc-700/60 font-mono text-[10px] font-semibold text-zinc-300" style={{ width: `${100 - spanPct}%` }}>
          +₹{exposure.toLocaleString("en-IN")}
        </div>
      </div>
      <p className="text-center font-mono text-[10px] uppercase tracking-wider text-zinc-500">
        Total blocked: ₹{total.toLocaleString("en-IN")} — not the ₹{span.toLocaleString("en-IN")} SPAN alone
      </p>
    </div>
  );
}
