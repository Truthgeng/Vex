import { randomBytes } from "node:crypto";
import type { Allowance, CheckInput, Depth, InsiderSnapshot, LogEntry, Report, SocialSignals, Watch } from "@/lib/types";
import { showUsdc } from "@/lib/config";
import { TabError, openTab } from "./agent";
import { checkPrice, isDemo, isMock, runCheck } from "./scout";
import { readAllowance } from "./allowance";
import { addProof, saveTab, type TabRecord } from "./store";
import { esc, sendTelegram } from "./telegram";

export const MAX_WATCHES = 10;
/** A watch is due again this long after its last check. The daily cron runs once a day. */
const DUE_AFTER_MS = 20 * 3_600_000;
/** Even when nothing moves, buy a deep check at least this often. */
const DEEP_EVERY_MS = 7 * 86_400_000;

export const subjectOf = (w: { handle?: string; contract?: string }) =>
  [w.handle && `@${w.handle}`, w.contract && `${w.contract.slice(0, 6)}…${w.contract.slice(-4)}`].filter(Boolean).join(" / ");

export function newWatch(input: CheckInput): Watch {
  return { id: randomBytes(6).toString("hex"), handle: input.handle, contract: input.contract, chain: input.contract ? input.chain ?? "celo" : undefined, addedAt: new Date().toISOString() };
}

export const isDue = (w: Watch, now = Date.now()) => !w.lastCheckedAt || now - Date.parse(w.lastCheckedAt) >= DUE_AFTER_MS;

const pct = (n: number) => `${Math.round(n * 100)}%`;
const inputOf = (w: Watch): CheckInput => ({ handle: w.handle, contract: w.contract as `0x${string}` | undefined, chain: w.chain });

/**
 * What a cheap scan saw that the last deep check didn't. Each line is a reason
 * to spend more. Fixed thresholds, so the same numbers always lead to the same
 * decision.
 */
export function scanTriggers(base: SocialSignals | null | undefined, now: SocialSignals | null | undefined): string[] {
  if (!now) return [];
  if (!base) return now.posts >= 5 ? ["there was no X baseline yet"] : [];
  const out: string[] = [];
  // One search returns fewer posts than two, so compare volume with some slack
  if (base.posts >= 5 && now.posts >= base.posts * 1.6) out.push(`posts tagging it jumped from ${base.posts} to ${now.posts}`);
  if (now.newAccountShare - base.newAccountShare >= 0.15) out.push(`new accounts rose from ${pct(base.newAccountShare)} to ${pct(now.newAccountShare)}`);
  if (now.tinyAccountShare - base.tinyAccountShare >= 0.15) out.push(`tiny accounts rose from ${pct(base.tinyAccountShare)} to ${pct(now.tinyAccountShare)}`);
  if (now.copyPasteShare - base.copyPasteShare >= 0.15) out.push(`copy-paste posts rose from ${pct(base.copyPasteShare)} to ${pct(now.copyPasteShare)}`);
  if (now.topThreeShare - base.topThreeShare >= 0.2) out.push(`3 accounts now write ${pct(now.topThreeShare)} of posts, up from ${pct(base.topThreeShare)}`);
  return out;
}

/** The tab's room for today: from the chain when live, from Vex's log in demo mode. */
async function roomToday(tab: TabRecord): Promise<Allowance> {
  if (!isMock() && !isDemo(tab.session)) return readAllowance(openTab(tab.session));
  const limit = BigInt(tab.session.permissions.spend?.[0]?.limit ?? "0");
  const now = new Date();
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const spent = tab.log.filter((l) => l.kind === "check" && l.amount && Date.parse(l.at) >= start).reduce((a, l) => a + BigInt(l.amount!), 0n);
  const remaining = limit > spent ? limit - spent : 0n;
  return { limit: limit.toString(), spent: spent.toString(), remaining: remaining.toString(), periodStart: start / 1000, source: "demo" };
}

/**
 * One scheduled run of a watch: Vex decides how much to spend.
 *
 * 1. No baseline yet, no X handle, a pending deep check, or a week since the
 *    last one: buy a deep check.
 * 2. Otherwise buy a scan (one X search) and compare it to the baseline.
 * 3. Nothing moved: stop there. Something moved: buy a deep check if today's
 *    cap has room for it, read from the chain. If not, say so and go deep on
 *    the next run.
 *
 * Every decision is written to the log in plain words.
 */
