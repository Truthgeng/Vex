"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient, CELO, serializeSession, type Signer } from "@altananetwork/sdk";
import { encodeFunctionData, erc20Abi, isAddress } from "viem";
import { CELO_USDC, CELO_CHAIN_ID, TAB_CALLS, usdc, showUsdc } from "@/lib/config";
import type { Allowance, CapTest, Chain, InsiderSignals, LogEntry, Pusher, Report, TabState, Verdict, Watch } from "@/lib/types";

type AgentInfo = {
  sessionPublicKey: `0x${string}`;
  sessionAddress: `0x${string}`;
  agentAddress: string;
  checkPrice: string;
  payMode: "tab" | "direct";
  mock: boolean;
  appCodes?: string[];
  error?: string;
};

const K = { wallet: "vex.wallet", token: "vex.token", demo: "vex.demo" };
const load = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const keep = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* storage off */ } };

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const ago = (iso?: string) => {
  if (!iso) return "never";
  const s = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};
const clock = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
const vClass = (v?: Verdict) => (v === "looks real" ? "v-real" : v === "mixed" ? "v-mixed" : v === "looks farmed" ? "v-farmed" : "v-none");
const vColor = (v?: Verdict) => (v === "looks real" ? "var(--real)" : v === "mixed" ? "var(--mixed)" : v === "looks farmed" ? "var(--farmed)" : "var(--faint)");
const nameOf = (w: { handle?: string; contract?: string }) => (w.handle ? `@${w.handle}` : w.contract ? short(w.contract) : "?");
const txLink = (h?: string) => (h ? <a className="tx" href={`https://celoscan.io/tx/${h}`} target="_blank" rel="noreferrer">{h.slice(0, 10)}…</a> : null);
const pct1 = (n: number) => `${Math.round(n * 1000) / 10}%`;

type View = "dossier" | "activity" | "wallet";

