import type { SerializedSession } from "@altananetwork/sdk";
import { usdc } from "@/lib/config";
import type { CheckInput, Depth, PaidCall, Report, TabCharge } from "@/lib/types";
import { openTab, TabError } from "./agent";
import { chargeTab, refundTab } from "./tab";
import { agentPayer, directPayer, type Payer } from "./pay";
import { postsTagging, socialSignals } from "./social";
import { chainSignals } from "./onchain";
import { judge } from "./verdict";
import { mockReport } from "./mock";

export const isMock = () => process.env.MOCK !== "0";
export const payMode = (): "tab" | "direct" => (process.env.PAY_MODE === "direct" ? "direct" : "tab");
/** A deep check: two X searches plus a day of onchain transfers. */
export const checkPrice = () => usdc(process.env.CHECK_PRICE || "0.05");
/** A scan: one X search, enough to notice that something moved. */
export const scanPrice = () => usdc(process.env.SCAN_PRICE || "0.01");
export const priceOf = (depth: Depth) => (depth === "scan" ? scanPrice() : checkPrice());

/**
 * One check. In tab mode: charge the user's Altana tab first (the onchain cap
 * decides if the agent may), then buy the data, then score it. If no data
 * came back at all, the charge is refunded.
 */
export async function runCheck(input: CheckInput, stored: SerializedSession | undefined, depth: Depth = "deep"): Promise<Report> {
  const subject = [input.handle && `@${input.handle}`, input.contract].filter(Boolean).join(" / ");
  if (!subject) throw new TabError("Give an X handle, a Celo token contract, or both.");
  // A scan only reads X. A watch with no handle has nothing to scan, so it goes deep
  if (depth === "scan" && !input.handle) depth = "deep";
  if (isMock()) return mockReport(subject, stored?.walletAddress, depth);
  if (!stored) throw new TabError("Open a tab first.");

  const session = openTab(stored);
  const mode = payMode();
  const paidCalls: PaidCall[] = [];
  let charge: TabCharge | undefined;
  let pay: Payer;

  if (mode === "tab") {
    charge = await chargeTab(session, priceOf(depth));
    pay = agentPayer(paidCalls);
  } else {
    pay = directPayer(session, paidCalls);
  }

  const [social, chain] = await Promise.all([
    input.handle
      ? postsTagging(input.handle, pay, depth === "deep").then(socialSignals).catch((e) => (console.error("x failed", e), null))
      : Promise.resolve(undefined),
    input.contract && depth === "deep"
      ? chainSignals(input.contract, pay).catch((e) => (console.error("chain failed", e), null))
      : Promise.resolve(undefined),
  ]);

  const nothing = (input.handle ? social === null : true) && (input.contract && depth === "deep" ? chain === null : true);
  if (nothing) {
    if (charge) charge.refundTx = await refundTab(session.walletAddress, BigInt(charge.amount));
    throw new TabError(
      charge?.refundTx ? "The data sources failed, so the charge was sent back. Try again shortly." : "The data sources failed. Try again shortly.",
      502,
    );
  }

  const { score, verdict, reasons } = judge(social, chain);
  return { subject, score, verdict, reasons, social, chain, charge, paidCalls, mode, depth, at: new Date().toISOString() };
}
