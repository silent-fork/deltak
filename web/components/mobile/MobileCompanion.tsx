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
import { ApiError, api, type MobileStateResponse } from "@/lib/api";
import { UNDERLYINGS } from "@/lib/engine/config";
import type { Position } from "@/lib/types";
import { PROTOCOL_META, cn, fmt, pnlTone, signedMoney, timeAgo } from "@/lib/utils";

/** How often the phone re-polls its state, on a healthy connection. */
const POLL_MS = 5_000;
/** Ceiling for the backoff a run of failed polls climbs to — never worse than once a minute. */
const MAX_POLL_BACKOFF_MS = 60_000;

/** Same visual boot sequence as the desktop terminal, different narration — nothing here authenticates against any broker. */
const BOOT_LINES = [["Reading the paired desktop…", "Syncing the live signal…", "Loading the trade book…"]];

/**
 * A bordered, P&L-tinted card — the same idiom the desktop's `PositionCard`
 * (`TradeBook.tsx`) uses — rather than a flat divided list. The two HUDs
 * showing the same book should look like the same product.
 */
function SignalRow({ underlying, signal }: { underlying: string; signal: MobileStateResponse["signal"] }) {
  const s = signal?.signals[underlying];
  const meta = s ? PROTOCOL_META[s.protocol] : null;

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/50 px-2.5 py-1.5">
      <div className="flex items-start justify-between gap-3">
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
    </div>
  );
}

