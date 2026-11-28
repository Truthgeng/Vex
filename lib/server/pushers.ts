import type { Post, Pusher } from "@/lib/types";
import { recallPromoters, rememberPromoters } from "./store";

const DAY = 86_400_000;
/** Posting about this many other watched projects in 30 days makes an account a serial promoter. */
export const SERIAL_AT = 3;

/**
 * The accounts doing the posting, loudest first, with what makes each one
 * worth a look. Flags are signals, not accusations: a real KOL can be a serial
 * promoter too, so the page shows the evidence and lets the user judge.
 */
export async function whoIsPushing(subject: string, posts: Post[]): Promise<Pusher[]> {
  const by = new Map<string, Post[]>();
  for (const p of posts) by.set(p.author, [...(by.get(p.author) ?? []), p]);

  // Remember who pushed this project, then ask what else they pushed lately
  const authors = [...by.keys()];
  const history = await recallPromoters(authors).catch(() => new Map<string, { subject: string; at: string }[]>());
  await rememberPromoters(subject, authors).catch(() => undefined);

  const list: Pusher[] = [...by.entries()].map(([author, ps]) => {
    const first = ps[0];
    const followers = first.followers;
    const ageDays = first.joined && !Number.isNaN(Date.parse(first.joined)) ? Math.floor((Date.now() - Date.parse(first.joined)) / DAY) : undefined;
    const likes = ps.map((p) => p.likes).filter((n): n is number => typeof n === "number");
    const avgLikes = likes.length ? Math.round((likes.reduce((a, b) => a + b, 0) / likes.length) * 10) / 10 : undefined;
    const others = [...new Set((history.get(author) ?? []).filter((h) => h.subject !== subject && Date.now() - Date.parse(h.at) < 30 * DAY).map((h) => h.subject))];

    const flags: string[] = [];
    if (ageDays !== undefined && ageDays < 90) flags.push(`account is ${ageDays} days old`);
    if (followers !== undefined && followers < 100) flags.push("under 100 followers");
    if (followers !== undefined && followers >= 5000 && avgLikes !== undefined && avgLikes < followers * 0.0005) flags.push("big following, almost no likes");
    if (others.length >= SERIAL_AT) flags.push(`pushed ${others.length} other watched projects this month`);
    if (ps.length >= 4) flags.push(`${ps.length} posts about it this week`);
    return { author, posts: ps.length, followers, ageDays, avgLikes, alsoPushed: others.slice(0, 6), flags };
  });

  return list.sort((a, b) => b.posts - a.posts || (b.followers ?? 0) - (a.followers ?? 0)).slice(0, 10);
}

/** Share of posts written by serial promoters, 0 to 1. */
export function serialShare(pushers: Pusher[], totalPosts: number): number {
  if (!totalPosts) return 0;
  const n = pushers.filter((p) => p.alsoPushed.length >= SERIAL_AT).reduce((a, p) => a + p.posts, 0);
  return Math.round((n / totalPosts) * 100) / 100;
}
