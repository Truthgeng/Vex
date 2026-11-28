import { NextResponse } from "next/server";
import { insiderSnapshot } from "@/lib/server/insiders";

export const dynamic = "force-dynamic";

const CONTRACT = /^0x[0-9a-fA-F]{40}$/;

/**
 * Who holds a token: deployer, top wallets, biggest contracts. Public and
 * free (it reads the public explorer and spends nothing), so it needs no tab.
 * GET /api/holders?chain=celo&contract=0x...
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const contract = url.searchParams.get("contract") ?? "";
  const chain = url.searchParams.get("chain") ?? "celo";
  if (!CONTRACT.test(contract)) return NextResponse.json({ error: "Give a token contract address." }, { status: 400 });
  if (chain !== "celo" && chain !== "ethereum" && chain !== "base") return NextResponse.json({ error: "Chain must be celo, ethereum or base." }, { status: 400 });
  try {
    return NextResponse.json(await insiderSnapshot(chain, contract), { headers: { "cache-control": "s-maxage=300" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't read holders." }, { status: 502 });
  }
}
