import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * The ERC-8004 registration file. `npm run register` points the onchain
 * identity at this URL. After it prints the agent id, set AGENT_ID so the
 * file lists it.
 */
export async function GET(req: Request) {
  const origin = process.env.PUBLIC_URL || new URL(req.url).origin;
  const agentId = process.env.AGENT_ID;
  return NextResponse.json({
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: "Vex",
    description:
      "Checks if an early crypto project's traction is real or farmed. Users give it a capped Altana tab on Celo instead of their keys: USDC only, a daily cap, an expiry, all enforced onchain.",
    image: `${origin}/icon.svg`,
    services: [
      { name: "web", endpoint: origin },
      { name: "check", endpoint: `${origin}/api/check` },
    ],
    x402Support: false,
    active: true,
    supportedTrust: ["reputation"],
    registrations: agentId
      ? [{ agentId: Number(agentId), agentRegistry: "eip155:42220:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" }]
      : [],
  });
}
