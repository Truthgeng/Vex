import { encodeFunctionData, erc20Abi } from "viem";
import { CELO_USDC, CELO_CHAIN_ID } from "@/lib/config";
import type { CapTest } from "@/lib/types";
import { altana, agentAccount, openTab } from "./agent";
import { readAllowance } from "./allowance";
import { isMock } from "./scout";
import { refundTab } from "./tab";
import { addCapTest, type TabRecord } from "./store";

const OVER_BY = 10_000n; // 0.01 USDC past what the cap has left

/**
 * Proves the cap is real. Vex asks Altana to move 0.01 USDC more than the
 * tab has left today, using the same session key and the same call it uses
 * for every check. The account should refuse it.
 *
 * Safe by construction: if the charge somehow went through, it is sent
 * straight back and the result says so plainly.
 */
export async function runCapTest(tab: TabRecord): Promise<CapTest> {
  if (isMock()) {
    const limit = tab.session.permissions.spend?.[0]?.limit ?? "1000000";
    const result: CapTest = {
      at: new Date().toISOString(),
      wallet: tab.wallet,
      attempted: (BigInt(limit) + OVER_BY).toString(),
      limit,
      spentBefore: "0",
      refused: true,
      reason: "Demo only. On a live tab, this asks Altana's account on Celo.",
      demo: true,
    };
    return result;
  }

  const session = openTab(tab.session);
  const room = await readAllowance(session);
  const attempted = BigInt(room.remaining) + OVER_BY;
  const base = { at: new Date().toISOString(), wallet: tab.wallet, attempted: attempted.toString(), limit: room.limit, spentBefore: room.spent, demo: false };
  const data = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [agentAccount().address, attempted] });

  let result: CapTest;
  try {
    const res = await altana().execute({ session, calls: [{ to: CELO_USDC, data, value: 0n }], feeToken: CELO_USDC, chainId: CELO_CHAIN_ID });
    if (res.status === "CONFIRMED") {
      // Should never happen. Give it back and say so
      const refund = await refundTab(session.walletAddress, attempted);
      result = { ...base, refused: false, reason: `The charge went through. It was refunded${refund ? "" : " by hand"}.`, tx: res.transactionHash };
    } else {
      result = { ...base, refused: true, reason: `Altana's relay returned ${res.status}${res.statusCode ? ` (${res.statusCode})` : ""}: the account rejected the call.`, tx: res.transactionHash };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const overCap = /ExceededSpendLimit|spend.?limit/i.test(msg);
    result = { ...base, refused: true, reason: overCap ? "Altana refused it: over the session's daily spend limit." : `Refused: ${msg.slice(0, 200)}` };
  }
  await addCapTest(result);
  return result;
}
