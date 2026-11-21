import { NextResponse } from "next/server";
import { getTab, linkCodeWallet, saveTab } from "@/lib/server/store";
import { sendTelegram } from "@/lib/server/telegram";

export const dynamic = "force-dynamic";

type Update = { message?: { chat?: { id: number }; text?: string } };

/**
 * Telegram webhook. The page shows a t.me link with a one-time code; tapping
 * Start sends "/start <code>", which links that chat to the tab.
 */
export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const update = (await req.json().catch(() => ({}))) as Update;
  const chatId = update.message?.chat?.id;
  const text = update.message?.text?.trim() ?? "";
  if (!chatId) return NextResponse.json({ ok: true });

  const [cmd, code] = text.split(/\s+/);
  if (cmd === "/start" && code) {
    const wallet = await linkCodeWallet(code);
    const tab = wallet ? await getTab(wallet) : null;
    if (!tab || tab.linkCode !== code) {
      await sendTelegram(chatId, "That link has expired. Open Vex and tap the Telegram link again.");
    } else {
      tab.telegramChatId = chatId;
      await saveTab(tab);
      await sendTelegram(chatId, "✅ <b>Linked.</b> Vex will message you here when a project you watch changes.");
    }
  } else {
    await sendTelegram(chatId, "Vex sends alerts about the projects you watch. Add and remove them on the site.");
  }
  return NextResponse.json({ ok: true });
}