export async function runWatch(tab: TabRecord, watch: Watch, auto: boolean): Promise<Report | null> {
  const subject = subjectOf(watch);
  const deepReason = !watch.last
    ? "first deep check, to set the baseline"
    : !watch.handle
      ? "no X handle to scan, so it reads the token onchain"
      : watch.deepPending
        ? `yesterday's scan saw ${watch.deepPending}`
        : !watch.lastDeepAt || Date.now() - Date.parse(watch.lastDeepAt) >= DEEP_EVERY_MS
          ? "weekly deep check"
          : null;
  if (deepReason) return checkForTab(tab, inputOf(watch), { auto, watch, depth: "deep", decision: `Bought a deep check: ${deepReason}.` });

  const before = watch.insiders;
  const scan = await checkForTab(tab, inputOf(watch), { auto, watch, depth: "scan", decision: "Daily scan." });
  // Insider selling outranks every X signal, and holder data is free, so it is read on every run
  const triggers = [...(scan.insiders?.sold ? scan.insiders.moves.filter((m) => m.includes("cut")) : []), ...scanTriggers(watch.baseline, scan.social)];
  if (!triggers.length) {
    watch.lastDecision = "Scan matched the baseline, so no deep check was bought.";
    tab.log[0].note = watch.lastDecision;
    await saveTab(tab);
    return scan;
  }

  const why = triggers.join(", ");
  tab.log[0].note = `Scan saw ${why}.`;
  const room = await roomToday(tab).catch(() => null);
  if (room && BigInt(room.remaining) < checkPrice()) {
    watch.deepPending = why;
    watch.lastDecision = `Scan saw ${why}. A deep check would pass today's cap (${showUsdc(room.remaining)} USDC left), so it waits for tomorrow.`;
    tab.log.unshift({ at: new Date().toISOString(), kind: "deferred", depth: "deep", subject, auto, note: watch.lastDecision });
    await saveTab(tab);
    if (tab.telegramChatId) {
      const head = scan.insiders?.sold ? "🚨" : "👀";
      await sendTelegram(tab.telegramChatId, `${head} <b>${esc(subject)}</b>: ${esc(why)}\nToday's cap is nearly used, so the deep check runs tomorrow.`);
    }
    return scan;
  }
  // Compare the deep check's holders with the snapshot from before today's scan, so the move shows up in its report
  return checkForTab(tab, inputOf(watch), { auto, watch, depth: "deep", decision: `Scan saw ${why}, so Vex bought a deep check.`, triggers, previousInsiders: before });
}

type CheckOpts = { auto: boolean; watch?: Watch; depth?: Depth; decision?: string; triggers?: string[]; previousInsiders?: InsiderSnapshot | null };

/**
 * Runs one check for a tab, records it, and returns the report. Used for a
 * one-off check from the page, for "check now" on a watch, and by runWatch.
 * The tab record is changed in place and saved.
 */
