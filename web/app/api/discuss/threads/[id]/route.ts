import { NextResponse } from "next/server";

import { getThread } from "@/lib/server/forum";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const thread = await getThread(id);
    if (!thread) return NextResponse.json({ detail: "Thread not found." }, { status: 404 });
    return NextResponse.json({ thread });
  } catch (err) {
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Failed to load thread." },
      { status: 502 },
    );
  }
}
