import { NextResponse } from "next/server";
import { CELO_USDC, showUsdc } from "@/lib/config";
import { agentAccount, sessionSigner } from "@/lib/server/agent";
import { checkPrice, isMock, payMode } from "@/lib/server/scout";

export const dynamic = "force-dynamic";

/** What the page needs to open a tab: which key to grant it to, and what a check costs. */
export async function GET() {
  try {
    const signer = sessionSigner();
    return NextResponse.json({
      sessionPublicKey: signer.publicKey,
      sessionAddress: signer.address,
      agentAddress: agentAccount().address,
      checkPrice: showUsdc(checkPrice()),
      token: CELO_USDC,
      payMode: payMode(),
      mock: isMock(),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
