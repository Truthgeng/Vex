import { NextResponse } from "next/server";
import { allWallets, getTab } from "@/lib/server/store";
import { checkForTab, isDue } from "@/lib/server/watcher";
import { isMock } from "@/lib/server/scout";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * The daily run, called by Vercel Cron (see vercel.json). Goes through every
 * live tab and checks each watch that is due, paying from that tab. No one
 * clicks anything: this is the part the tab exists for.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  }
  if (isMock()) return NextResponse.json({ skipped: "demo mode" });

  const started = Date.now();
  const done = { tabs: 0, checks: 0, failed: 0, skipped: 0 };
  for (const wallet of await allWallets()) {
    const tab = await getTab(wallet);
    if (!tab) continue;
    if (tab.session.expiry * 1000 <= Date.now()) {
      done.skipped += tab.watches.length;
      continue;
    }
    done.tabs++;
    for (const watch of tab.watches) {
      // Leave a margin before the function's time limit; the rest go tomorrow
      if (Date.now() - started > 250_000) return NextResponse.json({ ...done, stoppedEarly: true });
      if (!isDue(watch)) continue;
      try {
        await checkForTab(tab, { handle: watch.handle, contract: watch.contract as `0x${string}` | undefined }, { auto: true, watch });
        done.checks++;
      } catch (e) {
        done.failed++;
        console.error("watch failed", wallet, watch.id, e);
        // A tab out of cap for today won't pay for its other watches either
        if (watch.paused) break;
      }
    }
  }
  return NextResponse.json(done);
}