export async function checkForTab(tab: TabRecord, input: CheckInput, opts: CheckOpts): Promise<Report> {
  const subject = subjectOf(input);
  const depth = opts.depth ?? "deep";
  let report: Report;
  try {
    const prev = opts.previousInsiders !== undefined ? opts.previousInsiders : opts.watch?.insiders;
    report = await runCheck(input, tab.session, depth, prev);
  } catch (e) {
    if (e instanceof TabError && opts.watch) {
      // The cap resets on its own; an expired tab does not
      const expired = tab.session.expiry * 1000 <= Date.now();
      opts.watch.paused = expired ? "Your tab expired. Open a new one to keep watching." : e.message;
      tab.log.unshift({ at: new Date().toISOString(), kind: "paused", depth, subject, auto: opts.auto, note: opts.watch.paused });
      await saveTab(tab);
      if (tab.telegramChatId && opts.auto) {
        await sendTelegram(tab.telegramChatId, `⏸ <b>Vex paused ${esc(subject)}</b>\n${esc(opts.watch.paused)}`);
      }
    }
    throw e;
  }

  const entry: LogEntry = {
    at: report.at,
    kind: "check",
    depth: report.depth,
    subject,
    score: report.depth === "deep" ? report.score : undefined,
    verdict: report.depth === "deep" ? report.verdict : undefined,
    amount: report.charge?.amount,
    tx: report.charge?.txHash,
    auto: opts.auto,
    note: opts.decision,
  };
  tab.log.unshift(entry);
  if (report.charge && report.mode !== "mock") {
    await addProof({ at: report.at, wallet: tab.wallet, subject: `${subject} (${report.depth})`, amount: report.charge.amount, tx: report.charge.txHash, auto: opts.auto });
  }

  const w = opts.watch;
  if (w) {
    w.lastCheckedAt = report.at;
    w.paused = undefined;
    if (report.insiders) w.insiders = report.insiders.snapshot;
    if (opts.decision) w.lastDecision = opts.decision;
    // A scan only feeds the decision. The verdict comes from deep checks
    if (report.depth === "deep") {
      const before = w.last;
      w.last = { score: report.score, verdict: report.verdict, reasons: report.reasons };
      w.lastDeepAt = report.at;
      w.history = [...(w.history ?? []), { at: report.at, score: report.score, verdict: report.verdict }].slice(-30);
      // Keep the full report for the detail view, minus the raw sample posts
      w.lastReport = { ...report, social: report.social ? { ...report.social, sample: report.social.sample.slice(0, 3) } : report.social };
      w.deepPending = undefined;
      if (report.social) w.baseline = report.social;
      const alert = changeWorthAlerting(before, w.last);
      if (alert && tab.telegramChatId) {
        const sent = await sendTelegram(tab.telegramChatId, incidentText(subject, before, report, alert, opts.triggers, tab));
        if (sent) tab.log.unshift({ at: new Date().toISOString(), kind: "alert", subject, verdict: report.verdict, score: report.score, auto: opts.auto, note: alert });
      }
    }
  }
  await saveTab(tab);
  return report;
}

/** Says why a change matters, or null when it doesn't. */
export function changeWorthAlerting(before: Watch["last"], now: NonNullable<Watch["last"]>): string | null {
  if (!before) return "first check";
  if (before.verdict !== now.verdict) return `verdict changed from ${before.verdict} to ${now.verdict}`;
  const diff = now.score - before.score;
  if (Math.abs(diff) >= 15) return `score ${diff > 0 ? "rose" : "fell"} ${Math.abs(diff)} points`;
  return null;
}

/**
 * The alert, written like an incident report: what changed, what made Vex
 * look closer, what it bought to confirm, what that cost, and the receipts.
 */
function incidentText(subject: string, before: Watch["last"], r: Report, why: string, triggers: string[] | undefined, tab: TabRecord): string {
  const icon = r.verdict === "looks farmed" ? "🚩" : r.verdict === "mixed" ? "⚠️" : r.verdict === "looks real" ? "✅" : "•";
  if (!before) {
    return [`${icon} <b>Now watching ${esc(subject)}</b>: ${esc(r.verdict)} (${r.score}/100)`, ...r.reasons.slice(0, 3).map((x) => `• ${esc(x)}`)].join("\n");
  }
  const lines = [
    `${icon} <b>${esc(subject)}</b>: ${esc(why)}`,
    `Now ${esc(r.verdict)} (${r.score}/100), was ${esc(before.verdict)} (${before.score}/100)`,
    "",
    "<b>Why</b>",
    ...r.reasons.slice(0, 3).map((x) => `• ${esc(x)}`),
  ];
  if (r.insiders?.moves.length) lines.push("", "<b>Insiders</b>", ...r.insiders.moves.map((m) => `• ${esc(m)}`));
  const loud = (r.pushers ?? []).filter((p) => p.flags.length).slice(0, 3);
  if (loud.length) lines.push("", "<b>Who's pushing it</b>", ...loud.map((p) => `• @${esc(p.author)}: ${esc(p.flags.join(", "))}`));
  if (triggers?.length) lines.push("", "<b>What made Vex look closer</b>", `Today's scan: ${esc(triggers.join(", "))}`);
  // What this incident cost: today's scan for this subject plus the deep check
  const today = tab.log.filter((l) => l.kind === "check" && l.subject === subject && Date.now() - Date.parse(l.at) < 3_600_000 && l.amount);
  const cost = today.reduce((a, l) => a + BigInt(l.amount!), 0n);
  if (cost > 0n) lines.push("", `<b>Cost</b>: ${showUsdc(cost)} USDC from your tab`);
  const txs = today.map((l) => l.tx).filter(Boolean) as string[];
  if (txs.length) lines.push(...txs.map((t) => `https://celoscan.io/tx/${t}`));
  return lines.join("\n");
}
