"use client";

import { ChevronDown, Loader2, RefreshCw, Smartphone } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { track } from "@/lib/analytics";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

const mmss = (seconds: number) => {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * The QR itself, small — QR generation is a well-tested contrast/module
 * problem, not something to shrink and hope still scans, so the light/dark
 * modules stay near-white/near-black (set server-side in
 * `lib/server/mobile.ts`, tinted just enough to read as "this app's cyan"
 * rather than stark white) and reliability never trades against theming.
 * The quantum ring around the tile is what actually ties it to the rest of
 * the HUD — same accent every other live/active element here uses.
 *
 * A dead QR is not shown as a QR: once it expires the light tile disappears
 * entirely (there's no code left worth the contrast it costs) in favour of a
 * dark, on-theme placeholder with its own reload control — the near-blank
 * near-white square a bare status icon used to leave behind read as broken,
 * not expired.
 */
function QrThumb({
  qrSvg,
  expired,
  busy,
  size,
  onReload,
}: {
  qrSvg: string | null;
  expired: boolean;
  busy: boolean;
  size: number;
  /** Present only once there's something to recover from (expired or errored). */
  onReload?: () => void;
}) {
  const live = qrSvg && !expired;
  return (
    <div
      style={{ height: size, width: size }}
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg p-1.5 ring-1 ring-offset-1 ring-offset-zinc-900",
        live ? "bg-[#eef9fa] ring-quantum/40" : "bg-zinc-900 ring-zinc-700",
      )}
    >
      {live ? (
        <div className="h-full w-full [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: qrSvg }} />
      ) : busy ? (
        <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
      ) : onReload ? (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onReload();
          }}
          onKeyDown={(e) => {
            if (e.key !== "Enter" && e.key !== " ") return;
            e.preventDefault();
            e.stopPropagation();
            onReload();
          }}
          title="Reload the QR"
          className="group/reload absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-1 bg-zinc-900/90 text-zinc-400 transition-colors hover:text-quantum"
        >
          <RefreshCw className="h-4 w-4 transition-transform group-hover/reload:rotate-180" />
          {size >= 100 ? (
            <span className="text-[8.5px] font-semibold uppercase tracking-wider">Reload</span>
          ) : null}
        </span>
      ) : (
        <Smartphone className="h-4 w-4 text-zinc-500" />
      )}
    </div>
  );
}

/**
 * Pair-a-phone QR, inline in the profile dropdown rather than its own modal —
 * small by default, click to expand within the dropdown itself.
 *
 * Mints a ticket the moment this mounts (the dropdown opening is the only
 * thing that mounts it — see `UserPill`), so a small live QR is already
 * sitting there the first time the section is seen, the same "no dead click"
 * choice the funds panel above it makes.
 */
export function PairMobileSection() {
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [claimUrl, setClaimUrl] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const expiresAtRef = useRef(0);

  const mint = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.mobile.pair();
      setQrSvg(res.qr_svg);
      setClaimUrl(res.claim_url);
      expiresAtRef.current = new Date(res.expires_at).getTime();
      setSecondsLeft(Math.max(0, Math.round((expiresAtRef.current - Date.now()) / 1000)));
      track("mobile_pair_qr_minted");
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Couldn't start pairing.";
      setError(detail);
      setQrSvg(null);
      track("mobile_pair_qr_failed", { detail });
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void mint();
  }, [mint]);

  useEffect(() => {
    if (!qrSvg) return;
    const id = setInterval(() => {
      setSecondsLeft(Math.max(0, Math.round((expiresAtRef.current - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(id);
  }, [qrSvg]);

  const expired = qrSvg !== null && secondsLeft <= 0;

  if (expanded) {
    return (
      <div className="flex flex-col items-center gap-2 py-1">
        <QrThumb
          qrSvg={qrSvg}
          expired={expired}
          busy={busy}
          size={176}
          onReload={expired || error ? () => void mint() : undefined}
        />

        {error ? (
          <p className="text-center text-[10px] text-rose-300">{error}</p>
        ) : qrSvg && !expired ? (
          <p className="font-mono text-[10px] text-zinc-500">
            Expires in <span className="text-zinc-300">{mmss(secondsLeft)}</span>
          </p>
        ) : null}

        <p className="max-w-[15rem] text-center text-[10px] leading-relaxed text-zinc-500">
          Scan with your phone&apos;s own camera app — opens straight into the companion,
          no sign-in screen involved.
        </p>

        {claimUrl && !expired ? (
          <p className="max-w-full truncate text-[9px] text-zinc-700" title={claimUrl}>
            {claimUrl}
          </p>
        ) : null}

        <div className="flex items-center gap-1.5">
          {expired || error ? (
            <button
              onClick={() => void mint()}
              disabled={busy}
              className="flex h-6 items-center gap-1 rounded border border-quantum/50 bg-quantum/10 px-2 text-[9.5px] font-semibold uppercase tracking-wider text-quantum hover:bg-quantum/20 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              New QR
            </button>
          ) : null}
          <button
            onClick={() => setExpanded(false)}
            className="flex h-6 items-center gap-1 rounded border border-zinc-800 bg-zinc-900/60 px-2 text-[9.5px] font-medium uppercase tracking-wider text-zinc-400 hover:text-zinc-200"
          >
            <ChevronDown className="h-3 w-3 rotate-180" />
            Collapse
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => {
        setExpanded(true);
        track("mobile_pair_qr_expanded");
      }}
      className="group flex w-full items-center gap-2.5 text-left"
      title="Expand to scan"
    >
      <QrThumb
        qrSvg={qrSvg}
        expired={expired}
        busy={busy}
        size={44}
        onReload={expired || error ? () => void mint() : undefined}
      />
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] text-zinc-300 group-hover:text-zinc-100">
          {error ? "Pairing failed" : expired ? "QR expired" : "Scan to pair a phone"}
        </span>
        <span className="block text-[9.5px] text-zinc-600">
          {error ? "Tap to retry" : expired ? "Tap for a new one" : "Live from desktop · tap to enlarge"}
        </span>
      </span>
      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-600 group-hover:text-zinc-300" />
    </button>
  );
}
