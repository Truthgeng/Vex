import { createHash } from "node:crypto";
import type { Report } from "@/lib/types";
import { judge } from "./verdict";
import { summarise } from "./onchain";

/**
 * Sample result for demo mode. Nothing here is real. Numbers come from the
 * subject plus the current day, so each project looks different and can drift
 * from one day to the next, which lets the watchlist and alerts be tried.
 */
export function mockReport(subject: string, wallet?: string, depth: "scan" | "deep" = "deep"): Report {
  const day = new Date().toISOString().slice(0, 10);
  const h = createHash("sha256").update(subject.toLowerCase()).digest();
  // Scans also drift by the hour, so "Let Vex decide" sometimes finds a reason to go deep
  const salt = depth === "scan" ? day + new Date().getUTCHours() + Math.floor(Date.now() / 600_000) : day;
  const d = createHash("sha256").update(subject.toLowerCase() + salt).digest();
  const weight = depth === "scan" ? 0.9 : 0.2;
  const pick = (i: number, lo: number, hi: number) => Math.round((lo + ((h[i] * (1 - weight) + d[i] * weight) / 255) * (hi - lo)) * 100) / 100;

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
  const { score, verdict, reasons } = judge(social, depth === "deep" ? chain : undefined);
  return {
    subject,
    score,
    verdict,
    reasons,
    social,
    chain: depth === "deep" ? chain : undefined,
    charge: wallet ? { wallet, amount: depth === "deep" ? "50000" : "10000" } : undefined,
    paidCalls: (depth === "deep" ? ["x-search", "x-search", "chainstack"] : ["x-search"]).map((service) => ({
      service,
      amount: service === "chainstack" ? "10000" : "5000",
      paidFrom: "agent" as const,
      at: new Date().toISOString(),
    })),
    mode: "mock",
    depth,
    at: new Date().toISOString(),
  };
}
