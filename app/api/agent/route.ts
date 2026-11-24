import { NextResponse } from "next/server";
import { CELO_USDC, showUsdc } from "@/lib/config";
import { agentAccount, sessionSigner } from "@/lib/server/agent";
import { checkPrice, isMock, payMode } from "@/lib/server/scout";
import { appCodes } from "@/lib/server/attribution";

export const dynamic = "force-dynamic";

/** What the page needs to open a tab: which key to grant it to, and what a check costs. */
export async function GET() {
  // Demo mode with no keys set yet: let the page load so it can be looked at
  if (isMock() && (!process.env.AGENT_PRIVATE_KEY || !process.env.AGENT_SESSION_KEY)) {
    const zero = "0x0000000000000000000000000000000000000000";
    return NextResponse.json({
      sessionPublicKey: "0x",
      sessionAddress: zero,
      agentAddress: zero,
      checkPrice: showUsdc(checkPrice()),
      token: CELO_USDC,
      payMode: payMode(),
      appCodes: appCodes(),
      mock: true,
    });
  }
  try {
    const signer = sessionSigner();
    return NextResponse.json({
      sessionPublicKey: signer.publicKey,
      sessionAddress: signer.address,
      agentAddress: agentAccount().address,
      checkPrice: showUsdc(checkPrice()),
      token: CELO_USDC,
      payMode: payMode(),
      appCodes: appCodes(),
      mock: isMock(),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
