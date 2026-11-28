import { test } from "node:test";
import assert from "node:assert/strict";
import { compareInsiders } from "../lib/server/insiders";
import { whoIsPushing } from "../lib/server/pushers";
import type { InsiderSnapshot, Post } from "../lib/types";

const snap = (deployer: number, top: number[]): InsiderSnapshot => ({
  chain: "celo", contract: "0xabc", symbol: "T", holdersCount: 500,
  deployer: { address: "0xdep", share: deployer, isContract: false },
  top: top.map((share, i) => ({ address: `0xw${i}`, share, isContract: false })),
  contracts: [], topTenShare: top.reduce((a, b) => a + b, 0), at: new Date().toISOString(),
});

test("no previous snapshot means no moves", () => {
  assert.deepEqual(compareInsiders(null, snap(0.1, [0.05])).moves, []);
});

test("the deployer dumping is caught", () => {
  const r = compareInsiders(snap(0.1, [0.05, 0.03]), snap(0.02, [0.05, 0.03]));
  assert.equal(r.sold, true);
  assert.match(r.moves[0], /The deployer cut its holding from 10% to 2%/);
});

test("small wiggles are ignored", () => {
  const r = compareInsiders(snap(0.1, [0.05, 0.03]), snap(0.097, [0.049, 0.03]));
  assert.equal(r.sold, false);
});

test("tiny holders are not treated as insiders", () => {
  const r = compareInsiders(snap(0.004, [0.004]), snap(0, [0.004]));
  assert.equal(r.sold, false);
});

test("a whale appearing is reported but is not a sale", () => {
  const now = snap(0.1, [0.05, 0.03]);
  now.top.unshift({ address: "0xnew", share: 0.08, isContract: false });
  const r = compareInsiders(snap(0.1, [0.05, 0.03]), now);
  assert.equal(r.sold, false);
  assert.match(r.moves[0], /new wallet/);
});

test("serial promoters are flagged across projects", async () => {
  const p = (author: string): Post => ({ id: author + Math.random(), text: "gm", author, followers: 50, joined: new Date(Date.now() - 20 * 86400000).toISOString(), likes: 0 });
  for (const s of ["@a", "@b", "@c"]) await whoIsPushing(s, [p("ring1")]);
  const list = await whoIsPushing("@d", [p("ring1"), p("loner")]);
  const ring = list.find((x) => x.author === "ring1")!;
  assert.equal(ring.alsoPushed.length, 3);
  assert.ok(ring.flags.some((f) => f.includes("pushed 3 other")));
  assert.ok(ring.flags.some((f) => f.includes("days old")));
  assert.equal(list.find((x) => x.author === "loner")!.alsoPushed.length, 0);
});

test("exchange wallets are never treated as insiders", async () => {
  // The grouping happens in insiderSnapshot; here we check the rule it uses on labels
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../lib/server/insiders.ts", import.meta.url), "utf8");
  const rule = new RegExp(src.match(/const EXCHANGE = \/(.+)\/i;/)![1], "i");
  for (const label of ["Binance: Hot Wallet 20", "OKX: Cold Wallet", "Bybit: Hot Wallet 10", "Exchange", "Gemini: Deposit Address"]) assert.ok(rule.test(label), label);
  for (const label of ["Justin Sun 4", "Locked Gold Proxy"]) assert.ok(!rule.test(label), label);
});
