import type { ChainSignals, SocialSignals, Verdict } from "@/lib/types";

/**
 * Fixed rules, so the same project always gets the same score. Starts at 100
 * and takes points off for each farming sign. Each rule says why in plain words.
 */
export function judge(social: SocialSignals | null | undefined, chain: ChainSignals | null | undefined) {
  const reasons: string[] = [];
  let score = 100;
  let evidence = 0;
  const hit = (points: number, why: string) => {
    score -= points;
    reasons.push(why);
  };
  const pct = (n: number) => `${Math.round(n * 100)}%`;

  if (social && social.posts >= 5) {
    evidence++;
    if (social.topThreeShare > 0.5) hit(20, `3 accounts wrote ${pct(social.topThreeShare)} of the posts tagging it.`);
    if (social.copyPasteShare > 0.25) hit(20, `${pct(social.copyPasteShare)} of posts repeat the same text.`);
    if (social.tinyAccountShare > 0.6) hit(15, `${pct(social.tinyAccountShare)} of posting accounts have under 100 followers.`);
    if (social.newAccountShare > 0.4) hit(15, `${pct(social.newAccountShare)} of posting accounts are under 90 days old.`);
    if (social.accounts / social.posts > 0.7) reasons.push(`${social.accounts} different accounts across ${social.posts} posts, which looks organic.`);
  } else if (social) {
    reasons.push(`Only ${social.posts} posts tagged it in 7 days, too few to judge.`);
  }

  if (chain && chain.transfers >= 20) {
    evidence++;
    if (chain.backAndForthShare > 0.3) hit(20, `${pct(chain.backAndForthShare)} of transfers go back and forth between the same wallets.`);
    if (chain.topTenShare > 0.8) hit(10, `10 wallets touch ${pct(chain.topTenShare)} of transfers (pools and routers can cause some of this).`);
    if (chain.wallets >= 100) reasons.push(`${chain.wallets} wallets moved the token in ${chain.hours}h.`);
  } else if (chain) {
    reasons.push(`Only ${chain.transfers} transfers in ${chain.hours}h, too few to judge.`);
  }

  score = Math.max(0, score);
  const verdict: Verdict = evidence === 0 ? "not enough data" : score >= 70 ? "looks real" : score >= 45 ? "mixed" : "looks farmed";
  return { score: evidence ? score : 0, verdict, reasons };
}
