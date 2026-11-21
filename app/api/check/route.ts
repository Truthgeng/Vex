import { NextResponse } from "next/server";
import { mockReport } from "@/lib/server/mock";
import { isMock } from "@/lib/server/scout";
import { checkForTab, subjectOf } from "@/lib/server/watcher";
import { caught, fail, readInput, tabFrom } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** A one-off check, paid from the caller's own tab. */
export async function POST(req: Request) {
  try {
    const input = readInput(await req.json());
    const tab = await tabFrom(req);
    if (!tab) {
      if (isMock()) return NextResponse.json(mockReport(subjectOf(input)));
      return fail("Open a tab first.", 401);
    }
    return NextResponse.json(await checkForTab(tab, input, { auto: false }));
  } catch (e) {
    return caught(e);
  }
}
