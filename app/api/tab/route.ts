import { NextResponse } from "next/server";
import { accountHasKey, keyHashForSessionOrKey, type SerializedSession } from "@altananetwork/sdk";
import type { PublicClient } from "viem";
import { sessionSigner, publicClient } from "@/lib/server/agent";
import { DEMO_KEY } from "@/lib/server/scout";
import { getTab, hash, newToken, publicState, removeTab, saveTab, setLinkCode, type TabRecord } from "@/lib/server/store";
import { botUsername } from "@/lib/server/telegram";
import { caught, fail, tabFrom } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** The page's own tab: watches, activity, Telegram link. */
export async function GET(req: Request) {
  const tab = await tabFrom(req);
  if (!tab) return fail("No tab here yet.", 404);
  return NextResponse.json(publicState(tab, botUsername()));
}

/**
 * Registers a tab the user just opened onchain, and hands back the owner
 * token only this browser keeps. Every later call must carry it, so knowing a
 * wallet address is not enough to spend from its tab.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { session?: SerializedSession; demoWallet?: string; ownerToken?: string };
    // A demo tab works in any mode: sample data only, nothing can be charged to it
    const demo = !body.session && !!body.demoWallet && /^0x[0-9a-fA-F]{40}$/.test(body.demoWallet);
    const session: SerializedSession | undefined = demo
      ? { walletAddress: body.demoWallet as `0x${string}`, publicKey: DEMO_KEY, permissions: { calls: [], spend: [{ limit: "1000000", period: "day" }] }, expiry: Math.floor(Date.now() / 1000) + 7 * 86_400 }
      : body.session;
    if (!session?.walletAddress) return fail("Open a tab first.");
    const wallet = session.walletAddress.toLowerCase();

    if (!demo) {
      if (session.publicKey.toLowerCase() !== sessionSigner().publicKey.toLowerCase()) return fail("This tab was opened for a different agent.");
      if (session.expiry * 1000 <= Date.now()) return fail("That tab has already expired.");
      // The grant must really be onchain, not just described
      const held = await accountHasKey(publicClient() as unknown as PublicClient, session.walletAddress, keyHashForSessionOrKey(session.publicKey));
      if (!held) return fail("Couldn't find this tab onchain yet. Wait a few seconds and try again.", 409);
    }

    const existing = await getTab(wallet);
    const sameOwner = existing && body.ownerToken && existing.ownerHash === hash(body.ownerToken);
    const stale = existing && existing.session.expiry * 1000 <= Date.now();
    if (existing && !sameOwner && !stale && !demo) {
      return fail("This wallet already has a live tab from another browser. Close it there, or wait for it to expire.", 409);
    }

    const ownerToken = sameOwner ? body.ownerToken! : newToken();
    const record: TabRecord = {
      wallet,
      session,
      ownerHash: hash(ownerToken),
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      telegramChatId: sameOwner ? existing?.telegramChatId : undefined,
      linkCode: existing && sameOwner ? existing.linkCode : newToken().slice(0, 16),
      watches: sameOwner ? existing!.watches.map((w) => ({ ...w, paused: undefined })) : [],
      log: sameOwner ? existing!.log : [],
    };
    await saveTab(record);
    await setLinkCode(record.linkCode, wallet);
    return NextResponse.json({ ownerToken, tab: publicState(record, botUsername()) });
  } catch (e) {
    return caught(e);
  }
}

/** Forgets the tab after the user closed it onchain. */
export async function DELETE(req: Request) {
  const tab = await tabFrom(req);
  if (!tab) return fail("No tab here.", 404);
  await removeTab(tab.wallet);
  return NextResponse.json({ ok: true });
}
