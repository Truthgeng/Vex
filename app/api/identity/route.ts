import { NextResponse } from "next/server";
import { identityStatus, registerIdentity } from "@/lib/server/identity";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET: the agent wallet's balances and whether its ERC-8004 identity exists.
 * GET ?register=1 mints it, only while REGISTER_IDENTITY=1 is set on the
 * server. It is a no-op once the wallet owns an identity.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  try {
    if (url.searchParams.get("register") === "1") {
      if (process.env.REGISTER_IDENTITY !== "1") {
        return NextResponse.json({ error: "Registration is switched off." }, { status: 403 });
      }
      const result = await registerIdentity(url.origin);
      return NextResponse.json({ result, status: await identityStatus() });
    }
    return NextResponse.json(await identityStatus());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message.split("\n")[0] }, { status: 500 });
  }
}
