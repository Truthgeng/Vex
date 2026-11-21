import type { ChainSignals } from "@/lib/types";
import { BUY_GATEWAY, type Payer } from "./pay";

const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const HOURS = 24;
const CHUNK = 3_000; // blocks per eth_getLogs, Celo makes about one block a second
const MAX_RPC = () => process.env.MAX_RPC || "0.02";

const hex = (n: number) => `0x${n.toString(16)}`;
const addr = (topic: string) => `0x${topic.slice(-40)}`.toLowerCase();

/** Latest Celo block, read free from SQD through the buy gateway. */
async function head(): Promise<number> {
  const res = await fetch(`${BUY_GATEWAY}/sqd/datasets/celo-mainnet/head`);
  if (!res.ok) throw new Error(`Could not read the Celo block number (${res.status})`);
  const body = (await res.json()) as Record<string, unknown>;
  const n = Number(body.number ?? body.block_number ?? body.height);
  if (!Number.isFinite(n)) throw new Error("Could not read the Celo block number");
  return n;
}

/**
 * Reads 24 hours of Transfer logs for a Celo token in one paid Chainstack
 * batch, and turns them into a few plain numbers.
 */
export async function chainSignals(contract: string, pay: Payer): Promise<ChainSignals> {
  const latest = await head();
  const start = Math.max(0, latest - HOURS * 3600);
  const batch: object[] = [];
  for (let to = latest, id = 1; to > start; to -= CHUNK, id++) {
    batch.push({
      jsonrpc: "2.0",
      id,
      method: "eth_getLogs",
      params: [{ address: contract, topics: [TRANSFER], fromBlock: hex(Math.max(start, to - CHUNK + 1)), toBlock: hex(to) }],
    });
  }
  const raw = await pay("chainstack", "/chainstack/celo", batch, MAX_RPC());
  const replies = (Array.isArray(raw) ? raw : [raw]) as { result?: { topics?: string[] }[] }[];

  const moves: [string, string][] = [];
  for (const r of replies) {
    for (const log of r.result ?? []) if (log.topics && log.topics.length >= 3) moves.push([addr(log.topics[1]), addr(log.topics[2])]);
  }
  return summarise(moves);
}

export function summarise(moves: [string, string][]): ChainSignals {
  const touches = new Map<string, number>();
  const pairs = new Set<string>();
  for (const [from, to] of moves) {
    touches.set(from, (touches.get(from) ?? 0) + 1);
    touches.set(to, (touches.get(to) ?? 0) + 1);
    pairs.add(`${from}>${to}`);
  }
  const busiest = new Set([...touches.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([w]) => w));
  const viaBusiest = moves.filter(([f, t]) => busiest.has(f) || busiest.has(t)).length;
  const backAndForth = moves.filter(([f, t]) => f !== t && pairs.has(`${t}>${f}`)).length;
  const zero = "0x0000000000000000000000000000000000000000";
  return {
    hours: HOURS,
    transfers: moves.length,
    wallets: [...touches.keys()].filter((w) => w !== zero).length,
    topTenShare: share(viaBusiest, moves.length),
    backAndForthShare: share(backAndForth, moves.length),
  };
}

const share = (a: number, b: number) => (b ? Math.round((a / b) * 100) / 100 : 0);
