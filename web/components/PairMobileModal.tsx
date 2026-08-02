"use client";

import { Loader2, RefreshCw, ShieldAlert, Smartphone } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { api } from "@/lib/api";

const mmss = (seconds: number) => {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * Desktop side of the QR pairing flow: mint a ticket, show it as a QR the
 * phone's own camera scans directly (see `lib/server/mobile.ts` — no in-app
 * scanner exists on either end), and refresh it when it ages out.
 *
 * The SVG itself is rendered server-side and handed back as markup — nothing
 * about generating a QR ships to this bundle.
 */
export function PairMobileModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [claimUrl, setClaimUrl] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start pairing.");
      setQrSvg(null);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void mint();
  }, [open, mint]);

  useEffect(() => {
    if (!open || !qrSvg) return;
    const id = setInterval(() => {
      setSecondsLeft(Math.max(0, Math.round((expiresAtRef.current - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(id);
  }, [open, qrSvg]);

  const expired = qrSvg !== null && secondsLeft <= 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Pair Mobile"
      subtitle="Read-only companion — no Angel One sign-in ever happens on the phone"
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="relative flex h-56 w-56 items-center justify-center overflow-hidden rounded-xl bg-white p-3">
          {qrSvg && !expired ? (
            <div
              className="h-full w-full [&>svg]:h-full [&>svg]:w-full"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-zinc-500">
              {busy ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : expired ? (
                <ShieldAlert className="h-6 w-6" />
              ) : (
                <Smartphone className="h-6 w-6" />
              )}
              <span className="max-w-[10rem] text-[11px] font-medium">
                {expired ? "Expired" : busy ? "Generating…" : ""}
              </span>
            </div>
          )}
        </div>

        {error ? (
          <p className="text-[11px] text-rose-300">{error}</p>
        ) : qrSvg && !expired ? (
          <p className="font-mono text-[11px] text-zinc-500">
            Expires in <span className="text-zinc-300">{mmss(secondsLeft)}</span>
          </p>
        ) : null}

        <p className="max-w-[18rem] text-[11px] leading-relaxed text-zinc-500">
          Scan with your phone&apos;s own camera app — not a scanner inside this page. It opens
          straight into the read-only companion, no sign-in screen involved.
        </p>

        {claimUrl && !expired ? (
          <p className="truncate text-[9.5px] text-zinc-700" title={claimUrl}>
            {claimUrl}
          </p>
        ) : null}

        <Button
          variant={expired ? "quantum" : "ghost"}
          size="sm"
          disabled={busy}
          onClick={() => void mint()}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {expired ? "Generate a new QR" : "Refresh"}
        </Button>
      </div>
    </Dialog>
  );
}
