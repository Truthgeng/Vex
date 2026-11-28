import { test } from "node:test";
import assert from "node:assert/strict";
import { scanTriggers, changeWorthAlerting } from "../lib/server/watcher";
import type { SocialSignals } from "../lib/types";

const base: SocialSignals = { posts: 20, accounts: 15, topThreeShare: 0.2, copyPasteShare: 0.05, tinyAccountShare: 0.3, newAccountShare: 0.1, sample: [] };

test("a scan that looks like the baseline buys nothing more", () => {
  assert.deepEqual(scanTriggers(base, { ...base, posts: 24, newAccountShare: 0.18 }), []);
});

test("a jump in new accounts is a reason to go deep", () => {
  const t = scanTriggers(base, { ...base, newAccountShare: 0.4 });
  assert.equal(t.length, 1);
  assert.match(t[0], /new accounts rose from 10% to 40%/);
});

test("a volume spike counts, small noise does not", () => {
  assert.equal(scanTriggers(base, { ...base, posts: 31 }).length, 0);
  assert.match(scanTriggers(base, { ...base, posts: 32 })[0], /jumped from 20 to 32/);
});

test("several shifts are all named", () => {
  const t = scanTriggers(base, { ...base, copyPasteShare: 0.3, topThreeShare: 0.5, tinyAccountShare: 0.6 });
  assert.equal(t.length, 3);
});

test("no scan data means no reason to spend", () => {
  assert.deepEqual(scanTriggers(base, null), []);
});

test("no baseline with real posts is a reason to set one", () => {
  assert.equal(scanTriggers(null, base).length, 1);
  assert.equal(scanTriggers(null, { ...base, posts: 2 }).length, 0);
});

test("alerts fire on verdict flips and big score moves only", () => {
  const was = { score: 72, verdict: "looks real" as const, reasons: [] };
  assert.equal(changeWorthAlerting(was, { ...was, score: 64 }), null);
  assert.match(changeWorthAlerting(was, { score: 40, verdict: "looks farmed", reasons: [] })!, /verdict changed/);
  assert.match(changeWorthAlerting(was, { ...was, score: 90 })!, /rose 18/);
});
