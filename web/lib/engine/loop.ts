/**
 * What the 1 Hz loop is allowed to do this pass.
 *
 * Split out of the loop itself because getting it wrong is invisible: the
 * terminal keeps painting, and only the shape of the rotation graph quietly
 * tells you that a replayed session has been ground down by a pipeline running
 * against frozen prices. The rules are small enough to state, so they are
 * stated here and tested.
 *
 * The trap this exists to avoid: a connected socket is not a running market.
 * SmartStream accepts a subscription at any hour and then sends nothing, so
 * "feed is live" and "the exchange is trading" are different questions, and the
 * board must be driven by the second one.
 */

export interface TickInputs {
  /** Exchange hours, by the IST clock. */
  marketOpen: boolean;
  /** A synthetic feed is its own market — it exists to be watched at any hour. */
  simulated: boolean;
  /** Prints have arrived since the previous pass. */
  printsChanged: boolean;
  /** Historical seeding or replay delivered something since the previous pass. */
  seedsChanged: boolean;
  /** A chain has been built at least once. */
  hasChains: boolean;
}

export interface TickPlan {
  /** Push a new sample into the RRG windows and the wall trail. */
  advance: boolean;
  /** Rebuild the chains and re-evaluate the signals. */
  rebuild: boolean;
  /** Run the risk guards. */
  guards: boolean;
  /** Nothing is being recomputed — the board is frozen on a finished session. */
  settled: boolean;
}

export function planTick(input: TickInputs): TickPlan {
  const trading = input.marketOpen || input.simulated;

  // Rotation is a series in market time. It advances only when the market is
  // trading *and* something actually printed; anything else would stamp the
  // same price into the window once a second.
  const advance = trading && input.printsChanged;

  // Rebuild for new prints, for newly replayed history, or to get the first
  // chain on screen. Otherwise the inputs are unchanged and so is the answer.
  const rebuild = advance || input.seedsChanged || !input.hasChains;

  // Guards run for the whole session rather than per print: the 3:15 PM
  // Daylight Rest is a clock event, and a feed that goes quiet for a second
  // must not be able to skip it. Out of hours there is nothing to guard — the
  // exchange cannot fill an exit, and the only prices available are stale.
  const guards = trading;

  return { advance, rebuild, guards, settled: !rebuild };
}
