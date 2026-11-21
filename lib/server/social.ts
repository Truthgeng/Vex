import type { Post, SocialSignals } from "@/lib/types";
import type { Payer } from "./pay";

/** buy route for X search (TikHub behind the gateway). Body: { query, type: "latest" | "top" }. */
const X_SEARCH = "/v1/social/x/posts/search";
const MAX_X = () => process.env.MAX_X_SEARCH || "0.02";

const DAY = 86_400_000;

/** Posts from the last 7 days that tag the handle, not posts by the project itself. */
export async function postsTagging(handle: string, pay: Payer): Promise<Post[]> {
  const query = `@${handle} -from:${handle} within_time:7d`;
  const [latest, top] = await Promise.all([
    pay("x-search", X_SEARCH, { query, type: "latest" }, MAX_X()),
    pay("x-search", X_SEARCH, { query, type: "top" }, MAX_X()),
  ]);
  const byId = new Map<string, Post>();
  for (const p of [...readPosts(latest), ...readPosts(top)]) byId.set(p.id, p);
  const h = handle.toLowerCase();
  // X search matches loosely, so keep only posts that really mention the handle
  return [...byId.values()].filter((p) => p.author !== h && p.text.toLowerCase().includes(`@${h}`));
}

/**
 * Pulls posts out of whatever shape the search returns. Walks the reply and
 * takes any object that has post text and an author.
 */
export function readPosts(raw: unknown): Post[] {
  const out: Post[] = [];
  const walk = (node: unknown, depth: number) => {
    if (!node || typeof node !== "object" || depth > 8) return;
    if (Array.isArray(node)) return node.forEach((n) => walk(n, depth + 1));
    const o = node as Record<string, any>;
    const text = o.full_text ?? o.text ?? o.legacy?.full_text;
    const user = o.user_info ?? o.user ?? o.author ?? o.core?.user_results?.result?.legacy;
    const author = typeof user === "string" ? user : user?.screen_name ?? user?.username;
    if (typeof text === "string" && typeof author === "string") {
      out.push({
        id: String(o.tweet_id ?? o.id_str ?? o.rest_id ?? o.id ?? `${author}:${text.slice(0, 32)}`),
        text,
        author: author.replace(/^@/, "").toLowerCase(),
        followers: toNum(user?.followers_count ?? user?.followers),
        joined: typeof user === "object" ? user?.created_at : undefined,
        likes: toNum(o.favorite_count ?? o.favorites ?? o.likes),
      });
      return;
    }
    for (const v of Object.values(o)) walk(v, depth + 1);
  };
  walk(raw, 0);
  return out;
}

export function socialSignals(posts: Post[]): SocialSignals {
  const byAuthor = new Map<string, Post[]>();
  for (const p of posts) byAuthor.set(p.author, [...(byAuthor.get(p.author) ?? []), p]);
  const counts = [...byAuthor.values()].map((l) => l.length).sort((a, b) => b - a);
  const topThree = counts.slice(0, 3).reduce((a, b) => a + b, 0);

  // Copy-paste: same text once handles, links and numbers are stripped
  const shape = (t: string) => t.toLowerCase().replace(/@\w+|https?:\/\/\S+|\d+/g, "").replace(/\W+/g, " ").trim();
  const seen = new Map<string, number>();
  for (const p of posts) seen.set(shape(p.text), (seen.get(shape(p.text)) ?? 0) + 1);
  const copies = posts.filter((p) => shape(p.text).length > 20 && (seen.get(shape(p.text)) ?? 0) > 1).length;

  const accounts = [...byAuthor.values()].map((l) => l[0]);
  const withFollowers = accounts.filter((a) => a.followers !== undefined);
  const withAge = accounts.filter((a) => a.joined && !Number.isNaN(Date.parse(a.joined)));

  return {
    posts: posts.length,
    accounts: byAuthor.size,
    topThreeShare: ratio(topThree, posts.length),
    copyPasteShare: ratio(copies, posts.length),
    tinyAccountShare: ratio(withFollowers.filter((a) => a.followers! < 100).length, withFollowers.length),
    newAccountShare: ratio(withAge.filter((a) => Date.now() - Date.parse(a.joined!) < 90 * DAY).length, withAge.length),
    sample: posts.slice(0, 5).map((p) => ({ author: p.author, text: p.text.slice(0, 200), url: `https://x.com/${p.author}/status/${p.id}` })),
  };
}

const ratio = (a: number, b: number) => (b ? Math.round((a / b) * 100) / 100 : 0);
const toNum = (v: unknown) => (v === undefined || v === null || v === "" ? undefined : Number(v));
