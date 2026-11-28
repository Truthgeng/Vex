import { NextResponse } from "next/server";
import { getIdentity } from "@/lib/server/store";

export const dynamic = "force-dynamic";

/**
 * The ERC-8004 registration file. `npm run register` points the onchain
 * identity at this URL. After it prints the agent id, set AGENT_ID so the
 * file lists it.
 */
export async function GET(req: Request) {
  const origin = process.env.PUBLIC_URL || new URL(req.url).origin;
  const saved = await getIdentity().catch(() => null);
  const agentId = process.env.AGENT_ID || saved?.agentId;
  return NextResponse.json({
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: "Vex",
    description:
      "Watches the crypto projects a KOL promotes. A cheap daily scan, and a deep check only when something moves: insiders selling, serial promoters, bot-driven hype. Alerts on Telegram. Pays for its own checks from a capped Altana tab on the user's passkey wallet on Celo, never their keys.",
    image: `${origin}/icon.svg`,
    services: [
      { name: "web", endpoint: origin },
      { name: "check", endpoint: `${origin}/api/check` },
      { name: "watch", endpoint: `${origin}/api/watch` },
      { name: "telegram", endpoint: "https://t.me/vexalatbot" },
    ],
    x402Support: false,
    active: true,
    supportedTrust: ["reputation"],
    registrations: agentId
      ? [{ agentId: Number(agentId), agentRegistry: "eip155:42220:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" }]
      : [],
  });
}
