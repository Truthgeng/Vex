import { NextResponse } from "next/server";
import { publicState, saveTab } from "@/lib/server/store";
import { botUsername } from "@/lib/server/telegram";
import { checkForTab, MAX_WATCHES, newWatch, runWatch } from "@/lib/server/watcher";
import { caught, fail, readInput, tabFrom } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Adds a project to the watchlist and runs its first check right away. */
export async function POST(req: Request) {
  try {
    const tab = await tabFrom(req);
    if (!tab) return fail("Open a tab first.", 401);
    const input = readInput(await req.json());
    if (tab.watches.length >= MAX_WATCHES) return fail(`You can watch up to ${MAX_WATCHES} projects. Remove one first.`);
    const dupe = tab.watches.find((w) => w.handle?.toLowerCase() === input.handle?.toLowerCase() && w.contract?.toLowerCase() === input.contract?.toLowerCase());
    if (dupe) return fail("You're already watching that.");
    const watch = newWatch(input);
    tab.watches.unshift(watch);
    await saveTab(tab);
    // The first check is the baseline every later check is compared to
    const report = await checkForTab(tab, input, { auto: false, watch, depth: "deep", decision: "First deep check, to set the baseline." }).catch(() => null);
    return NextResponse.json({ tab: publicState(tab, botUsername()), report });
  } catch (e) {
    return caught(e);
  }
}

/**
 * Runs one watch now instead of waiting for the daily run. Body: { id, mode }.
 * mode "decide" runs exactly what the daily run does (scan, then a deep check
 * only if the scan gives a reason). mode "deep" buys a deep check outright.
 */
export async function PATCH(req: Request) {
  try {
    const tab = await tabFrom(req);
    if (!tab) return fail("Open a tab first.", 401);
    const { id, mode } = (await req.json()) as { id?: string; mode?: "decide" | "deep" };
    const watch = tab.watches.find((w) => w.id === id);
    if (!watch) return fail("That watch is gone.", 404);
    if (mode === "decide") {
      const report = await runWatch(tab, watch, false);
      return NextResponse.json({ tab: publicState(tab, botUsername()), report });
    }
    const report = await checkForTab(tab, { handle: watch.handle, contract: watch.contract as `0x${string}` | undefined }, { auto: false, watch, depth: "deep", decision: "You asked for a deep check." });
    return NextResponse.json({ tab: publicState(tab, botUsername()), report });
  } catch (e) {
    return caught(e);
  }
}

/** Stops watching. Query: ?id= */
export async function DELETE(req: Request) {
  const tab = await tabFrom(req);
  if (!tab) return fail("Open a tab first.", 401);
  const id = new URL(req.url).searchParams.get("id");
  tab.watches = tab.watches.filter((w) => w.id !== id);
  await saveTab(tab);
  return NextResponse.json({ tab: publicState(tab, botUsername()) });
}
