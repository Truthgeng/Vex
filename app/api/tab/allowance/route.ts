import { NextResponse } from "next/server";
import { openTab } from "@/lib/server/agent";
import { readAllowance } from "@/lib/server/allowance";
import { isMock } from "@/lib/server/scout";
import { caught, fail, tabFrom } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** What the tab may still spend today, read from the user's account on Celo. */
export async function GET(req: Request) {
  const tab = await tabFrom(req);
  if (!tab) return fail("No tab here.", 404);
  if (isMock()) return NextResponse.json({ source: "demo" });
  try {
    return NextResponse.json(await readAllowance(openTab(tab.session)));
  } catch (e) {
    return caught(e);
  }
}
