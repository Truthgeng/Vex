import type { Report } from "@/lib/types";
import { judge } from "./verdict";
import { summarise } from "./onchain";

/** Sample result for building the UI without spending anything. Nothing here is real. */
export function mockReport(subject: string, wallet?: string): Report {
  const social = {
    posts: 40,
    accounts: 14,
    topThreeShare: 0.55,
    copyPasteShare: 0.3,
    tinyAccountShare: 0.64,
    newAccountShare: 0.2,
    sample: [{ author: "sample_user", text: "Sample post. Run with MOCK=0 for real data.", url: "https://x.com" }],
  };
  const w = (i: number) => `0x${i.toString(16).padStart(40, "0")}`;
  const moves: [string, string][] = [];
  for (let i = 1; i <= 60; i++) moves.push([w(i % 6 + 1), w((i + 1) % 6 + 1)]);
  const chain = summarise(moves);
  const { score, verdict, reasons } = judge(social, chain);
  return {
    subject,
    score,
    verdict,
    reasons,
    social,
    chain,
    charge: wallet ? { wallet, amount: "50000", txHash: undefined } : undefined,
    paidCalls: [
      { service: "x-search", amount: "5000", paidFrom: "agent", at: new Date().toISOString() },
      { service: "chainstack", amount: "10000", paidFrom: "agent", at: new Date().toISOString() },
    ],
    mode: "mock",
    at: new Date().toISOString(),
  };
}
