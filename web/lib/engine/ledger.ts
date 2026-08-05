import type {
  Automation,
  Broker,
  ExecutionMode,
  LedgerSnapshot,
  OptionType,
  Position,
  Protocol,
  Side,
} from "@/lib/types";
import type { TickStore } from "@/lib/stream/ticks";
import { estimateCharges, type RateCard } from "./charges";

/**
 * Virtual execution ledger — port of `backend/app/ledger.py`.
 *
 * Backs Paper Mode end-to-end (simulated fills with slippage, mark-to-market from
 * the live feed) and doubles as the local book of record in Live Mode, so the
 * HUD, the risk loop and panic-flatten behave identically in both.
 */

export function applySlippage(price: number, side: Side, pct: number): number {
  if (price <= 0) return price;
  const factor = side === "BUY" ? 1 + pct : 1 - pct;
  return Number(Math.max(0.05, price * factor).toFixed(2));
}

const r2 = (n: number) => Number(n.toFixed(2));

export class Ledger {
  private positions = new Map<string, Position>();
  private closed: Position[] = [];
  private seq = 0;

  capital: number;
  startingCapital: number;
  realised = 0;
  charges = 0;
  /**
   * Bumped on every state change that would alter what `snapshot()` returns —
   * open/close/reduce/reset always, `markToMarket` only when a mark actually
   * moved. The 1 Hz loop reads this to decide whether the board has anything
   * new to paint, so it must never be bumped for a no-op pass.
   */
  revision = 0;

  constructor(
    capital: number,
    private slippagePct: number,
    /**
     * Kept as a floor only. Real charges are computed per leg from the rate
     * card — a flat fee flatters small-premium scalps and penalises size — but
     * a broker's minimum still applies when the percentages round to nothing.
     */
    private costPerOrder: number,
    private rates?: RateCard,
  ) {
    this.capital = capital;
    this.startingCapital = capital;
  }

  /** Statutory + broker charges on one leg, never below the broker's minimum. */
  private legCharges(side: Side, price: number, quantity: number): number {
    const c = estimateCharges({ side, price, quantity }, this.rates);
    return Math.max(this.costPerOrder, c.total);
  }

  private nextId(): string {
    const t = new Date();
    const hhmmss =
      String(t.getHours()).padStart(2, "0") +
      String(t.getMinutes()).padStart(2, "0") +
      String(t.getSeconds()).padStart(2, "0");
    this.seq += 1;
    return `DK-${hhmmss}-${String(this.seq).padStart(3, "0")}`;
  }

  open(params: {
    underlying: string;
    token: string;
    tradingSymbol: string;
    quantity: number;
    lots: number;
    lotSize: number;
    price: number;
    side?: Side;
    optionType?: OptionType | null;
    strike?: number | null;
    stopLoss?: number | null;
    target?: number | null;
    protocol?: Protocol | null;
    /** Index spot at entry — lets a risk guard tell a real move from theta noise. */
    entrySpot?: number | null;
    mode: ExecutionMode;
    automation?: Automation;
    /** Which broker's session this fill came from — null for a paper trade taken signed out. */
    broker?: Broker | null;
  }): Position {
    const pos: Position = {
      id: this.nextId(),
      underlying: params.underlying,
      token: params.token,
      trading_symbol: params.tradingSymbol,
      option_type: params.optionType ?? null,
      strike: params.strike ?? null,
      side: params.side ?? "BUY",
      quantity: params.quantity,
      lots: params.lots,
      lot_size: params.lotSize,
      avg_price: r2(params.price),
      ltp: r2(params.price),
      entry_spot: params.entrySpot ?? null,
      stop_loss: params.stopLoss ?? null,
      target: params.target ?? null,
      unrealised_pnl: 0,
      realised_pnl: 0,
      pnl_pct: 0,
      protocol: params.protocol ?? null,
      opened_at: new Date().toISOString().slice(0, 19),
      closed_at: null,
      exit_price: null,
      exit_reason: null,
      status: "OPEN",
      mode: params.mode,
      automation: params.automation ?? "manual",
      broker: params.broker ?? null,
    };
    this.positions.set(pos.id, pos);
    const cost = this.legCharges(pos.side, pos.avg_price, pos.quantity);
    this.charges = r2(this.charges + cost);
    this.capital = r2(this.capital - cost);
    this.revision += 1;
    return pos;
  }

  close(positionId: string, price: number, reason = "MANUAL"): Position | null {
    const pos = this.positions.get(positionId);
    if (!pos) return null;
    this.positions.delete(positionId);

    const exit = r2(price);
    const direction = pos.side === "BUY" ? 1 : -1;
    const pnl = (exit - pos.avg_price) * pos.quantity * direction;

    pos.exit_price = exit;
    pos.exit_reason = reason;
    pos.realised_pnl = r2(pos.realised_pnl + pnl);
    pos.unrealised_pnl = 0;
    pos.ltp = exit;
    pos.pnl_pct = pos.avg_price
      ? r2(((exit - pos.avg_price) / pos.avg_price) * 100 * direction)
      : 0;
    pos.status = "CLOSED";
    pos.closed_at = new Date().toISOString().slice(0, 19);

    this.realised = r2(this.realised + pnl);
    // The exit leg is the opposite side of the entry: a long is closed by a
    // sell, which is the leg STT is levied on.
    const cost = this.legCharges(pos.side === "BUY" ? "SELL" : "BUY", exit, pos.quantity);
    this.charges = r2(this.charges + cost);
    this.capital = r2(this.capital + pnl - cost);
    this.closed.push(pos);
    this.revision += 1;
    return pos;
  }

