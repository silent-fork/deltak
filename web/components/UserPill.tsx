"use client";

import {
  BadgeCheck,
  Building2,
  Check,
  ChevronDown,
  Clock3,
  Loader2,
  LogOut,
  Mail,
  Pencil,
  Phone,
  RefreshCw,
  RotateCcw,
  Wallet,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useEngineContext } from "@/components/EngineProvider";
import { PairMobileSection } from "@/components/PairMobileSection";
import { track } from "@/lib/analytics";
import { api } from "@/lib/api";
import { DEFAULT_CONFIG, istParts } from "@/lib/engine/config";
import type { ExecutionMode, LedgerSnapshot, UserProfile } from "@/lib/types";
import { cn, money, pnlTone, signedMoney } from "@/lib/utils";

/**
 * Who is at the terminal.
 *
 * The header carried a "Connected" button that was really a sign-out control:
 * it proved a session existed and said nothing about whose. This replaces it
 * with the account itself — name, client code, and a live dot — and puts the
 * full profile, the funds behind it and the day's book one click away.
 *
 * Everything shown here is identity or state the operator already owns. No
 * credential reaches this component: the trading JWT lives in an httpOnly
 * cookie the page cannot read, and the profile is fetched server-side.
 */

/** Two letters that stand for the operator: initials, else the client code. */
export function initials(profile: UserProfile | null, clientCode: string): string {
  const words = (profile?.name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (clientCode || "DK").slice(0, 2).toUpperCase();
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/** A stored UTC stamp as IST wall time — "03 Aug 2026 · 14:32 IST", the only clock this terminal keeps. */
function ist(value: string | null | undefined): string {
  if (!value) return "—";
  const at = new Date(/[Zz]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`);
  if (Number.isNaN(at.getTime())) return value;
  const p = istParts(at);
  const [year, month, day] = p.date.split("-").map(Number);
  const hhmm = [p.hour, p.minute].map((v) => String(v).padStart(2, "0")).join(":");
  return `${String(day).padStart(2, "0")} ${MONTHS[month - 1]} ${year} · ${hhmm} IST`;
}

function Row({
  icon: Icon,
  label,
  value,
  mono = true,
}: {
  icon?: typeof Mail;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-[3px]">
      <span className="flex shrink-0 items-center gap-1.5 dk-label text-[9px]">
        {Icon ? <Icon className="h-3 w-3 shrink-0 text-zinc-600" /> : null}
        {label}
      </span>
      <span
        className={cn(
          "min-w-0 truncate text-right text-[11px] text-zinc-300",
          mono && "font-mono",
        )}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * A contact field this terminal owns and Angel One does not.
 *
 * `getProfile` returns `email` and `mobileno` read-only — there is no SmartAPI
 * write for either, so this edits only the copy in `user_profiles`. That is
 * enough to fix a typo the broker returned or add a contact the account was
 * opened without; it never claims to change anything at the broker.
 */
/** RFC-5322-ish, not exhaustive — matches what the server accepts. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Indian mobile numbers: ten digits, first digit 6-9. */
const MOBILE_RE = /^[6-9]\d{9}$/;

function EditableRow({
  icon: Icon,
  label,
  value,
  placeholder,
  mono = true,
  kind = "text",
  onSave,
}: {
  icon: typeof Mail;
  label: string;
  value: string | null;
  placeholder: string;
  mono?: boolean;
  /** Shapes the input and its live validation. */
  kind?: "text" | "email" | "mobile";
  onSave: (next: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Blank is always allowed — it clears the field. A non-blank draft has to
  // match its kind before Save is worth trying, so a malformed number never
  // makes a round trip just to be told what the input already knew.
  const invalid =
    draft.trim() !== "" &&
    ((kind === "email" && !EMAIL_RE.test(draft.trim())) ||
      (kind === "mobile" && !MOBILE_RE.test(draft.trim())));

  useEffect(() => {
    if (!editing) return;
    setDraft(value ?? "");
    setError(null);
    inputRef.current?.focus();
    // Only on entering edit mode — re-syncing on every `value` change would
    // clobber what the operator is mid-typing when a background refresh lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  async function save() {
    if (invalid) return;
    setBusy(true);
    setError(null);
    try {
      await onSave(draft.trim());
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setBusy(false);
    }
  }

  /** Digits only, capped at ten — a pasted "+91 99977 33537" lands clean. */
  function onChangeDraft(raw: string) {
    setDraft(kind === "mobile" ? raw.replace(/\D/g, "").slice(0, 10) : raw);
  }

  const hint =
    kind === "email"
      ? "Enter a valid email address."
      : kind === "mobile"
        ? "10 digits, starting 6-9."
        : null;

  if (!editing) {
    return (
      <div className="flex items-baseline justify-between gap-3 py-[3px]">
        <span className="flex shrink-0 items-center gap-1.5 dk-label text-[9px]">
          <Icon className="h-3 w-3 shrink-0 text-zinc-600" />
          {label}
        </span>
        <button
          onClick={() => setEditing(true)}
          className="group flex min-w-0 items-center gap-1"
          title={`Edit ${label.toLowerCase()}`}
        >
          <span
            className={cn(
              "min-w-0 truncate text-right text-[11px] group-hover:text-zinc-100",
              value ? "text-zinc-300" : "text-zinc-600",
              mono && "font-mono",
            )}
          >
            {value ?? placeholder}
          </span>
          <Pencil className="h-2.5 w-2.5 shrink-0 text-zinc-700 group-hover:text-zinc-400" />
        </button>
      </div>
    );
  }

  return (
    <div className="py-[3px]">
      <div className="flex items-center justify-between gap-2">
        <span className="flex shrink-0 items-center gap-1.5 dk-label text-[9px]">
          <Icon className="h-3 w-3 shrink-0 text-zinc-600" />
          {label}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => onChangeDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void save();
              if (e.key === "Escape") setEditing(false);
            }}
            disabled={busy}
            placeholder={placeholder}
            type={kind === "email" ? "email" : kind === "mobile" ? "tel" : "text"}
            inputMode={kind === "mobile" ? "numeric" : undefined}
            maxLength={kind === "mobile" ? 10 : kind === "email" ? 254 : undefined}
            autoComplete={kind === "email" ? "email" : kind === "mobile" ? "tel" : "off"}
            className={cn(
              "w-[130px] rounded-md border bg-zinc-900 px-1.5 py-1 text-[11px] text-zinc-100 outline-none transition-colors disabled:opacity-50",
              invalid
                ? "border-rose-500/60 focus:border-rose-400"
                : "border-zinc-700 focus:border-quantum/60",
              mono && "font-mono",
            )}
          />
          <button
            onClick={save}
            disabled={busy || invalid}
            title="Save"
            className="shrink-0 rounded p-0.5 text-emerald-400 hover:bg-emerald-500/10 disabled:pointer-events-none disabled:opacity-30"
          >
            <Check className="h-3 w-3" />
          </button>
          <button
            onClick={() => setEditing(false)}
            disabled={busy}
            title="Cancel"
            className="shrink-0 rounded p-0.5 text-zinc-500 hover:bg-zinc-800 disabled:opacity-50"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>
      {error ? (
        <div className="mt-1 text-right text-[9px] text-rose-400">{error}</div>
      ) : invalid && hint ? (
        <div className="mt-1 text-right text-[9px] text-zinc-500">{hint}</div>
      ) : null}
    </div>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  /** A small icon-button in the title row — a section-scoped action, not worth its own row. */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-zinc-800/80 px-3 py-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="dk-label text-[8px]">{title}</div>
        {action}
      </div>
      {children}
    </div>
  );
}

/** Segment and product codes, as chips rather than a comma soup. */
function Chips({ values, empty }: { values: string[]; empty: string }) {
  if (!values.length) {
    return <span className="text-[10px] text-zinc-600">{empty}</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {values.map((v) => (
        <span
          key={v}
          className="rounded border border-zinc-800 bg-zinc-900/80 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-zinc-400"
        >
          {v}
        </span>
      ))}
    </div>
  );
}

export function UserPill({
  profile,
  clientCode,
  loginTime,
  mode,
  ledger,
  onSignedOut,
}: {
  profile: UserProfile | null;
  clientCode: string;
  loginTime: string | null;
  mode: ExecutionMode;
  ledger: LedgerSnapshot | undefined;
  onSignedOut: () => void;
}) {
  const engine = useEngineContext();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pairExpanded, setPairExpanded] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Same contract as the log menu: click-away closes, Escape closes.
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
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const name = profile?.name ?? clientCode ?? "Operator";
  const closed = ledger?.closed_positions.length ?? 0;
  const openCount = ledger?.open_positions.length ?? 0;
  const free = ledger ? Math.max(0, ledger.capital - ledger.deployed_margin) : 0;
  const deployedPct =
    ledger && ledger.capital > 0
      ? Math.min(100, Math.max(0, (ledger.deployed_margin / ledger.capital) * 100))
      : 0;

  async function refresh() {
    setBusy(true);
    try {
      await engine.refreshProfile();
    } finally {
      setBusy(false);
    }
  }

  async function resetWallet() {
    setResetBusy(true);
    setResetError(null);
    try {
      await engine.resetPaper();
      setConfirmReset(false);
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Reset failed";
      setResetError(detail);
      track("paper_wallet_reset_failed", { detail });
    } finally {
      setResetBusy(false);
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        title={`Signed in as ${name} (${clientCode}) — profile, paper wallet and today's book`}
        className={cn(
          "flex h-7 max-w-[190px] items-center gap-1.5 rounded-md border pl-1 pr-1.5 transition-colors",
          open
            ? "border-quantum/60 bg-quantum/10"
            : "border-emerald-500/40 bg-emerald-500/10 hover:border-emerald-400/60",
        )}
      >
        <span className="relative flex h-5 w-5 shrink-0 items-center justify-center rounded bg-gradient-to-br from-quantum/30 to-quantum/5 font-mono text-[9px] font-bold text-quantum ring-1 ring-quantum/40">
          {initials(profile, clientCode)}
          {/* The dot is the connection state the old button used to carry. */}
          <span className="absolute -bottom-px -right-px h-1.5 w-1.5 rounded-full bg-emerald-400 ring-1 ring-zinc-950 animate-pulse-ring" />
        </span>

        {/* The name is the label; below md the avatar and code carry it alone. */}
        <span className="hidden min-w-0 flex-1 text-left leading-none md:block">
          <span className="block truncate text-[10px] font-semibold text-zinc-100">
            {name}
          </span>
          <span className="mt-0.5 block truncate font-mono text-[8px] uppercase tracking-wider text-emerald-400/80">
            {clientCode}
          </span>
        </span>

        <ChevronDown
          className={cn(
            "h-3 w-3 shrink-0 text-zinc-500 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? (
        <div
          role="menu"
          className={cn(
            "dk-scroll absolute right-0 top-full z-50 mt-1 w-[min(21rem,calc(100vw-1.5rem))] overflow-y-auto rounded-lg border border-zinc-700 bg-[#0b0b0e] shadow-2xl shadow-black ring-1 ring-black/60",
            // The parent shell clips anything past the viewport edge
            // (overflow-hidden), so this can't go fully unbounded — but the
            // QR/device list wants room to grow rather than scroll inside an
            // already-short window, so it gets almost the full viewport
            // instead of the collapsed state's tighter cap.
            pairExpanded ? "max-h-[calc(100dvh-5rem)]" : "max-h-[75vh]",
          )}
        >
          {/*
            Identity and Pair Mobile share one block, not two stacked
            Sections — pairing a phone is as much "who's signed in here" as
            the name and client code above it, so there's no divider or
            second all-caps label between them, just this row's own
            padding and a hairline rule.
          */}
          <div className="px-3 py-2.5">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-quantum/30 to-quantum/5 font-mono text-[13px] font-bold text-quantum ring-1 ring-quantum/40">
                {initials(profile, clientCode)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[12px] font-semibold text-zinc-100">
                    {name}
                  </span>
                  <BadgeCheck className="h-3 w-3 shrink-0 text-emerald-400" />
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-zinc-500">
                  <span className="text-emerald-400/90">{clientCode}</span>
                  {profile?.broker ? (
                    <>
                      <span className="text-zinc-700">·</span>
                      <span className="truncate">{profile.broker}</span>
                    </>
                  ) : null}
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

            <div className="mt-2.5 border-t border-zinc-800/60 pt-2.5">
              <PairMobileSection onExpandedChange={setPairExpanded} />
            </div>
          </div>

          <Section title="Contact">
            <EditableRow
              icon={Mail}
              label="Email"
              value={profile?.email ?? null}
              placeholder="Add email"
              mono={false}
              kind="email"
              onSave={async (next) => {
                const { profile: updated } = await api.updateProfile({ email: next });
                engine.setProfile(updated);
              }}
            />
            <EditableRow
              icon={Phone}
              label="Mobile"
              value={profile?.mobile_no ?? null}
              placeholder="Add mobile"
              kind="mobile"
              onSave={async (next) => {
                const { profile: updated } = await api.updateProfile({ mobile_no: next });
                engine.setProfile(updated);
              }}
            />
          </Section>

          {pairExpanded ? null : (
            <>
              <Section title="Segments enabled">
                <Chips values={profile?.exchanges ?? []} empty="Not reported" />
              </Section>

              <Section title="Product types">
                <Chips values={profile?.products ?? []} empty="Not reported" />
              </Section>
            </>
          )}

          {/*
            The paper ledger, not the broker's RMS — there's no live mode in
            play here, so this is the one balance that actually moves when a
            trade opens or closes, for either device to show.
          */}
          <Section
            title={`Paper Wallet · ${mode}`}
            action={
              <button
                onClick={() => setConfirmReset((v) => !v)}
                title="Reset paper wallet — clears all paper trade history"
                className="shrink-0 rounded p-0.5 text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
              >
                <RotateCcw className="h-3 w-3" />
              </button>
            }
          >
            {confirmReset ? (
              <div className="mb-2 rounded border border-rose-500/50 bg-rose-500/10 p-2">
                <p className="text-[10px] leading-snug text-rose-200">
                  Reset the paper wallet? Every paper position and order —
                  open and closed — is deleted, and capital returns to{" "}
                  {money(DEFAULT_CONFIG.paperCapital, 0)}. This can&apos;t be undone.
                </p>
                {resetError ? (
                  <p className="mt-1.5 text-[10px] text-rose-300">{resetError}</p>
                ) : null}
                <div className="mt-1.5 flex items-center gap-1.5">
                  <button
                    onClick={resetWallet}
                    disabled={resetBusy}
                    className="flex h-6 items-center gap-1 rounded border border-rose-500/60 bg-rose-500/20 px-2 text-[9.5px] font-semibold uppercase tracking-wider text-rose-200 hover:bg-rose-500/30 disabled:opacity-50"
                  >
                    {resetBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                    Confirm reset
                  </button>
                  <button
                    onClick={() => {
                      setConfirmReset(false);
                      setResetError(null);
                    }}
                    disabled={resetBusy}
                    className="flex h-6 items-center rounded border border-zinc-700 bg-zinc-900/60 px-2 text-[9.5px] font-medium uppercase tracking-wider text-zinc-400 hover:text-zinc-200 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}

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

            <div className="mt-2.5">
              <Row icon={Wallet} label="Capital" value={money(ledger?.capital ?? 0, 0)} />
              <Row label="Equity" value={money(ledger?.equity ?? 0, 0)} />
              <Row label="Deployed" value={money(ledger?.deployed_margin ?? 0, 0)} />
              <Row label="Charges" value={money(ledger?.charges ?? 0, 0)} />
            </div>

            <div className="mt-2.5 grid grid-cols-3 gap-2 border-t border-zinc-800/60 pt-2 text-center">
              <div>
                <p className="dk-label text-[8px]">Open</p>
                <p className={cn("mt-0.5 font-mono text-[11px] font-semibold", pnlTone(ledger?.open_pnl ?? 0))}>
                  {signedMoney(ledger?.open_pnl ?? 0, 0)}
                </p>
              </div>
              <div>
                <p className="dk-label text-[8px]">Booked</p>
                <p
                  className={cn(
                    "mt-0.5 font-mono text-[11px] font-semibold",
                    pnlTone(ledger?.realised_pnl ?? 0),
                  )}
                >
                  {signedMoney(ledger?.realised_pnl ?? 0, 0)}
                </p>
              </div>
              <div>
                <p className="dk-label text-[8px]">Total</p>
                <p className={cn("mt-0.5 font-mono text-[11px] font-semibold", pnlTone(ledger?.total_pnl ?? 0))}>
                  {signedMoney(ledger?.total_pnl ?? 0, 0)}
                </p>
              </div>
            </div>

            <div className="mt-2.5 grid grid-cols-2 gap-2 border-t border-zinc-800/60 pt-2 text-center">
              <div>
                <p className="dk-label text-[8px]">Open positions</p>
                <p className="mt-0.5 font-mono text-[11px] font-semibold text-zinc-200">{openCount}</p>
              </div>
              <div>
                <p className="dk-label text-[8px]">Closed today</p>
                <p className="mt-0.5 font-mono text-[11px] font-semibold text-zinc-200">{closed}</p>
              </div>
            </div>
          </Section>

          <Section title="Session">
            <Row icon={Clock3} label="Signed in" value={ist(loginTime)} />
            <Row
              icon={Building2}
              label="Known since"
              value={profile?.first_seen_at ? ist(profile.first_seen_at) : "—"}
            />
          </Section>

          <div className="flex items-center gap-1.5 border-t border-zinc-800/80 p-2">
            <button
              onClick={refresh}
              disabled={busy}
              className="flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/60 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200 disabled:opacity-50"
            >
              <RefreshCw className={cn("h-3 w-3", busy && "animate-spin")} />
              Refresh
            </button>
            <button
              onClick={async () => {
                setOpen(false);
                await engine.logout().catch(() => undefined);
                onSignedOut();
              }}
              className="flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md border border-rose-500/40 bg-rose-500/10 text-[10px] font-semibold uppercase tracking-wider text-rose-300 transition-colors hover:bg-rose-500/20"
            >
              <LogOut className="h-3 w-3" />
              Sign out
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
