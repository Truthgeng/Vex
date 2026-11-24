import type { Session } from "@altananetwork/sdk";
import { encodeFunctionData, erc20Abi, type Address, type Hex } from "viem";
import { CELO_USDC, CELO_CHAIN_ID, USDC_FEE_CURRENCY } from "@/lib/config";
import type { TabCharge } from "@/lib/types";
import { altana, agentAccount, agentWalletClient, publicClient, TabError } from "./agent";

/**
 * Takes the price of one check from the user's Altana wallet, as a USDC
 * transfer to the agent (tagged by Altana).
 *
 * This is the step Altana enforces onchain: the session key can only call
 * USDC.transfer, only up to the user's daily cap, only until the expiry. A
 * charge over the cap reverts at validation, so the agent cannot overspend
 * even if its own code is wrong.
 */
export async function chargeTab(session: Session, amount: bigint): Promise<TabCharge> {
  // Altana adds the attribution tag (appCode), so the calldata stays plain
  const data = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [agentAccount().address, amount] });
  const res = await altana().execute({
    session,
    calls: [{ to: CELO_USDC, data, value: 0n }],
    feeToken: CELO_USDC,
    chainId: CELO_CHAIN_ID,
  });
  if (res.status !== "CONFIRMED") {
    // The usual reason is the daily cap. Altana does not say which limit tripped,
    // so name the likely ones.
    throw new TabError(
      "Your tab refused this charge. Either today's cap is used up, the tab ran out, or the wallet is short on USDC.",
      402,
    );
  }
  return { wallet: session.walletAddress, amount: amount.toString(), txHash: res.transactionHash };
}

/** Sends a charge back when the check could not be done. Tagged like everything else. */
export async function refundTab(to: Address, amount: bigint): Promise<Hex | undefined> {
  try {
    const hash = await agentWalletClient().writeContract({
      address: CELO_USDC,
      abi: erc20Abi,
      functionName: "transfer",
      args: [to, amount],
      feeCurrency: USDC_FEE_CURRENCY,
    });
    await publicClient().waitForTransactionReceipt({ hash });
    return hash;
  } catch (e) {
    console.error("refund failed, pay it back by hand", to, amount.toString(), e);
    return undefined;
  }
}
