import { createHash } from "node:crypto";
import type { CheckInput, InsiderSnapshot, Pusher, Report } from "@/lib/types";
import { judge } from "./verdict";
import { summarise } from "./onchain";
import { compareInsiders } from "./insiders";

/** Sample accounts and holders for demo mode. Every name says it is a sample. */
function mockPushers(h: Buffer, posts: number): Pusher[] {
  const names = ["sample_alpha", "sample_degen", "sample_newbie", "sample_caller", "sample_fan", "sample_bot01"];
  return names.slice(0, 3 + (h[9] % 4)).map((author, i) => {
    const followers = [18000, 420, 35, 9600, 1200, 12][i];
    const ageDays = [900, 40, 12, 600, 300, 8][i];
    const flags: string[] = [];
    if (ageDays < 90) flags.push(`account is ${ageDays} days old`);
    if (followers < 100) flags.push("under 100 followers");
    if (i === 0 && h[10] % 2) flags.push("big following, almost no likes");
    const alsoPushed = i === 3 || (i === 1 && h[11] % 2) ? ["@sample_one", "@sample_two", "@sample_three"] : [];
    if (alsoPushed.length >= 3) flags.push(`pushed ${alsoPushed.length} other watched projects this month`);
    return { author, posts: Math.max(1, Math.round(posts / (i + 2))), followers, ageDays, avgLikes: i === 0 && h[10] % 2 ? 3 : Math.round(followers * 0.01), alsoPushed, flags };
  });
}

function mockInsiders(input: CheckInput, h: Buffer, d: Buffer): InsiderSnapshot {
  const w = (i: number) => `0x${(h[i] * 1e6 + i).toString(16).padStart(40, "0")}`;
  // The deployer's stake drifts by the day, so some days it "sells"
  const dep = Math.max(0.004, (h[12] / 255) * 0.12 - (d[12] % 3 === 0 ? 0.05 : 0));
  const top = Array.from({ length: 10 }, (_, i) => ({ address: w(i + 1), share: Math.round(((h[i + 13] / 255) * 0.08 + 0.002) * 10_000) / 10_000, isContract: false }))
    .sort((a, b) => b.share - a.share);
  return {
    chain: input.chain ?? "celo",
    contract: (input.contract ?? "0x").toLowerCase(),
    symbol: "SAMPLE",
    holdersCount: 300 + h[20] * 40,
    deployer: { address: w(0), share: Math.round(dep * 10_000) / 10_000, isContract: false },
    top,
    contracts: [{ address: w(30), share: 0.21, isContract: true, label: "Sample pool" }],
    topTenShare: Math.round(top.reduce((a, x) => a + x.share, 0) * 10_000) / 10_000,
    at: new Date().toISOString(),
  };
}

/**
 * Sample result for demo mode. Nothing here is real. Numbers come from the
 * subject plus the current day, so each project looks different and can drift
 * from one day to the next, which lets the watchlist and alerts be tried.
 */
export function mockReport(subject: string, wallet?: string, depth: "scan" | "deep" = "deep", input: CheckInput = {}, previous?: InsiderSnapshot | null): Report {
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
  const pushers = input.handle || !input.contract ? mockPushers(h, posts) : undefined;
  const insiders = input.contract ? compareInsiders(previous, mockInsiders(input, h, d)) : undefined;
  const serial = pushers ? pushers.filter((p) => p.alsoPushed.length >= 3).reduce((a, p) => a + p.posts, 0) / posts : 0;
  const { score, verdict, reasons } = judge(social, depth === "deep" ? chain : undefined, { insiders, serial });
  return {
    subject,
    score,
    verdict,
    reasons,
    social,
    chain: depth === "deep" ? chain : undefined,
    pushers,
    insiders,
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
