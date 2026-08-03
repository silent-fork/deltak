"use client";

import { ChevronDown, Loader2, RefreshCw, Smartphone, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { track } from "@/lib/analytics";
import { api, type PairedDevice } from "@/lib/api";
import { cn, timeAgo } from "@/lib/utils";

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
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const expiresAtRef = useRef(0);

  const [devices, setDevices] = useState<PairedDevice[]>([]);
  const [maxDevices, setMaxDevices] = useState(3);
  const [devicesLoaded, setDevicesLoaded] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  /**
   * `isRefresh` distinguishes the QR this section auto-mints the moment it
   * mounts from one a user explicitly re-minted after the first expired or
   * failed — same request either way, different signal for how often a
   * visible "scan this" QR is actually going stale before it gets used.
   */
  const mint = useCallback(async (isRefresh: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.mobile.pair();
      setQrSvg(res.qr_svg);
      expiresAtRef.current = new Date(res.expires_at).getTime();
      setSecondsLeft(Math.max(0, Math.round((expiresAtRef.current - Date.now()) / 1000)));
      track(isRefresh ? "mobile_pair_qr_refreshed" : "mobile_pair_qr_minted");
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Couldn't start pairing.";
      setError(detail);
      setQrSvg(null);
      track(isRefresh ? "mobile_pair_qr_refresh_failed" : "mobile_pair_qr_failed", { detail });
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void mint(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!qrSvg) return;
    const id = setInterval(() => {
      setSecondsLeft(Math.max(0, Math.round((expiresAtRef.current - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(id);
  }, [qrSvg]);

  /** Best-effort — a failed read here still leaves QR minting fully usable. */
  const loadDevices = useCallback(async () => {
    try {
      const res = await api.mobile.devices();
      setDevices(res.devices);
      setMaxDevices(res.max_devices);
    } catch {
      // Left as whatever was last known good.
    } finally {
      setDevicesLoaded(true);
    }
  }, []);

  useEffect(() => {
    void loadDevices();
    // A phone paired from elsewhere while this dropdown sits open should
    // still show up without the operator having to close and reopen it.
    const id = setInterval(() => void loadDevices(), 8_000);
    return () => clearInterval(id);
  }, [loadDevices]);

  const removeDevice = useCallback(
    async (sessionId: string) => {
      setRemovingId(sessionId);
      try {
        await api.mobile.removeDevice(sessionId);
        track("mobile_device_removed");
        await loadDevices();
      } catch (err) {
        track("mobile_device_remove_failed", {
          detail: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setRemovingId(null);
      }
    },
    [loadDevices],
  );

  const expired = qrSvg !== null && secondsLeft <= 0;
  const atDeviceCap = devicesLoaded && devices.length >= maxDevices;

  if (expanded) {
    return (
      <div className="flex flex-col items-center gap-1">
        <QrThumb
          qrSvg={qrSvg}
          expired={expired}
          busy={busy}
          size={128}
          onReload={expired || error ? () => void mint(true) : undefined}
        />

        {error ? (
          <p className="text-center text-[9.5px] text-rose-300">{error}</p>
        ) : qrSvg && !expired ? (
          <p className="font-mono text-[9.5px] text-zinc-500">
            Expires in <span className="text-zinc-300">{mmss(secondsLeft)}</span>
          </p>
        ) : null}

        <p className="max-w-[15rem] text-center text-[9.5px] leading-snug text-zinc-500">
          {atDeviceCap
            ? `${maxDevices} of ${maxDevices} phones already paired — remove one below to free a slot.`
            : "Scan with your phone's camera app — no sign-in screen involved."}
        </p>

        <div className="mt-0.5 flex items-center gap-1.5">
          {expired || error ? (
            <button
              onClick={() => void mint(true)}
              disabled={busy}
              className="flex h-5.5 items-center gap-1 rounded border border-quantum/50 bg-quantum/10 px-2 text-[9px] font-semibold uppercase tracking-wider text-quantum hover:bg-quantum/20 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              New QR
            </button>
          ) : null}
          <button
            onClick={() => setExpanded(false)}
            className="flex h-5.5 items-center gap-1 rounded border border-zinc-800 bg-zinc-900/60 px-2 text-[9px] font-medium uppercase tracking-wider text-zinc-400 hover:text-zinc-200"
          >
            <ChevronDown className="h-3 w-3 rotate-180" />
            Collapse
          </button>
        </div>

        <div className="mt-0.5 w-full border-t border-zinc-800/70 pt-2">
          <div className="flex items-center justify-between">
            <span className="dk-label text-[8px]">Paired devices</span>
            {devicesLoaded ? (
              <span className="font-mono text-[9px] text-zinc-600">
                {devices.length}/{maxDevices}
              </span>
            ) : null}
          </div>
          {devicesLoaded && devices.length === 0 ? (
            <p className="mt-1 text-[9.5px] text-zinc-600">No phones paired yet.</p>
          ) : (
            <ul className="mt-1 space-y-1">
              {devices.map((d, i) => (
                <li
                  key={d.session_id}
                  className="flex items-center justify-between gap-2 rounded border border-zinc-800 bg-zinc-900/50 px-2 py-1"
                >
                  <div className="flex min-w-0 items-center gap-1.5">
                    <Smartphone className="h-3 w-3 shrink-0 text-zinc-500" />
                    <span className="truncate text-[10px] text-zinc-300">Phone {i + 1}</span>
                    <span className="shrink-0 text-[9px] text-zinc-600">· {timeAgo(d.paired_at)}</span>
                  </div>
                  <button
                    onClick={() => void removeDevice(d.session_id)}
                    disabled={removingId === d.session_id}
                    title="Remove this device"
                    className="shrink-0 rounded p-0.5 text-zinc-600 hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-50"
                  >
                    {removingId === d.session_id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <X className="h-3 w-3" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
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
        onReload={expired || error ? () => void mint(true) : undefined}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[11px] text-zinc-300 group-hover:text-zinc-100">
            {error ? "Pairing failed" : expired ? "QR expired" : "Scan to pair a phone"}
          </span>
          {devicesLoaded && devices.length > 0 ? (
            <span className="shrink-0 rounded border border-zinc-800 bg-zinc-900/80 px-1 py-0.5 font-mono text-[8.5px] text-zinc-500">
              {devices.length}/{maxDevices} paired
            </span>
          ) : null}
        </span>
        <span className="block text-[9.5px] text-zinc-600">
          {error ? "Tap to retry" : expired ? "Tap for a new one" : "Live from desktop · tap to enlarge"}
        </span>
      </span>
      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-600 group-hover:text-zinc-300" />
    </button>
  );
}
