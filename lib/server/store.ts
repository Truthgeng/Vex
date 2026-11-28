import { Redis } from "@upstash/redis";
import { createHash, randomBytes } from "node:crypto";
import type { SerializedSession } from "@altananetwork/sdk";
import type { CapTest, LogEntry, TabState, Watch } from "@/lib/types";

/**
 * Everything Vex remembers, per tab. A tab is one user wallet; every tab is
 * granted to the same agent key, so the wallet is the id.
 *
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

/*
 * Storage. Three backends behind one small interface, picked in this order:
 *
 * 1. Upstash Redis, when KV_REST_API_URL and KV_REST_API_TOKEN are set.
 * 2. A private Vercel Blob store, when BLOB_READ_WRITE_TOKEN is set. Each key
 *    is one private JSON file, read straight from storage (no CDN cache).
 *    Writes are last-one-wins, which is fine at Vex's volume.
 * 3. Memory, for local demo runs. Forgets on every restart.
 */
const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;
const blob = !redis && !!process.env.BLOB_READ_WRITE_TOKEN;
export const hasStore = () => !!redis || blob;
export const storeKind = () => (redis ? "redis" : blob ? "blob" : "memory");

const g = globalThis as unknown as { __vex?: Map<string, unknown> };
const mem = (g.__vex ??= new Map<string, unknown>());

type Boxed = { v: unknown; exp?: number };
const blobPath = (key: string) => `vex/${key.replace(/[^a-zA-Z0-9_-]+/g, "/")}.json`;

async function blobGet<T>(key: string): Promise<T | null> {
  const { get: getBlob } = await import("@vercel/blob");
  const res = await getBlob(blobPath(key), { access: "private", useCache: false }).catch(() => null);
  if (!res || !("stream" in res) || !res.stream) return null;
  const box = JSON.parse(await new Response(res.stream as ReadableStream).text()) as Boxed;
  if (box.exp && box.exp < Date.now()) return null;
  return (box.v as T) ?? null;
}
async function blobSet(key: string, value: unknown, ttlSeconds?: number) {
  const { put } = await import("@vercel/blob");
  const box: Boxed = { v: value, exp: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined };
  await put(blobPath(key), JSON.stringify(box), { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json" });
}
async function blobDel(key: string) {
  const { del: delBlob } = await import("@vercel/blob");
  await delBlob(blobPath(key)).catch(() => undefined);
}

async function get<T>(key: string): Promise<T | null> {
  if (redis) return (await redis.get<T>(key)) ?? null;
  if (blob) return blobGet<T>(key);
  return (mem.get(key) as T) ?? null;
}
async function set(key: string, value: unknown, ttlSeconds?: number) {
  if (redis) await (ttlSeconds ? redis.set(key, value, { ex: ttlSeconds }) : redis.set(key, value));
  else if (blob) await blobSet(key, value, ttlSeconds);
  else mem.set(key, value);
}
async function del(key: string) {
  if (redis) await redis.del(key);
  else if (blob) await blobDel(key);
  else mem.delete(key);
}

// Sets, lists and hashes: native on Redis, a JSON value everywhere else
async function setAdd(key: string, member: string) {
  if (redis) return void (await redis.sadd(key, member));
  const all = (await get<string[]>(key)) ?? [];
  if (!all.includes(member)) await set(key, [...all, member]);
}
async function setRemove(key: string, member: string) {
  if (redis) return void (await redis.srem(key, member));
  await set(key, ((await get<string[]>(key)) ?? []).filter((m) => m !== member));
}
async function setMembers(key: string): Promise<string[]> {
  if (redis) return (await redis.smembers(key)) as string[];
  return (await get<string[]>(key)) ?? [];
}
async function listPush<T>(key: string, item: T, max: number) {
  if (redis) {
    await redis.lpush(key, item);
    await redis.ltrim(key, 0, max - 1);
    return;
  }
  await set(key, [item, ...((await get<T[]>(key)) ?? [])].slice(0, max));
}
async function listAll<T>(key: string, max: number): Promise<T[]> {
  if (redis) return (await redis.lrange<T>(key, 0, max - 1)) ?? [];
  return ((await get<T[]>(key)) ?? []).slice(0, max);
}
async function hashGetMany<T>(key: string, fields: string[]): Promise<Record<string, T | undefined>> {
  if (redis) return ((await redis.hmget<Record<string, T>>(key, ...fields)) ?? {}) as Record<string, T | undefined>;
  const all = (await get<Record<string, T>>(key)) ?? {};
  return Object.fromEntries(fields.map((f) => [f, all[f]]));
}
async function hashSet<T>(key: string, values: Record<string, T>) {
  if (redis) return void (await redis.hset(key, values));
  await set(key, { ...((await get<Record<string, T>>(key)) ?? {}), ...values });
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
  await setAdd(ALL, t.wallet.toLowerCase());
}

export async function removeTab(wallet: string) {
  await del(tabKey(wallet));
  await setRemove(ALL, wallet.toLowerCase());
}

export const allWallets = () => setMembers(ALL);

/** Writes and reads back one value, to prove storage works where it runs. */
export async function storeCheck(): Promise<{ kind: string; ok: boolean; ms: number }> {
  const t = Date.now();
  const v = newToken().slice(0, 8);
  await set("health", v, 3600);
  const back = await get<string>("health");
  return { kind: storeKind(), ok: back === v, ms: Date.now() - t };
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
export const addProof = (p: ProofEntry) => listPush(PROOF, p, 500);
export const proofs = () => listAll<ProofEntry>(PROOF, 500);

/**
 * Which accounts posted about which watched projects, across every tab. This
 * is how Vex spots serial promoters. Only public X handles and project names
 * are kept, 30 entries per account.
 */
type Mention = { subject: string; at: string };
const PROMO = "promoters";
export async function recallPromoters(authors: string[]): Promise<Map<string, Mention[]>> {
  const out = new Map<string, Mention[]>();
  if (!authors.length) return out;
  const rows = await hashGetMany<Mention[]>(PROMO, authors);
  for (const a of authors) if (rows[a]) out.set(a, rows[a]!);
  return out;
}
export async function rememberPromoters(subject: string, authors: string[]) {
  if (!authors.length) return;
  const now = new Date().toISOString();
  const before = await recallPromoters(authors);
  const next: Record<string, Mention[]> = {};
  for (const a of authors) next[a] = [{ subject, at: now }, ...(before.get(a) ?? []).filter((m) => m.subject !== subject)].slice(0, 30);
  await hashSet(PROMO, next);
}

/** Every cap test, refused or not, newest first. Public on the proof page. */
const CAPS = "captests";
export const addCapTest = (c: CapTest) => listPush(CAPS, c, 100);
export const capTests = () => listAll<CapTest>(CAPS, 100);

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
