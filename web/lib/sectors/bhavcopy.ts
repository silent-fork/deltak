import "server-only";

import fs from "node:fs";
import os from "node:os";

import { NSEClient } from "nse-bse-api";

/**
 * One day's close for every NSE index, keyed by the exact `Index Name`
 * string `indicesBhavcopy` prints — the same strings `SECTORS[].bhavcopyName`
 * and `BENCHMARK_BHAVCOPY_NAME` are written against (config.ts).
 */
export type IndexCloses = Map<string, number>;

let client: NSEClient | null = null;

function nse(): NSEClient {
  client ??= new NSEClient(os.tmpdir(), { server: true, timeout: 15_000 });
  return client;
}

/**
 * NSE only ever publishes one of these per *trading* day, and only after
 * that day's session has closed — asking for today mid-session or for a
 * weekend/holiday both legitimately come back empty, which callers handle by
 * walking backward a day at a time (see `rotation.ts`), not by treating it
 * as an error.
 */
export async function fetchIndexCloses(date: Date): Promise<IndexCloses> {
  const path = await nse().indicesBhavcopy(date);
  const text = fs.readFileSync(path, "utf-8");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return new Map();

  const header = lines[0]!.split(",");
  const nameIdx = header.indexOf("Index Name");
  const closeIdx = header.indexOf("Closing Index Value");
  if (nameIdx < 0 || closeIdx < 0) return new Map();

  const closes: IndexCloses = new Map();
  for (const line of lines.slice(1)) {
    const cols = line.split(",");
    const name = cols[nameIdx]?.trim();
    const close = Number(cols[closeIdx]);
    if (name && Number.isFinite(close) && close > 0) closes.set(name, close);
  }
  return closes;
}