  /** Scale out of part of a position (the Weakening-quadrant TP1 protocol). */
  reduce(positionId: string, lots: number, price: number, reason = "TP1"): Position | null {
    const pos = this.positions.get(positionId);
    if (!pos || lots <= 0) return null;
    if (lots >= pos.lots) return this.close(positionId, price, reason);

    const qty = lots * pos.lot_size;
    const direction = pos.side === "BUY" ? 1 : -1;
    const pnl = (r2(price) - pos.avg_price) * qty * direction;

    pos.lots -= lots;
    pos.quantity -= qty;
    pos.realised_pnl = r2(pos.realised_pnl + pnl);
    this.realised = r2(this.realised + pnl);
    // A scale-out is an executed order like any other, and is charged like one.
    const cost = this.legCharges(pos.side === "BUY" ? "SELL" : "BUY", r2(price), qty);
    this.charges = r2(this.charges + cost);
    this.capital = r2(this.capital + pnl - cost);
    this.revision += 1;
    return pos;
  }

  /**
   * Re-admit a position a previous session left open — same map a freshly
   * opened position lives in, so `markToMarket` and every `runGuards` check
   * (stop, target, invalidation, Weakening scale-out) treat it identically to
   * one opened this session, instead of the frozen, read-only snapshot a
   * reload otherwise leaves behind. No capital or charge is touched here:
   * both were already applied against whatever session actually opened it,
   * and this session's ledger has no record of that to subtract a second time.
   */
  restore(position: Position): void {
    if (this.positions.has(position.id)) return;
    this.positions.set(position.id, { ...position });
    this.revision += 1;
  }

  /**
   * Seed the wallet's running totals from a persisted checkpoint, on a fresh
   * session boot — the counterpart to `restore()` for positions, but for the
   * capital/charges/realised numbers rather than an individual position.
   * Never called mid-session: unlike `reset()` this does not touch open or
   * closed positions, so it must run before anything else re-admits them.
   *
   * Deliberately leaves `startingCapital` alone: it stays the constructor's
   * original default, so a later "reset paper wallet" (`reset()` with no
   * argument) goes back to the app's true starting capital rather than
   * whatever this account's wallet happened to hold at last login.
   */
  restoreWallet(capital: number, charges: number, realised: number): void {
    this.capital = r2(capital);
    this.charges = r2(charges);
    this.realised = r2(realised);
    this.revision += 1;
  }

  /** True if marking `pos` to `ltp` would leave it exactly as it is. */
  private static markIsNoop(pos: Position, ltp: number): boolean {
    return pos.ltp === r2(ltp);
  }

  markToMarket(ticks: TickStore): void {
    for (const pos of this.positions.values()) {
      const ltp = ticks.ltp(pos.token, pos.ltp);
      if (ltp <= 0 || Ledger.markIsNoop(pos, ltp)) continue;
      const direction = pos.side === "BUY" ? 1 : -1;
      pos.ltp = r2(ltp);
      pos.unrealised_pnl = r2((ltp - pos.avg_price) * pos.quantity * direction);
      pos.pnl_pct = pos.avg_price
        ? r2(((ltp - pos.avg_price) / pos.avg_price) * 100 * direction)
        : 0;
      this.revision += 1;
    }
  }

  get openPositions(): Position[] {
    return [...this.positions.values()];
  }

  get(positionId: string): Position | undefined {
    return this.positions.get(positionId);
  }

  positionsFor(underlying: string): Position[] {
    return this.openPositions.filter((p) => p.underlying === underlying);
  }

  get openPnl(): number {
    return r2(this.openPositions.reduce((a, p) => a + p.unrealised_pnl, 0));
  }

  get deployed(): number {
    return r2(this.openPositions.reduce((a, p) => a + p.avg_price * p.quantity, 0));
  }

  get equity(): number {
    return r2(this.capital + this.openPnl);
  }

  get slippage(): number {
    return this.slippagePct;
  }

  snapshot(mode: ExecutionMode): LedgerSnapshot {
    return {
      mode,
      capital: r2(this.capital),
      equity: this.equity,
      open_positions: this.openPositions,
      closed_positions: this.closed.slice(-25),
      open_pnl: this.openPnl,
      realised_pnl: r2(this.realised),
      total_pnl: r2(this.realised + this.openPnl),
      deployed_margin: this.deployed,
      charges: r2(this.charges),
    };
  }

  reset(capital?: number): void {
    this.startingCapital = capital ?? this.startingCapital;
    this.capital = this.startingCapital;
    this.realised = 0;
    this.charges = 0;
    this.positions.clear();
    this.closed = [];
    this.revision += 1;
  }
}
