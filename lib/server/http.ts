import { NextResponse } from "next/server";
import { TabError } from "./agent";
import { ownedTab } from "./store";

export const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** The tab a request may act on: its wallet and owner token travel in headers. */
export async function tabFrom(req: Request) {
  return ownedTab(req.headers.get("x-vex-wallet"), req.headers.get("x-vex-token"));
}

export function caught(e: unknown) {
  if (e instanceof TabError) return fail(e.message, e.status);
  console.error(e);
  return fail("Something broke on our side. Nothing extra was charged.", 500);
}

const HANDLE = /^[A-Za-z0-9_]{1,15}$/;
const CONTRACT = /^0x[0-9a-fA-F]{40}$/;

/** Reads and checks an X handle and/or Celo contract from a request body. */
export function readInput(body: { handle?: string; contract?: string }) {
  const handle = body.handle?.trim().replace(/^@/, "") || undefined;
  const contract = body.contract?.trim() || undefined;
  if (!handle && !contract) throw new TabError("Give an X handle, a Celo token contract, or both.");
  if (handle && !HANDLE.test(handle)) throw new TabError("That X handle doesn't look right.");
  if (contract && !CONTRACT.test(contract)) throw new TabError("That contract address doesn't look right.");
  return { handle, contract: contract as `0x${string}` | undefined };
}
