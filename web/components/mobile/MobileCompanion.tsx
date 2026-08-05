"use client";

import { Activity, Radar, TrendingDown, TrendingUp, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { BootScreen } from "@/components/BootScreen";
import { QuadrantPill } from "@/components/QuadrantPill";
import { MobileUserMenu } from "@/components/mobile/MobileUserMenu";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Wordmark } from "@/components/Wordmark";
import { setAnalyticsContext, track } from "@/lib/analytics";
import { api, type MobileStateResponse } from "@/lib/api";
import { UNDERLYINGS } from "@/lib/engine/config";
import type { Position } from "@/lib/types";
import { PROTOCOL_META, cn, fmt, pnlTone, signedMoney, timeAgo } from "@/lib/utils";

/** How often the phone re-polls its state. */
const POLL_MS = 5_000;

/** Same visual boot sequence as the desktop terminal, different narration — nothing here authenticates against any broker. */
const BOOT_LINES = [["Reading the paired desktop…", "Syncing the live signal…", "Loading the trade book…"]];

function SignalRow({ underlying, signal }: { underlying: string; signal: MobileStateResponse["signal"] }) {
  const s = signal?.signals[underlying];
  const meta = s ? PROTOCOL_META[s.protocol] : null;

  return (
    <div className="flex items-start justify-between gap-3 border-b border-zinc-800/60 px-3 py-2 last:border-b-0">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[11px] font-semibold text-zinc-200">{underlying}</span>
          {meta ? (
            <Badge className={cn("h-4.5 px-1", meta.tone)}>{meta.name}</Badge>
          ) : null}
          <QuadrantPill quadrant={s?.quadrant} compact />
        </div>
        <p className="mt-1 truncate text-[11px] leading-snug text-zinc-400">
          {s?.headline ?? "Awaiting the live feed."}
        </p>
      </div>
      {s?.actionable ? (
        <span className="mt-0.5 flex shrink-0 items-center gap-1 rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-emerald-300">
          <Radar className="h-2.5 w-2.5 animate-pulse-ring" />
          Armed
        </span>
      ) : null}
    </div>
  );
}

function PositionRow({ position }: { position: Position }) {
  const pnl = position.status === "OPEN" ? position.unrealised_pnl : position.realised_pnl;
  const up = position.side === "BUY";
  return (
    <div className="flex items-center justify-between gap-2 border-b border-zinc-800/60 px-3 py-1.5 last:border-b-0">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          {up ? (
            <TrendingUp className="h-3 w-3 shrink-0 text-emerald-400" />
          ) : (
            <TrendingDown className="h-3 w-3 shrink-0 text-rose-400" />
          )}
          <span className="truncate font-mono text-[11px] text-zinc-200">
            {position.trading_symbol}
          </span>
        </div>
        <p className="mt-0.5 text-[10px] text-zinc-500">
          {position.lots}×{position.lot_size} @ {fmt(position.avg_price)}
          {position.status === "CLOSED" && position.exit_price
            ? ` → ${fmt(position.exit_price)}`
            : ""}
        </p>
      </div>
      <span className={cn("shrink-0 font-mono text-[11.5px] font-semibold", pnlTone(pnl))}>
        {signedMoney(pnl)}
      </span>
    </div>
  );
}

/**
 * What a paired phone sees at `/terminal` — same ambient glow, grid and
 * panel language as the homepage and the desktop HUD, so this doesn't read
 * as a stripped-down afterthought next to either.
 */