export default function Desk() {
  const [agent, setAgent] = useState<AgentInfo | null>(null);
  const client = useMemo(() => createClient({ chains: [CELO], agentIdentity: false, appCode: agent?.appCodes ?? ["vex"] }), [agent]);
  const [wallet, setWallet] = useState<string | null>(null);
  const [signer, setSigner] = useState<Signer | null>(null);
  const [demo, setDemo] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [tab, setTab] = useState<TabState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [balance, setBalance] = useState("");
  const [room, setRoom] = useState<Allowance | null>(null);
  const [busy, setBusy] = useState("");
  const [done, setDone] = useState("");
  const [error, setError] = useState("");
  const [daily, setDaily] = useState("1");
  const [days, setDays] = useState("7");
  const [add, setAdd] = useState({ handle: "", contract: "", chain: "celo" as Chain });
  const [once, setOnce] = useState<Report | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("dossier");
  const [capTest, setCapTest] = useState<CapTest | null>(null);
  const [wd, setWd] = useState({ to: "", amount: "" });

  const api = useCallback(
    async (path: string, init: RequestInit = {}) => {
      const res = await fetch(path, { ...init, headers: { "content-type": "application/json", "x-vex-wallet": wallet ?? "", "x-vex-token": token ?? "", ...(init.headers ?? {}) } });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Something went wrong.");
      return body;
    },
    [wallet, token],
  );

  async function run(label: string, fn: () => Promise<void>, success?: string) {
    setBusy(label);
    setError("");
    try {
      await fn();
      if (success) { setDone(success); setTimeout(() => setDone(""), 2400); }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  // ---------- loading ----------
  useEffect(() => {
    fetch("/api/agent").then((r) => r.json()).then(setAgent).catch(() => setError("Couldn't reach Vex."));
    setWallet(load(K.wallet));
    setToken(load(K.token));
    setDemo(load(K.demo) === "1");
    if (!load(K.token)) setLoaded(true);
  }, []);

  useEffect(() => {
    if (!wallet || !token) return;
    api("/api/tab")
      .then((t: TabState) => { setTab(t); setSel((s) => s ?? t.watches[0]?.id ?? null); })
      .catch(() => {
        setTab(null);
        if (load(K.demo) === "1") { setWallet(null); setToken(null); setDemo(false); keep(K.wallet, null); keep(K.token, null); keep(K.demo, null); }
      })
      .finally(() => setLoaded(true));
  }, [wallet, token, api]);

  // "Try the demo" links land here with ?demo=1
  useEffect(() => {
    if (!loaded || tab || wallet) return;
    if (new URLSearchParams(window.location.search).get("demo") === "1") tryDemo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!wallet || demo || tab) return;
    const t = setInterval(() => setTick((n) => n + 1), 10_000);
    return () => clearInterval(t);
  }, [wallet, demo, tab]);

  useEffect(() => {
    if (!wallet || demo) return;
    client.balances({ wallet: wallet as `0x${string}`, tokens: [CELO_USDC], chainId: CELO_CHAIN_ID })
      .then((b) => setBalance((b.tokens?.[0] as { display?: string } | undefined)?.display ?? "0"))
      .catch(() => setBalance("?"));
  }, [wallet, demo, client, busy, tick]);

  useEffect(() => {
    if (!tab || demo || agent?.mock) { setRoom(null); return; }
    api("/api/tab/allowance").then((a) => setRoom(a.source === "chain" ? a : null)).catch(() => setRoom(null));
  }, [tab, demo, agent, api, busy]);

  const live = !!tab && tab.session.expiry * 1000 > Date.now();
  const capUnits = BigInt(tab?.session.permissions.spend?.[0]?.limit ?? "0");
  const dayStart = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
  const loggedSpent = (tab?.log ?? []).filter((l) => l.kind === "check" && l.amount && Date.parse(l.at) >= dayStart).reduce((a, l) => a + BigInt(l.amount!), 0n);
  const spent = room ? BigInt(room.spent) : loggedSpent;
  const locked = !!wallet && !demo && !signer;
  const watch = tab?.watches.find((w) => w.id === sel) ?? null;

  // ---------- actions ----------
  const createWallet = () => run("Creating your wallet", async () => {
    const w = await client.createPasskeyWallet({ name: "Vex" });
    setWallet(w.address); setSigner(w.signer); keep(K.wallet, w.address); keep(K.demo, null); setDemo(false);
  }, "Wallet ready");

  const unlock = () => run("Unlocking with your passkey", async () => {
    const w = await client.recoverFromPasskey({ chainId: CELO_CHAIN_ID });
    setWallet(w.address); setSigner(w.signer); keep(K.wallet, w.address); keep(K.demo, null); setDemo(false);
  }, "Unlocked");

  function tryDemo() {
    run("Opening a demo desk", async () => {
      const bytes = crypto.getRandomValues(new Uint8Array(20));
      const addr = `0x${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
      const res = await fetch("/api/tab", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ demoWallet: addr }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setWallet(addr); setToken(body.ownerToken); setTab(body.tab); setDemo(true);
      keep(K.wallet, addr); keep(K.token, body.ownerToken); keep(K.demo, "1");
      // Two sample projects, so there is something to look at straight away
      const h = { "content-type": "application/json", "x-vex-wallet": addr, "x-vex-token": body.ownerToken };
      let last: TabState = body.tab;
      for (const watchIt of [{ handle: "pumpcoin", contract: "0x471EcE3750Da237f93B8E339c536989b8978a438", chain: "celo" }, { handle: "steadybuilders" }]) {
        const r = await fetch("/api/watch", { method: "POST", headers: h, body: JSON.stringify(watchIt) });
        if (r.ok) last = (await r.json()).tab;
      }
      setTab(last); setSel(last.watches[last.watches.length - 1]?.id ?? null);
    }, "Demo desk open");
  }

  const openTab = () => run("Opening your tab", async () => {
    if (!agent || !wallet || !signer) throw new Error("Unlock your wallet first.");
    const agentKey: Signer = { type: "privateKey", address: agent.sessionAddress, publicKey: agent.sessionPublicKey, signDigest: () => Promise.reject(new Error("The page never signs with the agent key")) };
    const session = await client.grantSession({
      wallet: { address: wallet as `0x${string}` }, signer,
      permissions: { calls: TAB_CALLS, spend: [{ token: CELO_USDC, limit: usdc(daily), period: "day" }] },
      expiry: Math.floor(Date.now() / 1000) + Number(days) * 86_400,
      sessionSigner: agentKey, feeToken: CELO_USDC, feeSpendLimit: usdc("0.5"), chainId: CELO_CHAIN_ID,
    });
    if (session.status !== "granted") throw new Error("The tab wasn't opened. Check the wallet has USDC and a little CELO.");
    if (agent.payMode === "direct") await client.approveSignatureChecker({ wallet: { address: wallet as `0x${string}` }, signer, session, checker: CELO_USDC, chainId: CELO_CHAIN_ID });
    const stored = serializeSession(session);
    let body: { ownerToken: string; tab: TabState } | null = null;
    for (let i = 0; i < 6 && !body; i++) {
      const res = await fetch("/api/tab", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ session: stored, ownerToken: token }) });
      const b = await res.json();
      if (res.ok) body = b;
      else if (res.status === 409 && b.error?.includes("onchain")) await new Promise((r) => setTimeout(r, 3000));
      else throw new Error(b.error);
    }
    if (!body) throw new Error("The tab is open onchain but Vex couldn't see it yet. Refresh in a minute.");
    setToken(body.ownerToken); setTab(body.tab); keep(K.token, body.ownerToken);
  }, "Tab open");

  const closeTab = () => run("Closing your tab", async () => {
    if (!demo) {
      if (!wallet || !signer || !tab) throw new Error("Unlock your wallet first.");
      await client.revokeSession({ wallet: { address: wallet as `0x${string}` }, signer, session: tab.session.publicKey, feeToken: CELO_USDC });
    }
    await api("/api/tab", { method: "DELETE" }).catch(() => undefined);
    setTab(null); setToken(null); keep(K.token, null); setSel(null);
    if (demo) { setWallet(null); setDemo(false); keep(K.wallet, null); keep(K.demo, null); }
  }, "Tab closed");

  const withdraw = () => run("Sending", async () => {
    if (!wallet || !signer) throw new Error("Unlock your wallet first.");
    if (!isAddress(wd.to)) throw new Error("That address doesn't look right.");
    const amount = usdc(wd.amount || "0");
    if (amount <= 0n) throw new Error("Enter an amount.");
    const res = await client.execute({
      wallet: { address: wallet as `0x${string}` }, signer,
      calls: [{ to: CELO_USDC, data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [wd.to, amount] }), value: 0n }],
      feeToken: CELO_USDC, chainId: CELO_CHAIN_ID,
    });
    if (res.status !== "CONFIRMED") throw new Error("The transfer didn't go through. Leave a little USDC for the fee.");
    setWd({ to: "", amount: "" });
  }, "Sent");

  const addWatch = () => run("Adding it and running the first check", async () => {
    const body = await api("/api/watch", { method: "POST", body: JSON.stringify(add) });
    setTab(body.tab); setSel(body.tab.watches[0]?.id ?? null); setOnce(null); setView("dossier"); setOpen(true);
    setAdd({ handle: "", contract: "", chain: add.chain });
  }, "Watching");

  const checkOnce = () => run("Checking once", async () => {
    const r = await api("/api/check", { method: "POST", body: JSON.stringify(add) });
    setOnce(r); setSel(null); setView("dossier"); setOpen(true);
    api("/api/tab").then(setTab).catch(() => undefined);
  }, "Done");

  const runWatch = (w: Watch, mode: "decide" | "deep") => run(mode === "decide" ? "Vex is deciding" : "Buying a deep check", async () => {
    const body = await api("/api/watch", { method: "PATCH", body: JSON.stringify({ id: w.id, mode }) });
    setTab(body.tab);
  }, "Done");

  const removeWatch = (w: Watch) => run("Removing", async () => {
    const body = await api(`/api/watch?id=${w.id}`, { method: "DELETE" });
    setTab(body.tab); setSel(body.tab.watches[0]?.id ?? null); setOpen(false);
  });

  const testCap = () => run("Asking Altana to overspend", async () => { setCapTest(await api("/api/tab/cap-test", { method: "POST" })); });

  // ---------- views ----------
  const toast = (busy || done) && (
    <div className="toast" role="status">{busy ? <span className="spinner" /> : <Check />}{busy ? `${busy}…` : done}</div>
  );

  if (!loaded) return <div className="wrap" style={{ paddingTop: 160 }}><p className="dim">Loading your desk…</p></div>;

  if (!live) {
    return (
      <>
        <Setup
          agent={agent} wallet={wallet} signer={signer} balance={balance} busy={!!busy}
          daily={daily} days={days} setDaily={setDaily} setDays={setDays}
          onCreate={createWallet} onUnlock={unlock} onOpen={openTab} onDemo={tryDemo}
        />
        <div className="wrap">{error && <p className="error">{error}</p>}</div>
        {toast}
      </>
    );
  }

  return (
    <>
      <div className="desk-bar">
        <div className="wrap">
          {demo && <span className="sample">demo desk</span>}
          <div className="chip"><span className="celo-dot" /> <span className="mono">{short(wallet!)}</span> <b>{demo ? "5.00" : balance || "…"} USDC</b></div>
          <span className="chip-sep" />
          <div className="chip">Today <div className="tiny-bar"><i style={{ width: `${capUnits ? Math.min(100, (Number(spent) / Number(capUnits)) * 100) : 0}%` }} /></div> <b>{showUsdc(spent)} / {showUsdc(capUnits)}</b>{room && <span className="faint">from Celo</span>}</div>
          <span className="chip-sep" />
          <div className="chip">Tab ends <b>{new Date(tab!.session.expiry * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</b></div>
          <span className="chip-sep" />
          <div className="chip">
            Alerts{" "}
            {tab!.telegram.linked ? <b>Telegram linked</b> : tab!.telegram.link ? <a className="link" href={tab!.telegram.link} target="_blank" rel="noreferrer">Link Telegram</a> : <span className="faint">off</span>}
          </div>
          {locked && <><span className="chip-sep" /><button className="btn btn-line btn-sm" onClick={unlock} disabled={!!busy}>Unlock wallet</button></>}
        </div>
      </div>

      <div className="wrap">
        <div className={`desk-grid ${open ? "open" : ""}`}>
          <aside className="rail">
            <h2>Watchlist</h2>
            <p className="hint">Vex scans each one daily and buys a deep check only when something moves.</p>
            <div className="add">
              <label className="field"><span>X handle</span><input className="input" value={add.handle} onChange={(e) => setAdd({ ...add, handle: e.target.value })} placeholder="@project" /></label>
              <div className="row">
                <label className="field" style={{ flex: 2 }}><span>Token contract, optional</span><input className="input mono" value={add.contract} onChange={(e) => setAdd({ ...add, contract: e.target.value })} placeholder="0x…" /></label>
                <label className="field"><span>Chain</span>
                  <select className="input" value={add.chain} onChange={(e) => setAdd({ ...add, chain: e.target.value as Chain })}><option value="celo">Celo</option><option value="ethereum">Ethereum</option></select>
                </label>
              </div>
              <div className="add-actions">
                <button className="btn btn-paper btn-sm" onClick={addWatch} disabled={!!busy || (!add.handle && !add.contract)}>Watch</button>
                <button className="btn btn-line btn-sm" onClick={checkOnce} disabled={!!busy || (!add.handle && !add.contract)}>Check once</button>
              </div>
            </div>

            {tab!.watches.length === 0 ? (
              <div className="empty"><span className="serif">Nothing watched yet.</span>Add a project you promote or are about to take a deal from.</div>
            ) : (
              <ul className="wl">
                {tab!.watches.map((w) => (
                  <li key={w.id}>
                    <button className={`wl-item ${sel === w.id && !once ? "sel" : ""}`} onClick={() => { setSel(w.id); setOnce(null); setView("dossier"); setOpen(true); }}>
                      <Dial score={w.last?.score} verdict={w.last?.verdict} />
                      <span style={{ minWidth: 0 }}>
                        <b>{nameOf(w)}</b>
                        <small>{w.paused ? w.paused : w.deepPending ? "deep check tomorrow" : `checked ${ago(w.lastCheckedAt)}`}</small>
                      </span>
                      <span className={`vtag ${vClass(w.last?.verdict)}`}>{w.last ? w.last.verdict.replace("looks ", "") : "new"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          <main className="pane">
            <button className="btn btn-line btn-sm back" onClick={() => setOpen(false)}>Back to watchlist</button>
            <div className="tabs" role="tablist">
              {(["dossier", "activity", "wallet"] as View[]).map((v) => (
                <button key={v} role="tab" aria-selected={view === v} className={view === v ? "on" : ""} onClick={() => setView(v)}>
                  {v === "dossier" ? "Dossier" : v === "activity" ? "Activity" : "Wallet and tab"}
                </button>
              ))}
            </div>

            {view === "dossier" && (
              once ? <Dossier report={once} title={once.subject} onceOnly busy={!!busy} />
                : watch ? (
                  <Dossier
                    watch={watch} report={watch.lastReport} title={nameOf(watch)} busy={!!busy}
                    log={tab!.log.filter((l) => l.subject.startsWith(nameOf(watch)))}
                    onDecide={() => runWatch(watch, "decide")} onDeep={() => runWatch(watch, "deep")} onRemove={() => removeWatch(watch)}
                  />
                ) : <div className="empty"><span className="serif">Pick a project.</span>Its full dossier shows here.</div>
            )}

            {view === "activity" && <Activity log={tab!.log} demo={demo} />}

            {view === "wallet" && (
              <div style={{ display: "grid", gap: 14 }}>
                <div className="wallet-grid">
                  <div className="panel">
                    <div className="sec-h"><h3>Wallet</h3><span>{demo ? "demo" : "yours alone"}</span></div>
                    <div className="big">{demo ? "5.00" : balance || "…"} <span className="dim" style={{ font: "400 15px var(--sans)" }}>USDC</span></div>
                    <p className="mono dim" style={{ wordBreak: "break-all", margin: "10px 0 14px" }}>{wallet}</p>
                    <button className="btn btn-line btn-sm" onClick={() => { navigator.clipboard?.writeText(wallet!); setDone("Address copied"); setTimeout(() => setDone(""), 1600); }}>Copy address to fund</button>
                  </div>
                  <div className="panel">
                    <div className="sec-h"><h3>Withdraw</h3><span>signed with your passkey</span></div>
                    <label className="field"><span>Send to</span><input className="input mono" value={wd.to} onChange={(e) => setWd({ ...wd, to: e.target.value })} placeholder="0x…" /></label>
                    <div className="row" style={{ alignItems: "flex-end" }}>
                      <label className="field"><span>Amount, USDC</span><input className="input" inputMode="decimal" value={wd.amount} onChange={(e) => setWd({ ...wd, amount: e.target.value })} /></label>
                      <button className="btn btn-paper btn-sm" style={{ marginBottom: 10 }} onClick={withdraw} disabled={!!busy || demo || locked}>Send</button>
                    </div>
                    <p className="note">{demo ? "Off on the demo desk." : locked ? "Unlock your wallet first." : "Vex can't move money here. Only you can."}</p>
                  </div>
                </div>
                <div className="panel">
                  <div className="sec-h"><h3>The tab</h3><span>{room ? "read from the account on Celo" : demo ? "demo" : ""}</span></div>
                  <div className="stats">
                    <div><b>{showUsdc(capUnits)}</b><span>USDC a day</span></div>
                    <div><b>{showUsdc(spent)}</b><span>spent today</span></div>
                    <div><b>{showUsdc(capUnits > spent ? capUnits - spent : 0n)}</b><span>left today</span></div>
                    <div><b>{new Date(tab!.session.expiry * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</b><span>ends</span></div>
                  </div>
                  <p className="note">Vex may only call USDC transfer. The daily limit resets at 00:00 UTC.</p>
                  <div className="row" style={{ marginTop: 14 }}>
                    <button className="btn btn-line btn-sm" onClick={testCap} disabled={!!busy}>Test the cap</button>
                    <button className="btn btn-line btn-sm" onClick={closeTab} disabled={!!busy || locked}>Close the tab</button>
                  </div>
                  {capTest && (
                    <div className={`callout ${capTest.refused ? "good" : "bad"}`} role="status">
                      Vex asked to move <b>{showUsdc(capTest.attempted)} USDC</b>, 0.01 more than the tab had left. <b className="r">{capTest.refused ? "Refused." : "It went through and was refunded."}</b>
                      <div className="faint" style={{ marginTop: 4 }}>{capTest.reason} {txLink(capTest.tx)} {capTest.demo && <span className="sample">demo</span>}</div>
                    </div>
                  )}
                </div>
              </div>
            )}
            {error && <p className="error">{error}</p>}
          </main>
        </div>
      </div>
      {toast}
    </>
  );
}

/* ---------------- Setup ---------------- */

function Setup(p: {
  agent: AgentInfo | null; wallet: string | null; signer: Signer | null; balance: string; busy: boolean;
  daily: string; days: string; setDaily: (v: string) => void; setDays: (v: string) => void;
  onCreate: () => void; onUnlock: () => void; onOpen: () => void; onDemo: () => void;
}) {
  const hasWallet = !!p.wallet && !!p.signer;
  const funded = hasWallet && Number(p.balance) > 0;
  const stage = !hasWallet ? 1 : !funded ? 2 : 3;
  const cls = (n: number) => (n < stage ? "done" : n === stage ? "now" : "later");
  return (
    <div className="wrap">
      <div className="setup">
        <p className="kicker">Your desk</p>
        <h1>Set up Vex in three steps.</h1>
        <p className="lead">A wallet that only you control, a tab with limits you choose, and Vex starts watching. About two minutes.</p>
        <ol className="steps">
          <li className={`step ${cls(1)}`}>
            <span className="n">{stage > 1 ? "✓" : "1"}</span>
            <div>
              <h3>Make your wallet</h3>
              <p>{hasWallet ? <>Wallet <span className="mono">{short(p.wallet!)}</span> is ready.</> : "Face ID or Touch ID. No seed phrase, no extension."}</p>
              {stage === 1 && (
                <div className="body row">
                  <button className="btn btn-paper" onClick={p.onCreate} disabled={p.busy || p.agent?.mock}>Create wallet</button>
                  <button className="btn btn-line" onClick={p.onUnlock} disabled={p.busy || p.agent?.mock}>I already have one</button>
                </div>
              )}
            </div>
          </li>
          <li className={`step ${cls(2)}`}>
            <span className="n">{stage > 2 ? "✓" : "2"}</span>
            <div>
              <h3>Add a few dollars of USDC on Celo</h3>
              <p>{funded ? `${p.balance} USDC in the wallet.` : "Send USDC on Celo from any wallet or exchange, plus a little CELO for the one-time setup fee."}</p>
              {stage === 2 && (
                <div className="body">
                  <p className="mono" style={{ wordBreak: "break-all", marginBottom: 12 }}>{p.wallet}</p>
                  <div className="row">
                    <button className="btn btn-paper btn-sm" onClick={() => navigator.clipboard?.writeText(p.wallet!)}>Copy address</button>
                    <span className="note" style={{ alignSelf: "center" }}>Balance: {p.balance || "checking…"} USDC. This page updates when it lands.</span>
                  </div>
                </div>
              )}
            </div>
          </li>
          <li className={`step ${cls(3)}`}>
            <span className="n">3</span>
            <div>
              <h3>Open a tab for Vex</h3>
              <p>Vex can move USDC only, up to your daily cap, until the date you set. Altana enforces it on Celo.</p>
              {stage === 3 && (
                <div className="body">
                  <div className="limits">
                    <label className="limit"><small>Daily cap, USDC</small><input inputMode="decimal" value={p.daily} onChange={(e) => p.setDaily(e.target.value)} /></label>
                    <label className="limit"><small>Days</small><input inputMode="numeric" value={p.days} onChange={(e) => p.setDays(e.target.value)} /></label>
                    <div className="limit"><small>Can move</small><span className="fixed">USDC only</span></div>
                  </div>
                  <button className="btn btn-paper" onClick={p.onOpen} disabled={p.busy}>Open the tab</button>
                  <p className="note" style={{ marginTop: 12 }}>A daily scan costs 0.01 USDC, a deep check {p.agent?.checkPrice ?? "0.05"}. You can close the tab any time.</p>
                </div>
              )}
            </div>
          </li>
        </ol>
        <div className="or">
          <span>Just looking? The demo desk uses sample data and costs nothing.</span>
          <button className="btn btn-line btn-sm" onClick={p.onDemo} disabled={p.busy}>Try the demo</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Dossier ---------------- */

function Dossier(p: {
  watch?: Watch; report?: Report | null; title: string; busy: boolean; onceOnly?: boolean; log?: LogEntry[];
  onDecide?: () => void; onDeep?: () => void; onRemove?: () => void;
}) {
  const r = p.report;
  const w = p.watch;
  const score = w?.last?.score ?? r?.score;
  const verdict = w?.last?.verdict ?? r?.verdict;
  const spentHere = (p.log ?? []).filter((l) => l.kind === "check" && l.amount);
  const total = spentHere.reduce((a, l) => a + BigInt(l.amount!), 0n);
  return (
    <div>
      <div className="dossier-head">
        <Dial score={score} verdict={verdict} large />
        <div style={{ minWidth: 0 }}>
          <h1>{p.title}</h1>
          <div className="sub">
            <span className={`vtag ${vClass(verdict)}`}>{verdict ?? "not checked yet"}</span>
            {w?.contract && <span className="mono">{short(w.contract)} · {w.chain ?? "celo"}</span>}
            {w && <span>last deep check {ago(w.lastDeepAt)}</span>}
            {p.onceOnly && <span>one-off check, not watched</span>}
            {r?.mode === "mock" && <span className="sample">sample data</span>}
          </div>
        </div>
        {w && (
          <div className="dossier-actions">
            <button className="btn btn-paper btn-sm" onClick={p.onDecide} disabled={p.busy} title="What the daily run does: a scan, then a deep check only if something moved">Let Vex decide</button>
            <button className="btn btn-line btn-sm" onClick={p.onDeep} disabled={p.busy}>Deep check</button>
            <button className="btn btn-line btn-sm" onClick={p.onRemove} disabled={p.busy} aria-label="Stop watching">Stop watching</button>
          </div>
        )}
      </div>

      {w?.lastDecision && <p className="decision"><b>Vex&apos;s last call.</b> {w.lastDecision}</p>}
      {w?.paused && <p className="decision" style={{ borderColor: "var(--mixed)" }}><b>Paused.</b> {w.paused}</p>}

      {!r ? (
        <div className="sec"><p className="dim">No deep check yet. Let Vex decide, or buy a deep check.</p></div>
      ) : (
        <>
          <section className="sec">
            <div className="sec-h"><h3>Findings</h3><span>{new Date(r.at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span></div>
            <ul className="reasons">{r.reasons.map((x) => <li key={x}>{x}</li>)}</ul>
          </section>
          {w?.history && w.history.length > 1 && (
            <section className="sec">
              <div className="sec-h"><h3>Score over time</h3><span>{w.history.length} deep checks</span></div>
              <Spark points={w.history} />
            </section>
          )}
          {r.insiders && <Holders i={r.insiders} />}
          {r.pushers?.length ? <Pushers list={r.pushers} /> : null}
          {r.social && (
            <section className="sec">
              <div className="sec-h"><h3>On X this week</h3><span>posts tagging it, not by it</span></div>
              <div className="stats">
                <div><b>{r.social.posts}</b><span>posts</span></div>
                <div><b>{r.social.accounts}</b><span>accounts</span></div>
                <div><b>{pct1(r.social.topThreeShare)}</b><span>by the top 3</span></div>
                <div><b>{pct1(r.social.copyPasteShare)}</b><span>copy-paste</span></div>
                <div><b>{pct1(r.social.newAccountShare)}</b><span>new accounts</span></div>
              </div>
            </section>
          )}
          {r.chain && (
            <section className="sec">
              <div className="sec-h"><h3>Transfers</h3><span>last {r.chain.hours}h on Celo</span></div>
              <div className="stats">
                <div><b>{r.chain.transfers}</b><span>transfers</span></div>
                <div><b>{r.chain.wallets}</b><span>wallets</span></div>
                <div><b>{pct1(r.chain.topTenShare)}</b><span>through the top 10</span></div>
                <div><b>{pct1(r.chain.backAndForthShare)}</b><span>back and forth</span></div>
              </div>
            </section>
          )}
        </>
      )}

      {(spentHere.length > 0 || (p.onceOnly && r)) && (
        <section className="sec">
          <div className="sec-h"><h3>What Vex spent on it</h3><span>{showUsdc(p.onceOnly && r?.charge ? BigInt(r.charge.amount) : total)} USDC in total</span></div>
          <table className="tbl">
            <tbody>
              {p.onceOnly && r
                ? <tr><td>One-off deep check</td><td>{r.charge ? `${showUsdc(r.charge.amount)} USDC` : "free"}</td><td>{txLink(r.charge?.txHash)}</td></tr>
                : spentHere.slice(0, 8).map((l, i) => (
                  <tr key={i}>
                    <td className="dim" style={{ whiteSpace: "nowrap" }}>{ago(l.at)}</td>
                    <td>{l.depth === "scan" ? "Daily scan" : "Deep check"} {l.auto && <span className="pill auto">on schedule</span>}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{showUsdc(l.amount!)} USDC</td>
                    <td>{txLink(l.tx) ?? (r?.mode === "mock" ? <span className="faint">sample</span> : null)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function Holders({ i }: { i: InsiderSignals }) {
  const s = i.snapshot;
  const explorer = s.chain === "celo" ? "https://celoscan.io/address/" : "https://etherscan.io/address/";
  const dep = s.deployer?.share ?? 0;
  const top = Math.max(0, s.topTenShare - (s.top.some((t) => t.address === s.deployer?.address) ? dep : 0));
  const pools = s.contracts.reduce((a, c) => a + c.share, 0);
  const rest = Math.max(0, 1 - dep - top - pools);
  return (
    <section className="sec">
      <div className="sec-h"><h3>Holders</h3><span>{s.symbol} on {s.chain} · {s.holdersCount.toLocaleString()} holders</span></div>
      {i.moves.length > 0 && <ul className={`moves ${i.sold ? "bad" : ""}`}>{i.moves.map((m) => <li key={m}>{m}</li>)}</ul>}
      <div className="hbar" style={{ height: 12 }}>
        <i style={{ flexBasis: `${dep * 100}%`, background: "var(--flare)" }} />
        <i style={{ flexBasis: `${top * 100}%`, background: "rgba(237,234,227,0.6)" }} />
        <i style={{ flexBasis: `${pools * 100}%`, background: "rgba(237,234,227,0.24)" }} />
        <i style={{ flexBasis: `${rest * 100}%`, background: "rgba(237,234,227,0.07)" }} />
      </div>
      <div className="legend">
        <span><i style={{ background: "var(--flare)" }} />Deployer {pct1(dep)}</span>
        <span><i style={{ background: "rgba(237,234,227,0.6)" }} />Top 10 wallets {pct1(top)}</span>
        <span><i style={{ background: "rgba(237,234,227,0.24)" }} />Pools and exchanges {pct1(pools)}</span>
        <span><i style={{ background: "rgba(237,234,227,0.1)" }} />Everyone else {pct1(rest)}</span>
      </div>
      <table className="tbl">
        <thead><tr><th>Wallet</th><th>Who</th><th>Share</th></tr></thead>
        <tbody>
          {s.deployer && <tr><td><a className="tx" href={explorer + s.deployer.address} target="_blank" rel="noreferrer">{short(s.deployer.address)}</a></td><td>Deployer</td><td>{pct1(s.deployer.share)}</td></tr>}
          {s.top.slice(0, 5).map((h) => <tr key={h.address}><td><a className="tx" href={explorer + h.address} target="_blank" rel="noreferrer">{short(h.address)}</a></td><td className="dim">{h.label ?? "Wallet"}</td><td>{pct1(h.share)}</td></tr>)}
          {s.contracts.slice(0, 3).map((h) => <tr key={h.address}><td><a className="tx" href={explorer + h.address} target="_blank" rel="noreferrer">{short(h.address)}</a></td><td className="dim">{h.label ?? "Contract"}</td><td>{pct1(h.share)}</td></tr>)}
        </tbody>
      </table>
    </section>
  );
}

function Pushers({ list }: { list: Pusher[] }) {
  return (
    <section className="sec">
      <div className="sec-h"><h3>Who&apos;s pushing it</h3><span>flags are signals, not proof</span></div>
      <div style={{ overflowX: "auto" }}>
        <table className="tbl">
          <thead><tr><th>Account</th><th className="hide-sm">Posts</th><th>Followers</th><th className="hide-sm">Age</th><th>Worth a look</th></tr></thead>
          <tbody>
            {list.slice(0, 8).map((p) => (
              <tr key={p.author}>
                <td><a href={`https://x.com/${p.author}`} target="_blank" rel="noreferrer">@{p.author}</a></td>
                <td className="hide-sm">{p.posts}</td>
                <td>{p.followers !== undefined ? p.followers.toLocaleString() : "?"}</td>
                <td className="hide-sm">{p.ageDays !== undefined ? `${p.ageDays}d` : "?"}</td>
                <td style={{ whiteSpace: "normal" }}>
                  {p.flags.length ? p.flags.map((f) => <span key={f} className="flag">{f}</span>) : <span className="faint">nothing odd</span>}
                  {p.alsoPushed.length >= 3 && <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>also pushed {p.alsoPushed.join(", ")}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ---------------- Activity ---------------- */

function Activity({ log, demo }: { log: LogEntry[]; demo: boolean }) {
  if (!log.length) return <div className="empty"><span className="serif">Nothing yet.</span>Every scan, deep check and alert shows up here with what it cost.</div>;
  return (
    <ul className="feed">
      {log.map((l, i) => (
        <li key={`${l.at}${i}`}>
          <span className="when">{clock(l.at)}<br />{new Date(l.at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>
          <div className="what">
            {l.auto ? <span className="pill auto">on schedule</span> : <span className="pill">by you</span>}
            {l.kind === "alert" ? "Alert sent" : l.kind === "paused" ? "Paused" : l.kind === "deferred" ? "Deep check waits" : l.depth === "scan" ? "Daily scan" : "Deep check"}: {l.subject}
            {l.verdict && l.kind === "check" && <> <span className={`vtag ${vClass(l.verdict)}`}>{l.score}</span></>}
            {l.note && <small>{l.note}</small>}
          </div>
          <span className="amt">{l.amount ? `${showUsdc(l.amount)} USDC${demo ? " sample" : ""}` : ""}{l.tx && <><br />{txLink(l.tx)}</>}</span>
        </li>
      ))}
    </ul>
  );
}

/* ---------------- Small pieces ---------------- */

function Dial({ score, verdict, large }: { score?: number; verdict?: Verdict; large?: boolean }) {
  const size = large ? 84 : 40;
  const sw = large ? 3 : 2.5;
  const r = (size - sw) / 2 - 1;
  const c = 2 * Math.PI * r;
  const p = score !== undefined ? score / 100 : 0;
  return (
    <div className={`dial ${large ? "lg" : ""}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(237,234,227,0.08)" strokeWidth={sw} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={vColor(verdict)} strokeWidth={sw} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - p)} style={{ transition: "stroke-dashoffset 0.9s var(--ease)" }} />
      </svg>
      <span>{score ?? "–"}</span>
    </div>
  );
}

function Spark({ points }: { points: { at: string; score: number; verdict: Verdict }[] }) {
  const W = 600, H = 72, pad = 6;
  const xs = points.map((_, i) => pad + (i / Math.max(1, points.length - 1)) * (W - pad * 2));
  const ys = points.map((p) => H - pad - (p.score / 100) * (H - pad * 2));
  const d = xs.map((x, i) => `${i ? "L" : "M"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Score went from ${points[0].score} to ${points[points.length - 1].score}`}>
      <line x1="0" x2={W} y1={H - pad - 0.45 * (H - pad * 2)} y2={H - pad - 0.45 * (H - pad * 2)} stroke="rgba(237,234,227,0.08)" strokeDasharray="3 4" />
      <line x1="0" x2={W} y1={H - pad - 0.7 * (H - pad * 2)} y2={H - pad - 0.7 * (H - pad * 2)} stroke="rgba(237,234,227,0.08)" strokeDasharray="3 4" />
      <path d={d} fill="none" stroke="var(--paper)" strokeWidth="1.5" />
      {xs.map((x, i) => <circle key={i} cx={x} cy={ys[i]} r="3.5" fill={vColor(points[i].verdict)} />)}
    </svg>
  );
}

function Check() {
  return (
    <svg className="check" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3 8.5l3.2 3L13 4.5" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
