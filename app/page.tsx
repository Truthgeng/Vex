"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient, CELO, serializeSession, type SerializedSession, type Signer } from "@altananetwork/sdk";
import { CELO_USDC, CELO_CHAIN_ID, TAB_CALLS, usdc, showUsdc } from "@/lib/config";
import type { Report } from "@/lib/types";

type AgentInfo = {
  sessionPublicKey: `0x${string}`;
  sessionAddress: `0x${string}`;
  agentAddress: string;
  checkPrice: string;
  payMode: "tab" | "direct";
  mock: boolean;
  error?: string;
};

const WALLET_KEY = "vex.wallet";
const TAB_KEY = "vex.tab";

const read = <T,>(k: string): T | null => {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
};
const write = (k: string, v: unknown) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* storage can be off; the tab then lasts for this visit only */
  }
};

export default function Home() {
  const client = useMemo(() => createClient({ chains: [CELO], agentIdentity: false }), []);
  const [agent, setAgent] = useState<AgentInfo | null>(null);
  const [wallet, setWallet] = useState<string | null>(null);
  const [signer, setSigner] = useState<Signer | null>(null);
  const [balance, setBalance] = useState<string>("");
  const [tab, setTab] = useState<SerializedSession | null>(null);
  const [daily, setDaily] = useState("1");
  const [days, setDays] = useState("7");
  const [handle, setHandle] = useState("");
  const [contract, setContract] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [report, setReport] = useState<Report | null>(null);

  useEffect(() => {
    fetch("/api/agent").then((r) => r.json()).then(setAgent).catch(() => setError("Couldn't reach the agent."));
    setWallet(read<string>(WALLET_KEY));
    setTab(read<SerializedSession>(TAB_KEY));
  }, []);

  useEffect(() => {
    if (!wallet) return;
    client
      .balances({ wallet: wallet as `0x${string}`, tokens: [CELO_USDC], chainId: CELO_CHAIN_ID })
      .then((b) => setBalance((b.tokens?.[0] as { display?: string } | undefined)?.display ?? "0"))
      .catch(() => setBalance("?"));
  }, [wallet, client, busy]);

  async function step(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  const createWallet = () =>
    step("Creating your wallet", async () => {
      const w = await client.createPasskeyWallet({ name: "Vex" });
      setWallet(w.address);
      setSigner(w.signer);
      write(WALLET_KEY, w.address);
    });

  const unlock = () =>
    step("Unlocking with your passkey", async () => {
      const w = await client.recoverFromPasskey({ chainId: CELO_CHAIN_ID });
      setWallet(w.address);
      setSigner(w.signer);
      write(WALLET_KEY, w.address);
    });

  const openTab = () =>
    step("Opening the tab", async () => {
      if (!agent || !wallet || !signer) throw new Error("Unlock your wallet first.");
      // The user grants to the agent's key but never holds it: public half only
      const agentKey: Signer = {
        type: "privateKey",
        address: agent.sessionAddress,
        publicKey: agent.sessionPublicKey,
        signDigest: () => Promise.reject(new Error("The page never signs with the agent key")),
      };
      const session = await client.grantSession({
        wallet: { address: wallet as `0x${string}` },
        signer,
        permissions: { calls: TAB_CALLS, spend: [{ token: CELO_USDC, limit: usdc(daily), period: "day" }] },
        expiry: Math.floor(Date.now() / 1000) + Number(days) * 86_400,
        sessionSigner: agentKey,
        feeToken: CELO_USDC,
        feeSpendLimit: usdc("0.5"),
        chainId: CELO_CHAIN_ID,
      });
      if (session.status !== "granted") throw new Error("The tab wasn't opened. Check the wallet has USDC and a little CELO.");
      if (agent.payMode === "direct") {
        // Direct mode pays services with signatures, which USDC verifies through the wallet
        await client.approveSignatureChecker({ wallet: { address: wallet as `0x${string}` }, signer, session, checker: CELO_USDC, chainId: CELO_CHAIN_ID });
      }
      const stored = serializeSession(session);
      setTab(stored);
      write(TAB_KEY, stored);
    });

  const closeTab = () =>
    step("Closing the tab", async () => {
      if (!wallet || !signer || !tab) throw new Error("Unlock your wallet first.");
      await client.revokeSession({ wallet: { address: wallet as `0x${string}` }, signer, session: tab.publicKey, feeToken: CELO_USDC });
      setTab(null);
      write(TAB_KEY, null);
    });

  const runCheck = () =>
    step("Checking", async () => {
      setReport(null);
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ handle, contract, session: tab }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "The check failed.");
      setReport(body);
    });

  const cap = tab?.permissions.spend?.find((s) => s.token?.toLowerCase() === CELO_USDC.toLowerCase());
  const tabLive = tab && tab.expiry * 1000 > Date.now();

  return (
    <main>
      <header>
        <h1>Vex</h1>
        <p>Is this project's traction real or farmed? Give Vex a tab, not your keys.</p>
        {agent?.mock && <p className="note">Demo mode: sample data, nothing is paid.</p>}
        {agent?.error && <p className="error">{agent.error}</p>}
      </header>

      <section>
        <h2>1. Your wallet</h2>
        {wallet ? (
          <>
            <p>
              <code>{wallet}</code> · {balance || "…"} USDC
            </p>
            <p className="hint">Fund it with USDC on Celo, plus a little CELO for the one-time setup fee.</p>
            {!signer && <button onClick={unlock} disabled={!!busy}>Unlock with passkey</button>}
          </>
        ) : (
          <>
            <button onClick={createWallet} disabled={!!busy}>Create wallet with passkey</button>{" "}
            <button className="quiet" onClick={unlock} disabled={!!busy}>I already have one</button>
          </>
        )}
      </section>

      <section>
        <h2>2. Open a tab for Vex</h2>
        {tabLive ? (
          <>
            <p>
              Vex may spend up to <b>{cap ? showUsdc(cap.limit) : "?"} USDC a day</b>, USDC transfers only, until{" "}
              <b>{new Date(tab!.expiry * 1000).toLocaleDateString()}</b>. Altana enforces this onchain.
            </p>
            <button className="quiet" onClick={closeTab} disabled={!!busy || !signer}>Close the tab</button>
          </>
        ) : (
          <>
            <label>
              Daily cap (USDC) <input value={daily} onChange={(e) => setDaily(e.target.value)} inputMode="decimal" />
            </label>
            <label>
              Days <input value={days} onChange={(e) => setDays(e.target.value)} inputMode="numeric" />
            </label>
            <button onClick={openTab} disabled={!!busy || !signer}>Open tab</button>
            <p className="hint">Each check costs {agent?.checkPrice ?? "…"} USDC from the tab.</p>
          </>
        )}
      </section>

      <section>
        <h2>3. Check a project</h2>
        <label>
          X handle <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@project" />
        </label>
        <label>
          Celo token contract <input value={contract} onChange={(e) => setContract(e.target.value)} placeholder="0x…" />
        </label>
        <button onClick={runCheck} disabled={!!busy || (!agent?.mock && !tabLive) || (!handle && !contract)}>Run check</button>
      </section>

      {busy && <p className="note">{busy}…</p>}
      {error && <p className="error">{error}</p>}
      {report && <ReportView r={report} />}
    </main>
  );
}

