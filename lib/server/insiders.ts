import type { Chain, InsiderSignals, InsiderSnapshot, Holder } from "@/lib/types";

/**
 * Who holds a token, and whether the people closest to it are selling.
 *
 * Reads the public Blockscout explorer API (free, no key): the contract's
 * deployer, its top holders, and which of them are contracts (pools, lockers,
 * bridges). Celo and Ethereum are verified to work on live data. Base's
 * explorer refused requests (403) when tested, so it is not offered.
 */
const EXPLORER: Record<Chain, string> = {
  celo: "https://celo.blockscout.com/api/v2",
  ethereum: "https://eth.blockscout.com/api/v2",
};

/**
 * Exchange wallets look like ordinary wallets onchain, but they hold tokens
 * for their customers. Moving them would set off false insider alerts, so a
 * wallet the explorer labels as an exchange is grouped with the contracts.
 */
const EXCHANGE = /binance|okx|bybit|coinbase|kraken|bitget|kucoin|gate\.io|htx|huobi|bithumb|btcturk|gemini|mexc|upbit|bitfinex|crypto\.com|exchange|hot wallet|cold wallet|deposit/i;

const BURN = new Set(["0x0000000000000000000000000000000000000000", "0x000000000000000000000000000000000000dead"]);
const TOP = 10;

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`explorer ${res.status} for ${url}`);
  return (await res.json()) as T;
}

type AddressInfo = { creator_address_hash?: string | null; token?: { symbol?: string; name?: string; decimals?: string; total_supply?: string; holders_count?: string } | null };
type HolderRow = { address: { hash: string; is_contract?: boolean; name?: string | null; metadata?: { tags?: { name?: string }[] } | null }; value: string };
type BalanceRow = { token?: { address?: string; address_hash?: string }; value: string };

/** Share of supply, 0 to 1, kept to 4 places. */
const shareOf = (value: bigint, supply: bigint) => (supply > 0n ? Number((value * 1_000_000n) / supply) / 1_000_000 : 0);

export async function insiderSnapshot(chain: Chain, contract: string): Promise<InsiderSnapshot> {
  const base = EXPLORER[chain];
  const info = await get<AddressInfo>(`${base}/addresses/${contract}`);
  if (!info.token) throw new Error("That address is not a token on this chain.");
  const supply = BigInt(info.token.total_supply || "0");
  const holders = await get<{ items: HolderRow[] }>(`${base}/tokens/${contract}/holders`);

  const rows: Holder[] = holders.items
    .filter((h) => !BURN.has(h.address.hash.toLowerCase()))
    .map((h) => ({
      address: h.address.hash.toLowerCase(),
      share: shareOf(BigInt(h.value), supply),
      isContract: !!h.address.is_contract,
      label: h.address.metadata?.tags?.[0]?.name || h.address.name || undefined,
    }));

  // The deployer may not be a top holder, so read its balance directly
  let deployer: Holder | undefined;
  const creator = info.creator_address_hash?.toLowerCase();
  if (creator) {
    const inTop = rows.find((r) => r.address === creator);
    if (inTop) deployer = inTop;
    else {
      const balances = await get<BalanceRow[]>(`${base}/addresses/${creator}/token-balances`).catch(() => []);
      const mine = balances.find((b) => (b.token?.address_hash ?? b.token?.address ?? "").toLowerCase() === contract.toLowerCase());
      deployer = { address: creator, share: mine ? shareOf(BigInt(mine.value), supply) : 0, isContract: false };
    }
  }

  const pooled = (r: Holder) => r.isContract || (r.label ? EXCHANGE.test(r.label) : false);
  const wallets = rows.filter((r) => !pooled(r)).slice(0, TOP);
  return {
    chain,
    contract: contract.toLowerCase(),
    symbol: info.token.symbol || info.token.name || "token",
    holdersCount: Number(info.token.holders_count || 0),
    deployer,
    top: wallets,
    contracts: rows.filter(pooled).slice(0, 5),
    topTenShare: Math.round(wallets.reduce((a, w) => a + w.share, 0) * 10_000) / 10_000,
    at: new Date().toISOString(),
  };
}

const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/**
 * What the insiders did since the last snapshot, in plain sentences. An
 * insider here is the deployer or one of the 10 biggest wallets (contracts
 * such as pools are left out: they hold tokens for everyone).
 *
 * A move counts when a wallet that held at least 0.5% of supply cut its
 * holding by 30% or more, or by at least 1% of supply outright.
 */
export function compareInsiders(before: InsiderSnapshot | null | undefined, now: InsiderSnapshot): InsiderSignals {
  const moves: string[] = [];
  if (before && before.contract === now.contract) {
    const nowBy = new Map([...now.top, ...(now.deployer ? [now.deployer] : [])].map((h) => [h.address, h.share]));
    const watched = [...before.top, ...(before.deployer ? [before.deployer] : [])];
    const seen = new Set<string>();
    for (const h of watched) {
      if (seen.has(h.address) || h.share < 0.005) continue;
      seen.add(h.address);
      // Dropping out of the top 10 means at most the 10th wallet's share is left
      const after = nowBy.get(h.address) ?? Math.min(h.share, now.top[now.top.length - 1]?.share ?? 0);
      const cut = h.share - after;
      if (cut >= 0.01 || (h.share > 0 && cut / h.share >= 0.3)) {
        const who = before.deployer?.address === h.address ? "The deployer" : `Top holder ${short(h.address)}`;
        moves.push(`${who} cut its holding from ${pct(h.share)} to ${pct(after)} of supply.`);
      }
    }
    for (const h of now.top.slice(0, 5)) {
      if (!watched.some((w) => w.address === h.address) && h.share >= 0.02) moves.push(`A new wallet ${short(h.address)} now holds ${pct(h.share)} of supply.`);
    }
  }
  return { snapshot: now, moves, sold: moves.some((m) => m.includes("cut its holding")) };
}
