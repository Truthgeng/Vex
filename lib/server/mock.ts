import { createHash } from "node:crypto";
import type { Report } from "@/lib/types";
import { judge } from "./verdict";
import { summarise } from "./onchain";

/**
 * Sample result for demo mode. Nothing here is real. Numbers come from the
 * subject plus the current day, so each project looks different and can drift
 * from one day to the next, which lets the watchlist and alerts be tried.
 */
export function mockReport(subject: string, wallet?: string): Report {
  const day = new Date().toISOString().slice(0, 10);
  const h = createHash("sha256").update(subject.toLowerCase()).digest();
  const d = createHash("sha256").update(subject.toLowerCase() + day).digest();
  const pick = (i: number, lo: number, hi: number) => Math.round((lo + ((h[i] * 0.8 + d[i] * 0.2) / 255) * (hi - lo)) * 100) / 100;

  const posts = Math.round(pick(0, 12, 90));
  const social = {
    posts,
    accounts: Math.max(3, Math.round(posts * pick(1, 0.25, 0.9))),
    topThreeShare: pick(2, 0.1, 0.75),
    copyPasteShare: pick(3, 0, 0.5),
    tinyAccountShare: pick(4, 0.15, 0.85),
    newAccountShare: pick(5, 0.05, 0.6),
    sample: [{ author: "sample_account", text: "Sample post. Demo mode shows made-up data.", url: "https://x.com" }],
  };
  const w = (i: number) => `0x${i.toString(16).padStart(40, "0")}`;
  const moves: [string, string][] = [];
  const wallets = Math.round(pick(6, 8, 160));
  const washy = pick(7, 0, 1) > 0.6;
  for (let i = 1; i <= 120; i++) {
    const a = (i * 7) % wallets + 1;
    const b = washy && i % 2 ? a : ((i * 13) % wallets) + 1;
    moves.push(washy && i % 2 ? [w(b + 1), w(a)] : [w(a), w(b + 1)]);
  }
  const chain = summarise(moves);
  const { score, verdict, reasons } = judge(social, chain);
  return {
    subject,
    score,
    verdict,
    reasons,
    social,
    chain,
    charge: wallet ? { wallet, amount: "50000" } : undefined,
    paidCalls: [
      { service: "x-search", amount: "5000", paidFrom: "agent", at: new Date().toISOString() },
      { service: "x-search", amount: "5000", paidFrom: "agent", at: new Date().toISOString() },
      { service: "chainstack", amount: "10000", paidFrom: "agent", at: new Date().toISOString() },
    ],
    mode: "mock",
    at: new Date().toISOString(),
  };
}
