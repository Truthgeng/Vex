import { NextResponse } from "next/server";
import type { SerializedSession } from "@altananetwork/sdk";
import { runCheck } from "@/lib/server/scout";
import { TabError } from "@/lib/server/agent";
import type { CheckInput } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const HANDLE = /^[A-Za-z0-9_]{1,15}$/;
const CONTRACT = /^0x[0-9a-fA-F]{40}$/;

export async function POST(req: Request) {
  let body: { handle?: string; contract?: string; session?: SerializedSession };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Send JSON." }, { status: 400 });
  }
  const handle = body.handle?.trim().replace(/^@/, "") || undefined;
  const contract = body.contract?.trim() || undefined;
  if (handle && !HANDLE.test(handle)) return NextResponse.json({ error: "That X handle doesn't look right." }, { status: 400 });
  if (contract && !CONTRACT.test(contract)) return NextResponse.json({ error: "That contract address doesn't look right." }, { status: 400 });

  const input: CheckInput = { handle, contract: contract as CheckInput["contract"] };
  try {
    return NextResponse.json(await runCheck(input, body.session));
  } catch (e) {
    if (e instanceof TabError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("check failed", e);
    return NextResponse.json({ error: "Something broke on our side. Nothing extra was charged." }, { status: 500 });
  }
}
