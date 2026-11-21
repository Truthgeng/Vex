/**
 * Telegram alerts. Needs TELEGRAM_BOT_TOKEN and TELEGRAM_BOT_USERNAME (from
 * @BotFather). Without them Vex still works, it just has nowhere to send
 * alerts, and the page says so.
 */
export const botUsername = () => process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "") || undefined;
const botToken = () => process.env.TELEGRAM_BOT_TOKEN?.trim() || undefined;
export const telegramReady = () => !!botToken() && !!botUsername();

/** Escapes text for Telegram's HTML mode. */
export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function sendTelegram(chatId: number, html: string): Promise<boolean> {
  const t = botToken();
  if (!t) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${t}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: html, parse_mode: "HTML", disable_web_page_preview: true }),
    });
    if (!res.ok) console.error("telegram send failed", res.status, await res.text());
    return res.ok;
  } catch (e) {
    console.error("telegram send failed", e);
    return false;
  }
}

/** Points the bot at this site's webhook. Run once from `npm run telegram`. */
export async function setWebhook(siteUrl: string, secret: string) {
  const t = botToken();
  if (!t) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  const res = await fetch(`https://api.telegram.org/bot${t}/setWebhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: `${siteUrl.replace(/\/$/, "")}/api/telegram`, secret_token: secret, allowed_updates: ["message"] }),
  });
  return res.json();
}
