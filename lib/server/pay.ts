import { x402 } from "@celo/buy-core";
import { fetchWithX402, type Session } from "@altananetwork/sdk";
import { usdc, CELO_CHAIN_ID } from "@/lib/config";
import type { PaidCall } from "@/lib/types";
import { agentAccount } from "./agent";

export const BUY_GATEWAY = "https://gateway.usebuy.ai";

/** One paid POST to a buy service. Returns the parsed body. */
export type Payer = (service: string, path: string, body: unknown, maxUsd: string) => Promise<unknown>;

async function readBody(service: string, res: Response): Promise<unknown> {
  const text = await res.text();
  // Never retry a failed paid call: it may already have settled
  if (!res.ok) throw new Error(`${service} returned ${res.status}: ${text.slice(0, 300)}`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Tab mode (default). The fee for the check has already moved from the user's
 * Altana wallet to the agent, inside the user's onchain cap. The agent pays the
 * data services from its own wallet, one paid attempt per call, each with a
 * hard maximum.
 */
export function agentPayer(receipts: PaidCall[]): Payer {
  return async (service, path, body, maxUsd) => {
    const res = await x402.payingFetch(
      { account: agentAccount(), network: "celo", preferredToken: "USDC" },
      `${BUY_GATEWAY}${path}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        maxAmount: usdc(maxUsd),
        maxRetries: 1,
        onPayment: (info) => {
          receipts.push({ service, amount: String(info.amount ?? "0"), txHash: info.txHash, paidFrom: "agent", at: new Date().toISOString() });
        },
      },
    );
    return readBody(service, res);
  };
}

/**
 * Direct mode (experimental, PAY_MODE=direct). The agent pays each service
 * straight from the user's Altana wallet with an ERC-1271 x402 signature.
 *
 * Why this is not the default: since SDK 1.2.0, fetchWithX402 checks the
 * session's spend cap before it signs, but that check lives in the SDK, not
 * in the account. Signed payments never reach the account, so the chain does
 * not count them, and the SDK keeps their tally in memory, which starts at
 * zero in every new process. On Vercel that can be every request. A charge
 * through execute (tab mode) is the only spend the chain itself caps. The
 * per-call maximum below is an extra guard on top.
 */
export function directPayer(session: Session, receipts: PaidCall[]): Payer {
  return async (service, path, body, maxUsd) => {
    const url = `${BUY_GATEWAY}${path}`;
    const init = { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
    // Read the price first, unpaid, and refuse anything over the maximum before signing
    const probe = await fetch(url, init);
    if (probe.status !== 402) return readBody(service, probe);
    const asked = await askedAmount(probe);
    if (asked === null || asked > usdc(maxUsd)) {
      throw new Error(`${service} asked for ${asked ?? "an unreadable amount"}, over the ${maxUsd} USDC maximum`);
    }
    const res = await fetchWithX402(session, url, init, { chainId: CELO_CHAIN_ID, preferRail: "eip3009" });
    const settled = decodeSettlement(res.headers.get("PAYMENT-RESPONSE") ?? res.headers.get("X-PAYMENT-RESPONSE"));
    receipts.push({ service, amount: settled?.amount ?? "0", txHash: settled?.transaction, paidFrom: "tab", at: new Date().toISOString() });
    return readBody(service, res);
  };
}

/** The smallest Celo amount a 402 challenge asks for, from the v2 header or the body. */
async function askedAmount(res: Response): Promise<bigint | null> {
  let challenge: { accepts?: { network?: string; amount?: string; maxAmountRequired?: string }[] } | null = null;
  const header = res.headers.get("PAYMENT-REQUIRED");
  try {
    challenge = header ? JSON.parse(Buffer.from(header, "base64").toString("utf8")) : await res.json();
  } catch {
    return null;
  }
  const onCelo = (challenge?.accepts ?? []).filter((a) => a.network === `eip155:${CELO_CHAIN_ID}` || a.network === "celo");
  const amounts = onCelo.map((a) => a.amount ?? a.maxAmountRequired).filter((a): a is string => !!a).map(BigInt);
  return amounts.length ? amounts.reduce((a, b) => (a < b ? a : b)) : null;
}

function decodeSettlement(header: string | null): { transaction?: string; amount?: string } | null {
  if (!header) return null;
  try {
    return JSON.parse(Buffer.from(header, "base64").toString("utf8"));
  } catch {
    return null;
  }
}