export function MobileCompanion({
  clientCode,
  justPaired = false,
}: {
  clientCode: string;
  /** True on the one render immediately after a successful QR claim redirect — see app/terminal/page.tsx. */
  justPaired?: boolean;
}) {
  const [data, setData] = useState<MobileStateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const viewTracked = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await api.mobile.state();
        if (!cancelled) {
          setData(res);
          setError(null);
          if (!viewTracked.current) {
            viewTracked.current = true;
            setAnalyticsContext({ mobile: true, client_code: res.client_code });
            if (justPaired) track("mobile_paired", { client_code: res.client_code });
            track("mobile_companion_view", { client_code: res.client_code });
          }
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't reach the terminal.");
      }
    };
    void poll();
    const id = setInterval(() => void poll(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const unpair = async () => {
    setSigningOut(true);
    try {
      await api.mobile.logout();
      track("mobile_unpaired", { client_code: clientCode });
    } catch (err) {
      track("mobile_unpair_failed", { client_code: clientCode, detail: err instanceof Error ? err.message : String(err) });
    } finally {
      window.location.reload();
    }
  };

  // Booting until the first poll actually lands (success or failure) — a
  // blank "Nothing open" / "No trades yet" the instant this mounts would
  // read as fact when it's really "hasn't asked yet."
  if (!data && !error) {
    return <BootScreen stages={[{ done: false }]} lines={BOOT_LINES} />;
  }

  // The desktop's own push is the live source for what's open (as fresh as
  // its last MOBILE_PUSH_MS beat); `data.positions` — read straight off the
  // DB checkpoint — is the fallback for a snapshot that predates this field
  // and for whenever the desktop itself has gone quiet (closed tab, dead
  // network), the exact case that checkpoint exists to cover.
  const open = data?.signal?.open_positions ?? data?.positions.filter((p) => p.status === "OPEN") ?? [];
  const closed = data?.positions.filter((p) => p.status === "CLOSED").slice(0, 20) ?? [];
  const ledger = data?.signal?.ledger;
  const mode = data?.signal?.mode ?? "paper";

  return (
    <main className="dk-grid-bg relative h-dvh overflow-hidden bg-zinc-950">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-[360px] w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-quantum/[0.08] blur-[110px]"
      />

      <div className="relative flex h-dvh flex-col">
        <header className="z-10 flex shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-950/95 px-3 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] backdrop-blur">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md border border-quantum/40 bg-quantum/10">
              <Zap className="h-3.5 w-3.5 text-quantum" />
            </div>
            <Wordmark className="text-[13px] tracking-[0.16em]" />
          </div>
          <div className="flex items-center gap-1.5">
            {/* Same word and icon the desktop header's own market-status badge
                uses (see Header.tsx) — one vocabulary for "is the exchange
                open" everywhere this HUD shows it. */}
            <Badge
              className={cn(
                "h-8 border-zinc-800",
                data?.signal?.market_open ? "text-emerald-300" : "text-zinc-500",
              )}
            >
              <Activity className="h-3 w-3" />
              {data?.signal?.market_open ? "Open" : "Closed"}
            </Badge>
            <MobileUserMenu
              clientCode={clientCode}
              mode={mode}
              wallet={ledger ?? null}
              onUnpair={() => void unpair()}
              unpairBusy={signingOut}
            />
          </div>
        </header>

        <div className="dk-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto flex min-h-full max-w-md flex-col space-y-2.5 px-2.5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-2">
            {error ? (
              <div className="shrink-0 rounded border border-rose-500/40 bg-rose-500/10 p-2.5 text-[11px] text-rose-300">
                {error}
              </div>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle>Live Signal</CardTitle>
                <span className="text-[9.5px] text-zinc-600">
                  {data?.signal ? `desktop · ${timeAgo(data.signal_updated_at)}` : "waiting for desktop"}
                </span>
              </CardHeader>
              <CardContent className="flex flex-col p-0">
                {data?.signal && !data.signal.market_open ? (
                  <p className="px-3 py-4 text-center text-[11px] leading-snug text-zinc-500">
                    Market closed — waiting for the next session to open.
                    <br />
                    <span className="text-zinc-600">
                      Nothing armed or muted, there&apos;s just no live tape to read yet.
                    </span>
                  </p>
                ) : (
                  UNDERLYINGS.map((u) => (
                    <SignalRow key={u} underlying={u} signal={data?.signal ?? null} />
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Open Positions</CardTitle>
                <Badge className="h-4.5">{open.length}</Badge>
              </CardHeader>
              <CardContent className="flex flex-col p-0">
                {open.length ? (
                  open.map((p) => <PositionRow key={p.id} position={p} />)
                ) : (
                  <p className="px-3 py-4 text-center text-[11px] text-zinc-600">Nothing open.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Closed Trades</CardTitle>
                <Badge className="h-4.5">{closed.length}</Badge>
              </CardHeader>
              <CardContent className="flex flex-col p-0">
                {closed.length ? (
                  closed.map((p) => <PositionRow key={p.id} position={p} />)
                ) : (
                  <p className="px-3 py-4 text-center text-[11px] text-zinc-600">No trades yet.</p>
                )}
              </CardContent>
            </Card>

            <p className="flex shrink-0 items-center justify-center gap-1.5 pt-1 text-zinc-700">
              <span
                aria-hidden
                className="inline-flex h-2 w-3.5 shrink-0 flex-col overflow-hidden rounded-[2px] ring-1 ring-white/10"
              >
                <span className="h-1/3 w-full bg-[#FF9933]" />
                <span className="h-1/3 w-full bg-white" />
                <span className="h-1/3 w-full bg-[#138808]" />
              </span>
              <span className="text-[9px]">
                Made with <span className="text-rose-400">♥</span> in Bharat
              </span>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
