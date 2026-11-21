import { randomBytes } from "node:crypto";
import type { CheckInput, LogEntry, Report, Watch } from "@/lib/types";
import { showUsdc } from "@/lib/config";
import { TabError } from "./agent";
import { runCheck } from "./scout";
import { addProof, saveTab, type TabRecord } from "./store";
import { esc, sendTelegram } from "./telegram";

export const MAX_WATCHES = 10;
/** A watch is due again this long after its last check. The daily cron runs once a day. */
const DUE_AFTER_MS = 20 * 3_600_000;

export const subjectOf = (w: { handle?: string; contract?: string }) =>
  [w.handle && `@${w.handle}`, w.contract && `${w.contract.slice(0, 6)}…${w.contract.slice(-4)}`].filter(Boolean).join(" / ");

export function newWatch(input: CheckInput): Watch {
  return { id: randomBytes(6).toString("hex"), handle: input.handle, contract: input.contract, addedAt: new Date().toISOString() };
}

export const isDue = (w: Watch, now = Date.now()) => !w.lastCheckedAt || now - Date.parse(w.lastCheckedAt) >= DUE_AFTER_MS;

/**
 * Runs one check for a tab, records it, and returns the report. Used for a
 * one-off check from the page, for "check now" on a watch, and by the cron.
 * The tab record is changed in place and saved.
 */
export async function checkForTab(tab: TabRecord, input: CheckInput, opts: { auto: boolean; watch?: Watch }): Promise<Report> {
  const subject = subjectOf(input);
  let report: Report;
  try {
    report = await runCheck(input, tab.session);
  } catch (e) {
    if (e instanceof TabError && opts.watch) {
      // The cap resets on its own; an expired tab does not
      const expired = tab.session.expiry * 1000 <= Date.now();
      opts.watch.paused = expired ? "Your tab expired. Open a new one to keep watching." : e.message;
      tab.log.unshift({ at: new Date().toISOString(), kind: "paused", subject, auto: opts.auto, note: opts.watch.paused });
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
    subject,
    score: report.score,
    verdict: report.verdict,
    amount: report.charge?.amount,
    tx: report.charge?.txHash,
    auto: opts.auto,
  };
  tab.log.unshift(entry);
  if (report.charge && report.mode !== "mock") {
    await addProof({ at: report.at, wallet: tab.wallet, subject, amount: report.charge.amount, tx: report.charge.txHash, auto: opts.auto });
  }

  if (opts.watch) {
    const before = opts.watch.last;
    opts.watch.last = { score: report.score, verdict: report.verdict, reasons: report.reasons };
    opts.watch.lastCheckedAt = report.at;
    opts.watch.paused = undefined;
    const alert = changeWorthAlerting(before, opts.watch.last);
    if (alert && tab.telegramChatId) {
      const sent = await sendTelegram(tab.telegramChatId, alertText(subject, before, report, alert));
      if (sent) tab.log.unshift({ at: new Date().toISOString(), kind: "alert", subject, verdict: report.verdict, score: report.score, auto: opts.auto, note: alert });
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

function alertText(subject: string, before: Watch["last"], r: Report, why: string): string {
  const icon = r.verdict === "looks farmed" ? "🚩" : r.verdict === "mixed" ? "⚠️" : r.verdict === "looks real" ? "✅" : "•";
  const head = before
    ? `${icon} <b>${esc(subject)}</b>: ${esc(why)}`
    : `${icon} <b>Now watching ${esc(subject)}</b>: ${esc(r.verdict)} (${r.score}/100)`;
  const lines = r.reasons.slice(0, 3).map((x) => `• ${esc(x)}`);
  const paid = r.charge ? `\nPaid ${showUsdc(r.charge.amount)} USDC from your tab` : "";
  return [head, before ? `Now ${esc(r.verdict)} (${r.score}/100)` : "", ...lines].filter(Boolean).join("\n") + paid;
}
