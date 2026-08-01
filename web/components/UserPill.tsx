"use client";

import {
  BadgeCheck,
  Building2,
  Check,
  ChevronDown,
  Clock3,
  LogOut,
  Mail,
  Pencil,
  Phone,
  RefreshCw,
  Wallet,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useEngineContext } from "@/components/EngineProvider";
import { api } from "@/lib/api";
import { istParts } from "@/lib/engine/config";
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

/** A stored UTC stamp as IST wall time — the only clock this terminal keeps. */
function ist(value: string | null | undefined): string {
  if (!value) return "—";
  const at = new Date(/[Zz]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`);
  if (Number.isNaN(at.getTime())) return value;
  const p = istParts(at);
  const hhmm = [p.hour, p.minute].map((v) => String(v).padStart(2, "0")).join(":");
  return `${p.date} ${hhmm}`;
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-zinc-800/80 px-3 py-2">
      <div className="dk-label mb-1 text-[8px]">{title}</div>
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

interface Funds {
  net: number;
  available_cash: number;
  utilised_debits: number;
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
  const [funds, setFunds] = useState<Funds | null>(null);
  const [fundsError, setFundsError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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

  /*
   * Margin is read when the panel opens, not on a timer. It is a metered broker
   * call and nobody watches their free cash tick — asking once, when the
   * operator actually looks, is the whole requirement.
   */
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    api
      .rms()
      .then((f) => {
        if (!cancelled) {
          setFunds(f);
          setFundsError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setFundsError(err instanceof Error ? err.message : "Margin read failed");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const name = profile?.name ?? clientCode ?? "Operator";
  const closed = ledger?.closed_positions.length ?? 0;
  const openCount = ledger?.open_positions.length ?? 0;

  async function refresh() {
    setBusy(true);
    try {
      await engine.refreshProfile();
      const f = await api.rms().catch(() => null);
      if (f) {
        setFunds(f);
        setFundsError(null);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        title={`Signed in as ${name} (${clientCode}) — profile, funds and today's book`}
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
          className="dk-scroll absolute right-0 top-full z-50 mt-1 max-h-[75vh] w-[min(21rem,calc(100vw-1.5rem))] overflow-y-auto rounded-lg border border-zinc-700 bg-[#0b0b0e] shadow-2xl shadow-black ring-1 ring-black/60"
        >
          {/* Identity */}
          <div className="flex items-center gap-2.5 px-3 py-2.5">
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

          <Section title="Segments enabled">
            <Chips values={profile?.exchanges ?? []} empty="Not reported" />
          </Section>

          <Section title="Product types">
            <Chips values={profile?.products ?? []} empty="Not reported" />
          </Section>

          {/*
            Funds, straight from the broker's RMS. This is what the account can
            actually deploy, which is not the paper ledger's capital — the two
            are shown apart for exactly that reason.
          */}
          <Section title="Funds · broker">
            {fundsError ? (
              <div className="text-[10px] text-amber-400/90">{fundsError}</div>
            ) : funds ? (
              <>
                <Row
                  icon={Wallet}
                  label="Available cash"
                  value={money(funds.available_cash, 0)}
                />
                <Row label="Net" value={money(funds.net, 0)} />
                <Row label="Utilised" value={money(funds.utilised_debits, 0)} />
              </>
            ) : (
              <div className="text-[10px] text-zinc-600">Reading margin…</div>
            )}
          </Section>

          {/* Today's book — the same numbers the trade book shows, summarised. */}
          <Section title={`Book · ${mode}`}>
            <Row label="Open positions" value={String(openCount)} />
            <Row label="Closed today" value={String(closed)} />
            <div className="flex items-baseline justify-between gap-3 py-[3px]">
              <span className="dk-label text-[9px]">Booked P&amp;L</span>
              <span
                className={cn(
                  "font-mono text-[11px] font-semibold",
                  pnlTone(ledger?.realised_pnl ?? 0),
                )}
              >
                {signedMoney(ledger?.realised_pnl ?? 0, 0)}
              </span>
            </div>
            <Row label="Equity" value={money(ledger?.equity ?? 0, 0)} />
          </Section>

          <Section title="Session">
            <Row icon={Clock3} label="Signed in" value={ist(loginTime)} />
            <Row label="Broker last login" value={profile?.broker_last_login ?? "—"} />
            <Row
              icon={Building2}
              label="Known since"
              value={profile?.first_seen_at ? ist(profile.first_seen_at) : "—"}
            />
            <Row
              label="Logins recorded"
              value={profile?.logins ? String(profile.logins) : "—"}
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
