"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { useEngine } from "@/lib/useEngine";

/**
 * Shares the browser engine with the HUD panels.
 *
 * In the server build these components called REST endpoints; here the engine
 * lives in the page, so they call it directly. Context keeps that swap from
 * rippling through every component's props.
 */

type Engine = ReturnType<typeof useEngine>;

const EngineContext = createContext<Engine | null>(null);

export function EngineProvider({
  engine,
  children,
}: {
  engine: Engine;
  children: ReactNode;
}) {
  return <EngineContext.Provider value={engine}>{children}</EngineContext.Provider>;
}

export function useEngineContext(): Engine {
  const ctx = useContext(EngineContext);
  if (!ctx) {
    throw new Error("useEngineContext must be used inside <EngineProvider>.");
  }
  return ctx;
}