function ReportView({ r }: { r: Report }) {
  const tx = (h?: string) => (h ? <a href={`https://celoscan.io/tx/${h}`} target="_blank" rel="noreferrer">tx</a> : "no tx");
  return (
    <section className="report">
      <h2>
        {r.subject}: {r.verdict} ({r.score}/100)
      </h2>
      <ul>{r.reasons.map((x) => <li key={x}>{x}</li>)}</ul>
      {r.charge && (
        <p>
          Charged {showUsdc(r.charge.amount)} USDC from your tab · {tx(r.charge.txHash)}
          {r.charge.refundTx && <> · refunded {tx(r.charge.refundTx)}</>}
        </p>
      )}
      <h3>What the scout paid for</h3>
      <ul>
        {r.paidCalls.map((c, i) => (
          <li key={i}>
            {c.service}: {showUsdc(c.amount)} USDC from {c.paidFrom === "tab" ? "your tab" : "the agent"} · {tx(c.txHash)}
          </li>
        ))}
      </ul>
      {r.social?.sample.length ? (
        <>
          <h3>Sample posts</h3>
          <ul>{r.social.sample.map((p) => <li key={p.url}><a href={p.url} target="_blank" rel="noreferrer">@{p.author}</a>: {p.text}</li>)}</ul>
        </>
      ) : null}
    </section>
  );
}
