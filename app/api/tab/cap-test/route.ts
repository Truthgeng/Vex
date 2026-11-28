import { NextResponse } from "next/server";
import { runCapTest } from "@/lib/server/captest";
import { caught, fail, tabFrom } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Asks Altana to let Vex overspend this tab by 0.01 USDC, and records the answer. */
export async function POST(req: Request) {
  const tab = await tabFrom(req);
  if (!tab) return fail("Open a tab first.", 401);
  try {
    return NextResponse.json(await runCapTest(tab));
  } catch (e) {
    return caught(e);
  }
}
