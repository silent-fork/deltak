"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { EngineSnapshot } from "./types";

export type StreamState = "connecting" | "live" | "reconnecting" | "error";

/**
 * Subscribes to the engine's SSE snapshot stream.
 *
 * EventSource reconnects on its own, but it gives up on a hard error, so we
 * tear down and rebuild with a capped backoff. The last good snapshot is kept
 * on screen while reconnecting — a trading HUD that blanks out mid-session is
 * worse than one showing a clearly-labelled stale frame.
 */
export function useEngineStream() {
  const [snapshot, setSnapshot] = useState<EngineSnapshot | null>(null);
  const [state, setState] = useState<StreamState>("connecting");
  const [lastFrameAt, setLastFrameAt] = useState<number | null>(null);

  const sourceRef = useRef<EventSource | null>(null);
  const retryRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    sourceRef.current?.close();
    const es = new EventSource("/api/stream");
    sourceRef.current = es;

    es.addEventListener("open", () => {
      retryRef.current = 0;
      setState("live");
    });

    es.addEventListener("snapshot", (event) => {
      try {
        setSnapshot(JSON.parse((event as MessageEvent).data) as EngineSnapshot);
        setLastFrameAt(Date.now());
        setState("live");
      } catch {
        /* a torn frame is not fatal — the next one arrives in a second */
      }
    });

    es.addEventListener("error", () => {
      es.close();
      retryRef.current += 1;
      setState(retryRef.current > 5 ? "error" : "reconnecting");
      const delay = Math.min(1000 * 2 ** (retryRef.current - 1), 15000);
      timerRef.current = setTimeout(connect, delay);
    });
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      sourceRef.current?.close();
    };
  }, [connect]);

  const reconnect = useCallback(() => {
    retryRef.current = 0;
    setState("connecting");
    connect();
  }, [connect]);

  const stale = lastFrameAt !== null && Date.now() - lastFrameAt > 8000;

  return { snapshot, state, stale, lastFrameAt, reconnect };
}

/** Local 1 Hz countdown, seeded from the server so the clock never drifts. */
export function useCountdown(seedSeconds: number | undefined) {
  const [seconds, setSeconds] = useState(seedSeconds ?? 0);

  useEffect(() => {
    if (seedSeconds === undefined) return;
    setSeconds(seedSeconds);
  }, [seedSeconds]);

  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, []);

  return seconds;
}

/** Fires an up/down flash class whenever a numeric value changes. */
export function useTickFlash(value: number | undefined) {
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const prev = useRef<number | undefined>(value);

  useEffect(() => {
    if (value === undefined || prev.current === undefined) {
      prev.current = value;
      return;
    }
    if (value === prev.current) return;
    setFlash(value > prev.current ? "up" : "down");
    prev.current = value;
    const id = setTimeout(() => setFlash(null), 620);
    return () => clearTimeout(id);
  }, [value]);

  return flash;
}
