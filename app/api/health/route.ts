import { NextResponse } from "next/server";
import { storeCheck } from "@/lib/server/store";
import { isMock } from "@/lib/server/scout";
import { telegramReady } from "@/lib/server/telegram";

export const dynamic = "force-dynamic";

/** Is Vex able to remember things, and what is switched on. No secrets in the answer. */
export async function GET() {
  const store = await storeCheck().catch((e) => ({ kind: "error", ok: false, ms: 0, error: (e as Error).message }));
  return NextResponse.json({
    live: !isMock(),
    store,
    telegram: telegramReady(),
    attribution: !!process.env.ATTRIBUTION_CODE,
    cron: !!process.env.CRON_SECRET,
  });
}
