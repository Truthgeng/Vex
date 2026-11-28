import { Redis } from "@upstash/redis";
import { createHash, randomBytes } from "node:crypto";
import type { SerializedSession } from "@altananetwork/sdk";
import type { CapTest, LogEntry, TabState, Watch } from "@/lib/types";

/**
 * Everything Vex remembers, per tab. A tab is one user wallet; every tab is
 * granted to the same agent key, so the wallet is the id.
 *
 * Upstash Redis when it is connected (Vercel > Storage > Upstash, which sets
 * KV_REST_API_URL and KV_REST_API_TOKEN). Without it, memory, which is fine
 * for demo mode and forgets on every restart.
 */
export type TabRecord = {
  wallet: string;
  session: SerializedSession;
  ownerHash: string;
  createdAt: string;
  telegramChatId?: number;
  linkCode: string;
  watches: Watch[];
  log: LogEntry[];
};

export type ProofEntry = { at: string; wallet: string; subject: string; amount: string; tx?: string; auto: boolean };

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;
export const hasStore = () => !!redis;

const g = globalThis as unknown as { __vex?: Map<string, unknown> };
const mem = (g.__vex ??= new Map<string, unknown>());

async function get<T>(key: string): Promise<T | null> {
  if (redis) return (await redis.get<T>(key)) ?? null;
  return (mem.get(key) as T) ?? null;
}
async function set(key: string, value: unknown, ttlSeconds?: number) {
  if (redis) await (ttlSeconds ? redis.set(key, value, { ex: ttlSeconds }) : redis.set(key, value));
  else mem.set(key, value);
}
async function del(key: string) {
  if (redis) await redis.del(key);
  else mem.delete(key);
}

const tabKey = (wallet: string) => `tab:${wallet.toLowerCase()}`;
const ALL = "tabs";
const PROOF = "proof";

export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export const newToken = () => randomBytes(24).toString("hex");

export const getTab = (wallet: string) => get<TabRecord>(tabKey(wallet));

export async function saveTab(t: TabRecord) {
  t.log = t.log.slice(0, 60);
  await set(tabKey(t.wallet), t);
  if (redis) await redis.sadd(ALL, t.wallet.toLowerCase());
  else mem.set(ALL, [...new Set([...((mem.get(ALL) as string[]) ?? []), t.wallet.toLowerCase()])]);
}

export async function removeTab(wallet: string) {
  await del(tabKey(wallet));
  if (redis) await redis.srem(ALL, wallet.toLowerCase());
  else mem.set(ALL, ((mem.get(ALL) as string[]) ?? []).filter((w) => w !== wallet.toLowerCase()));
}

export async function allWallets(): Promise<string[]> {
  if (redis) return (await redis.smembers(ALL)) as string[];
  return (mem.get(ALL) as string[]) ?? [];
}

/** Finds the tab for a request and checks it carries that tab's owner token. */
export async function ownedTab(wallet: string | null, ownerToken: string | null): Promise<TabRecord | null> {
  if (!wallet || !ownerToken) return null;
  const t = await getTab(wallet);
  return t && t.ownerHash === hash(ownerToken) ? t : null;
}

export async function linkCodeWallet(code: string) {
  return get<string>(`link:${code}`);
}
export async function setLinkCode(code: string, wallet: string) {
  await set(`link:${code}`, wallet.toLowerCase(), 7 * 86_400);
}

/** Public record of every charge, for the proof page. Newest first, last 500. */
export async function addProof(p: ProofEntry) {
  if (redis) {
    await redis.lpush(PROOF, p);
    await redis.ltrim(PROOF, 0, 499);
  } else mem.set(PROOF, [p, ...((mem.get(PROOF) as ProofEntry[]) ?? [])].slice(0, 500));
}
export async function proofs(): Promise<ProofEntry[]> {
  if (redis) return (await redis.lrange<ProofEntry>(PROOF, 0, 499)) ?? [];
  return (mem.get(PROOF) as ProofEntry[]) ?? [];
}

/** Every cap test, refused or not, newest first. Public on the proof page. */
const CAPS = "captests";
export async function addCapTest(c: CapTest) {
  if (redis) {
    await redis.lpush(CAPS, c);
    await redis.ltrim(CAPS, 0, 99);
  } else mem.set(CAPS, [c, ...((mem.get(CAPS) as CapTest[]) ?? [])].slice(0, 100));
}
export async function capTests(): Promise<CapTest[]> {
  if (redis) return (await redis.lrange<CapTest>(CAPS, 0, 99)) ?? [];
  return (mem.get(CAPS) as CapTest[]) ?? [];
}

/** What the page is allowed to see about its own tab. */
export function publicState(t: TabRecord, botUsername?: string): TabState {
  return {
    wallet: t.wallet,
    session: t.session,
    watches: t.watches,
    log: t.log,
    telegram: t.telegramChatId
      ? { linked: true }
      : { linked: false, link: botUsername ? `https://t.me/${botUsername}?start=${t.linkCode}` : undefined },
  };
}
