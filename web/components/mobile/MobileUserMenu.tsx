"use client";

import { ChevronDown, LogOut, Layers, PiggyBank, Receipt, Wallet } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { ExecutionMode } from "@/lib/types";
import { cn, money, pnlTone, signedMoney } from "@/lib/utils";

export interface MobileWallet {
  capital: number;
  equity: number;
  deployed_margin: number;
  charges: number;
  open_pnl: number;
  realised_pnl: number;
  total_pnl: number;
}

/** Two letters that stand for the operator: initials, else the client code — same rule as the desktop's own `UserPill`. */
function initials(name: string | null, clientCode: string): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (clientCode || "DK").slice(0, 2).toUpperCase();
}

function WalletRow({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-[3px]">
      <span className="flex items-center gap-1.5 dk-label text-[9px]">
        <Icon className="h-3 w-3 shrink-0 text-zinc-600" />
        {label}
      </span>
      <span className={cn("font-mono text-[11px] text-zinc-300", tone)}>{value}</span>
    </div>
  );
}

/**
 * Identity + the paper wallet, one dropdown, the same trigger shape as the
 * desktop's own `UserPill` — a phone gets the same "who's signed in and what
 * do they have on" answer, just built from the ledger snapshot the desktop
 * pushes rather than a broker RMS call it has no session to make.
 */
export function MobileUserMenu({
  clientCode,
  name,
  mode,
  wallet,
  onUnpair,
  unpairBusy,
}: {
  clientCode: string;
  /** The operator's own name, same source as the desktop's `UserPill` — null for an account that never set one. */
  name: string | null;
  mode: ExecutionMode;
  wallet: MobileWallet | null;
  onUnpair: () => void;
  unpairBusy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    // A dropdown over a page that itself scrolls is how a mobile tap ends up
    // scrolling the page behind the menu instead of dismissing it — locking
    // the body while it's open is what a modal already does here (`Dialog`).
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  // Against equity, not raw capital — see the same fix and its full
  // rationale in the desktop UserPill this menu mirrors.
  const free = wallet ? Math.max(0, wallet.equity - wallet.deployed_margin) : 0;
  const deployedPct =
    wallet && wallet.equity > 0
      ? Math.min(100, Math.max(0, (wallet.deployed_margin / wallet.equity) * 100))
      : 0;

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        title={`Signed in as ${name ?? clientCode} (${clientCode})`}
        className={cn(
          "flex h-8 max-w-[180px] items-center gap-1.5 rounded-md border pl-1 pr-1.5 transition-colors",
          open ? "border-quantum/60 bg-quantum/10" : "border-emerald-500/40 bg-emerald-500/10",
        )}
      >
        <span className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded bg-gradient-to-br from-quantum/30 to-quantum/5 font-mono text-[9px] font-bold text-quantum ring-1 ring-quantum/40">
          {initials(name, clientCode)}
          <span className="absolute -bottom-px -right-px h-1.5 w-1.5 rounded-full bg-emerald-400 ring-1 ring-zinc-950 animate-pulse-ring" />
        </span>
        <span className="min-w-0 flex-1 truncate text-left font-mono text-[9.5px] uppercase tracking-wider text-emerald-400/90">
          {name ?? clientCode}
        </span>
        <ChevronDown className={cn("h-3 w-3 shrink-0 text-zinc-500 transition-transform", open && "rotate-180")} />
      </button>

      {open ? (
        <div
          role="menu"
          className="dk-scroll absolute right-0 top-full z-50 mt-1 max-h-[70vh] w-[min(19rem,calc(100vw-1.5rem))] overflow-y-auto rounded-lg border border-zinc-700 bg-[#0b0b0e] shadow-2xl shadow-black ring-1 ring-black/60"
        >
          <div className="flex items-center gap-2.5 px-3 py-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-quantum/30 to-quantum/5 font-mono text-[13px] font-bold text-quantum ring-1 ring-quantum/40">
              {initials(name, clientCode)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] font-semibold text-zinc-100">
                {name ?? clientCode}
              </div>
              <div className="mt-0.5 truncate font-mono text-[9px] uppercase tracking-wider text-emerald-400/80">
                {clientCode}
              </div>
            </div>
            <span
              className={cn(
                "shrink-0 rounded border px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider",
                mode === "live"
                  ? "border-rose-500/50 bg-rose-500/10 text-rose-300"
                  : "border-zinc-700 bg-zinc-900 text-zinc-400",
              )}
            >
              {mode}
            </span>
          </div>

          <div className="border-t border-zinc-800/80 px-3 py-2.5">
            <div className="dk-label mb-2 text-[8px]">Paper Wallet</div>

            {wallet ? (
              <>
                {/* Capital deployed vs free, at a glance — the one visual
                    a static list of numbers can't give you as fast. */}
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800/70">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-quantum/50 to-quantum transition-[width] duration-500"
                    style={{ width: `${deployedPct}%` }}
                  />
                </div>
                <div className="mt-1 flex items-center justify-between font-mono text-[9px] text-zinc-600">
                  <span>{deployedPct.toFixed(0)}% deployed</span>
                  <span>{money(free, 0)} free</span>
                </div>

                <div className="mt-2.5 space-y-px">
                  <WalletRow icon={Wallet} label="Capital" value={money(wallet.capital, 0)} />
                  <WalletRow icon={PiggyBank} label="Equity" value={money(wallet.equity, 0)} />
                  <WalletRow icon={Layers} label="Deployed" value={money(wallet.deployed_margin, 0)} />
                  <WalletRow icon={Receipt} label="Charges" value={money(wallet.charges, 0)} />
                </div>

                <div className="mt-2 grid grid-cols-3 gap-2 border-t border-zinc-800/60 pt-2 text-center">
                  <div>
                    <p className="dk-label">Open</p>
                    <p className={cn("mt-0.5 font-mono text-[11px] font-semibold", pnlTone(wallet.open_pnl))}>
                      {signedMoney(wallet.open_pnl, 0)}
                    </p>
                  </div>
                  <div>
                    <p className="dk-label">Booked</p>
                    <p
                      className={cn(
                        "mt-0.5 font-mono text-[11px] font-semibold",
                        pnlTone(wallet.realised_pnl),
                      )}
                    >
                      {signedMoney(wallet.realised_pnl, 0)}
                    </p>
                  </div>
                  <div>
                    <p className="dk-label">Total</p>
                    <p className={cn("mt-0.5 font-mono text-[11px] font-semibold", pnlTone(wallet.total_pnl))}>
                      {signedMoney(wallet.total_pnl, 0)}
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-[10.5px] text-zinc-600">Waiting for the desktop to push a snapshot…</p>
            )}
          </div>

          <div className="border-t border-zinc-800/80 p-2">
            <button
              onClick={() => {
                setOpen(false);
                onUnpair();
              }}
              disabled={unpairBusy}
              className="flex h-7 w-full items-center justify-center gap-1.5 rounded-md border border-rose-500/40 bg-rose-500/10 text-[10px] font-semibold uppercase tracking-wider text-rose-300 transition-colors hover:bg-rose-500/20 disabled:opacity-50"
            >
              <LogOut className="h-3 w-3" />
              Unpair this phone
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
