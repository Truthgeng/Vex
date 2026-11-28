import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { serializeSession, signerFromPrivateKey, type SerializedSession, type Signer } from "@altananetwork/sdk";
import type { Hex } from "viem";
import { CELO_USDC, CELO_CHAIN_ID, TAB_CALLS, usdc, showUsdc } from "../lib/config";
import { altana, sessionSigner } from "../lib/server/agent";
import { runCheck } from "../lib/server/scout";
import { runWatch, newWatch } from "../lib/server/watcher";
import { runCapTest } from "../lib/server/captest";
import { getTab, saveTab, newToken, hash, type TabRecord } from "../lib/server/store";

// Test the whole flow from the terminal, as a user, before the web page is ready.
// TEST_USER_KEY is a test user's admin key (yours). It owns the Altana wallet;
// the agent only ever gets a capped session on it.
//
//   npm run cli -- wallet                 show the wallet address and balances
//   npm run cli -- open-tab 1 7           let the agent spend up to 1 USDC a day for 7 days
//   npm run cli -- check celo 0x...       run a check, paid from the tab
//   npm run cli -- decide celo            what the daily run does: scan, deep only if something moved
//   npm run cli -- cap-test               ask Altana to overspend the tab by 0.01 USDC (should be refused)
//   npm run cli -- close-tab              revoke the tab

const TAB_FILE = ".tab.json";

function user(): Signer {
  const k = process.env.TEST_USER_KEY?.trim();
  if (!k) throw new Error("Set TEST_USER_KEY (run `npm run keys` and use one of the keys, it is only for testing).");
  return signerFromPrivateKey((k.startsWith("0x") ? k : `0x${k}`) as Hex);
}

async function wallet() {
  const signer = user();
  const w = await altana().createWallet({ signer });
  return { wallet: { address: w.address }, signer };
}

/** The agent's key, public half only: the user never holds it. */
function agentPublicSigner(): Signer {
  const s = sessionSigner();
  return {
    type: s.type,
    address: s.address,
    publicKey: s.publicKey,
    signDigest: () => Promise.reject(new Error("The user side never signs with the agent key")),
  };
}

async function main() {
  const [cmd, a, b] = process.argv.slice(2);
  const client = altana();

  if (cmd === "wallet") {
    const { wallet: w } = await wallet();
    const bal = await client.balances({ wallet: w, tokens: [CELO_USDC], chainId: CELO_CHAIN_ID });
    console.log(`Altana wallet: ${w.address}`);
    console.log(`USDC: ${(bal.tokens?.[0] as { display?: string } | undefined)?.display ?? "0"}  CELO: ${Number(bal.native) / 1e18}`);
    console.log("Send USDC on Celo to it, plus a little CELO for the first setup fee.");
    return;
  }

  if (cmd === "open-tab") {
    const daily = a || "1";
    const days = Number(b || "7");
    const { wallet: w, signer } = await wallet();
    const permissions = {
      calls: TAB_CALLS,
      spend: [{ token: CELO_USDC, limit: usdc(daily), period: "day" as const }],
    };
    const expiry = Math.floor(Date.now() / 1000) + days * 86_400;
    const quote = await client.quoteGrantSession({ wallet: w, signer, permissions, expiry, feeToken: CELO_USDC, chainId: CELO_CHAIN_ID });
    console.log("Setup cost:", JSON.stringify(quote, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
    const res = await client.grantSession({
      wallet: w,
      signer,
      permissions,
      expiry,
      sessionSigner: agentPublicSigner(),
      feeToken: CELO_USDC,
      feeSpendLimit: usdc("0.5"),
      chainId: CELO_CHAIN_ID,
    });
    if (res.status !== "granted") throw new Error(`Grant failed: ${JSON.stringify(res.legs, (_k, v) => (typeof v === "bigint" ? v.toString() : v))}`);
    writeFileSync(TAB_FILE, JSON.stringify(serializeSession(res), null, 2));
    console.log(`Tab open: up to ${daily} USDC a day for ${days} days, USDC transfers only.`);
    console.log(`tx: https://celoscan.io/tx/${res.transactionHash}`);
    return;
  }

  if (cmd === "check") {
    if (!existsSync(TAB_FILE)) throw new Error("Open a tab first: npm run cli -- open-tab 1 7");
    const stored = JSON.parse(readFileSync(TAB_FILE, "utf8")) as SerializedSession;
    const contract = [a, b].find((x) => x?.startsWith("0x")) as `0x${string}` | undefined;
    const handle = [a, b].find((x) => x && !x.startsWith("0x"))?.replace(/^@/, "");
    const report = await runCheck({ handle, contract }, stored);
    console.log(JSON.stringify(report, null, 2));
    if (report.charge) console.log(`Charged ${showUsdc(report.charge.amount)} USDC from the tab: https://celoscan.io/tx/${report.charge.txHash}`);
    return;
  }

  if (cmd === "decide" || cmd === "cap-test") {
    if (!existsSync(TAB_FILE)) throw new Error("Open a tab first: npm run cli -- open-tab 1 7");
    const stored = JSON.parse(readFileSync(TAB_FILE, "utf8")) as SerializedSession;
    // A throwaway tab record for the terminal: same session, same rules as the site
    const tab: TabRecord = (await getTab(stored.walletAddress)) ?? {
      wallet: stored.walletAddress.toLowerCase(), session: stored, ownerHash: hash(newToken()), createdAt: new Date().toISOString(),
      linkCode: newToken().slice(0, 16), watches: [], log: [],
    };
    if (cmd === "cap-test") {
      console.log(JSON.stringify(await runCapTest(tab), null, 2));
      return;
    }
    const handle = a?.replace(/^@/, "");
    if (!handle) throw new Error("Usage: npm run cli -- decide <handle>");
    let watch = tab.watches.find((w) => w.handle === handle);
    if (!watch) { watch = newWatch({ handle }); tab.watches.unshift(watch); await saveTab(tab); }
    const r = await runWatch(tab, watch, false);
    console.log(watch.lastDecision);
    if (r) console.log(`${r.depth}: ${r.verdict} (${r.score}/100), charged ${r.charge ? showUsdc(r.charge.amount) : 0} USDC ${r.charge?.txHash ? `https://celoscan.io/tx/${r.charge.txHash}` : ""}`);
    console.log("Run it again to see the scan compared with the baseline.");
    return;
  }

  if (cmd === "close-tab") {
    if (!existsSync(TAB_FILE)) throw new Error("No tab open.");
    const stored = JSON.parse(readFileSync(TAB_FILE, "utf8")) as SerializedSession;
    const { wallet: w, signer } = await wallet();
    const res = await client.revokeSession({ wallet: w, signer, session: stored.publicKey, feeToken: CELO_USDC });
    unlinkSync(TAB_FILE);
    console.log(`Tab closed: https://celoscan.io/tx/${res.transactionHash}`);
    return;
  }

  console.log("Commands: wallet | open-tab <daily USDC> <days> | check <handle> <contract> | decide <handle> | cap-test | close-tab");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
