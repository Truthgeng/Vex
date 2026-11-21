import { setWebhook } from "../lib/server/telegram";

// Points your Telegram bot at the live site. Run once after deploying:
//   npm run telegram
// Needs TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET and PUBLIC_URL in .env.local
// (the same values as on Vercel).
async function main() {
  const url = process.env.PUBLIC_URL;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!url || !secret) throw new Error("Set PUBLIC_URL and TELEGRAM_WEBHOOK_SECRET first.");
  console.log(await setWebhook(url, secret));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