function PositionRow({ position }: { position: Position }) {
  const pnl = position.status === "OPEN" ? position.unrealised_pnl : position.realised_pnl;
  const closed = position.status === "CLOSED";
  const up = position.side === "BUY";
  return (
    <div
      className={cn(
        "rounded-md border bg-zinc-950/50 px-2.5 py-1.5",
        closed ? "border-zinc-800/70" : pnl >= 0 ? "border-emerald-500/25" : "border-rose-500/25",
      )}
    >
      <div className="flex items-center justify-between gap-2">
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

  /**
   * A self-scheduling poll rather than a fixed `setInterval`, for three
   * things a flat 5s tick can't do:
   *
   * - Pauses entirely while the tab is backgrounded (`visibilitychange`),
   *   resuming with an immediate poll the moment it's foregrounded again,
   *   instead of burning battery/data on a phone nobody's looking at.
   * - Backs off exponentially (capped at `MAX_POLL_BACKOFF_MS`) on repeated
   *   failures rather than hammering a struggling server every 5s forever,
   *   and resets to the normal cadence the moment a poll succeeds again.
   * - Treats a 401 as terminal, not just another error: the phone's pairing
   *   was revoked or expired server-side, so no amount of retrying this
   *   session will ever succeed. A reload re-enters `/terminal` fresh, which
   *   resolves server-side to the pairing screen instead of leaving this
   *   view stuck showing stale data behind a permanent error banner.
   */
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let backoffMs = POLL_MS;
    let pausedForVisibility = false;

    const scheduleNext = (delay: number) => {
      if (cancelled) return;
      timer = setTimeout(() => {
        timer = null;
        void poll();
      }, delay);
    };

    const poll = async () => {
      if (cancelled) return;
      try {
        const res = await api.mobile.state();
        if (cancelled) return;
        setData(res);
        setError(null);
        backoffMs = POLL_MS;
        if (!viewTracked.current) {
          viewTracked.current = true;
          setAnalyticsContext({ mobile: true, client_code: res.client_code });
          if (justPaired) track("mobile_paired", { client_code: res.client_code });
          track("mobile_companion_view", { client_code: res.client_code });
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          setError("This phone's pairing ended — reconnecting…");
          setTimeout(() => {
            if (!cancelled) window.location.reload();
          }, 1500);
          return;
        }
        setError(err instanceof Error ? err.message : "Couldn't reach the terminal.");
        backoffMs = Math.min(backoffMs * 2, MAX_POLL_BACKOFF_MS);
      }
      if (cancelled) return;
      if (document.hidden) {
        pausedForVisibility = true;
        return;
      }
      scheduleNext(backoffMs);
    };

    const onVisibility = () => {
      if (cancelled || document.hidden || !pausedForVisibility) return;
      pausedForVisibility = false;
      void poll();
    };
    document.addEventListener("visibilitychange", onVisibility);

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [justPaired]);

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
  // Whether `open` above actually came from the fresh desktop push or fell
  // back to the DB checkpoint — the one thing the Live Signal card's own
  // `desktop · Ns ago` label already tells you and Open Positions didn't,
  // despite carrying the exact same fallback split.
  const openIsLive = !!data?.signal?.open_positions;
  // Same fallback shape as `open` above: the desktop's live push is the
  // fresher number whenever it's there, `data.wallet` — read straight off the
  // DB checkpoint — covers everything else (no push yet, an older cached
  // snapshot, a desktop that's gone quiet).
  const ledger = data?.signal?.ledger ?? data?.wallet;
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
              name={data?.name ?? null}
              mode={mode}
              wallet={ledger ?? null}
              onUnpair={() => void unpair()}
              unpairBusy={signingOut}
            />
          </div>
        </header>

        {/*
          No page-level scroll: the outer column is a fixed height (`flex-1`
          under the shrink-0 header, `overflow-hidden` here) and each card
          below scrolls its own body — the same pattern the desktop terminal
          uses for its own panels (see `TradeBook.tsx`'s `CardContent`, or
          any board panel's `dk-scroll overflow-y-auto`), rather than one
          long page the whole phone has to swipe through.
        */}
        <div className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col gap-2.5 overflow-hidden px-2.5 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2">
          {error ? (
            <div className="shrink-0 rounded border border-rose-500/40 bg-rose-500/10 p-2.5 text-[11px] text-rose-300">
              {error}
            </div>
          ) : null}

          {/* Fixed-list, not flex-1 — five underlyings render at their full
              natural height rather than fighting Open/Closed for space or
              scrolling internally; the internal `overflow-y-auto` on its
              body stays only as a safety net if that list ever grows.
              Open Positions and Closed Trades are the ones that absorb
              whatever height this leaves, splitting it dynamically. */}
          <Card className="shrink-0">
            <CardHeader className="shrink-0">
              <CardTitle>Live Signal</CardTitle>
              <span className="text-[9.5px] text-zinc-600">
                {data?.signal ? `desktop · ${timeAgo(data.signal_updated_at)}` : "waiting for desktop"}
              </span>
            </CardHeader>
            <CardContent className="dk-scroll min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain p-2">
              {data?.signal && !data.signal.market_open ? (
                <p className="px-1 py-4 text-center text-[11px] leading-snug text-zinc-500">
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

          <Card className="min-h-0 flex-1">
            <CardHeader className="shrink-0">
              <CardTitle>Open Positions</CardTitle>
              <span className="flex items-center gap-1.5">
                <span
                  className="text-[9.5px] text-zinc-600"
                  title={
                    openIsLive
                      ? "Live from the desktop's own push"
                      : "Desktop hasn't pushed recently — reading the last saved checkpoint instead"
                  }
                >
                  {openIsLive ? `live · ${timeAgo(data?.signal_updated_at)}` : "checkpoint"}
                </span>
                <Badge className="h-4.5">{open.length}</Badge>
              </span>
            </CardHeader>
            <CardContent className="dk-scroll min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain p-2">
              {open.length ? (
                open.map((p) => <PositionRow key={p.id} position={p} />)
              ) : (
                <p className="px-1 py-4 text-center text-[11px] text-zinc-600">Nothing open.</p>
              )}
            </CardContent>
          </Card>

          <Card className="min-h-0 flex-1">
            <CardHeader className="shrink-0">
              <CardTitle>Closed Trades</CardTitle>
              <Badge className="h-4.5">{closed.length}</Badge>
            </CardHeader>
            <CardContent className="dk-scroll min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain p-2">
              {closed.length ? (
                closed.map((p) => <PositionRow key={p.id} position={p} />)
              ) : (
                <p className="px-1 py-4 text-center text-[11px] text-zinc-600">No trades yet.</p>
              )}
            </CardContent>
          </Card>

          <p className="flex shrink-0 items-center justify-center gap-1.5 text-zinc-700">
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
    </main>
  );
}
