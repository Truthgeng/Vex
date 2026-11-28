import { checkX402SpendCap, type Session } from "@altananetwork/sdk";
import type { PublicClient } from "viem";
import { CELO_USDC, CELO_CHAIN_ID } from "@/lib/config";
import type { Allowance } from "@/lib/types";
import { agentAccount, publicClient } from "./agent";

/**
 * What the tab may still spend in the current period, read from the user's
 * account on Celo (its spendInfos for this session key), not from Vex's own
 * log. Periods are Altana's: a day starts at 00:00 UTC.
 *
 * This borrows the SDK's x402 cap reader with a zero amount: it is a read, it
 * signs nothing and changes nothing.
 */
export async function readAllowance(session: Session): Promise<Allowance> {
  const status = await checkX402SpendCap(
    session,
    { scheme: "exact", network: `eip155:${CELO_CHAIN_ID}`, asset: CELO_USDC, amount: "0", payTo: agentAccount().address },
    { publicClient: publicClient() as unknown as PublicClient },
  );
  // The tightest cap on USDC decides what is left
  const cap = [...status.caps].sort((a, b) => (a.remaining < b.remaining ? -1 : 1))[0];
  if (!cap) return { limit: "0", spent: "0", remaining: "0", periodStart: 0, source: "chain" };
  return {
    limit: cap.limit.toString(),
    spent: cap.spentOnChain.toString(),
    remaining: cap.remaining.toString(),
    periodStart: cap.periodStart,
    source: "chain",
  };
}
