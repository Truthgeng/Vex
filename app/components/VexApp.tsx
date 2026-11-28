"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient, CELO, serializeSession, type Signer } from "@altananetwork/sdk";
import { encodeFunctionData, erc20Abi, isAddress } from "viem";
import { CELO_USDC, CELO_CHAIN_ID, TAB_CALLS, usdc, showUsdc } from "@/lib/config";
import type { Allowance, CapTest, LogEntry, Report, TabState, Verdict, Watch } from "@/lib/types";

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
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};
const vClass = (v?: Verdict) => (v === "looks real" ? "v-real" : v === "mixed" ? "v-mixed" : v === "looks farmed" ? "v-farmed" : "v-none");
const vColor = (v?: Verdict) => (v === "looks real" ? "var(--real)" : v === "mixed" ? "var(--mixed)" : v === "looks farmed" ? "var(--farmed)" : "var(--faint)");
const txLink = (h?: string) => (h ? <a className="tx" href={`https://celoscan.io/tx/${h}`} target="_blank" rel="noreferrer">{h.slice(0, 8)}…</a> : null);

export default function VexApp() {
  const [agent, setAgent] = useState<AgentInfo | null>(null);
  // The user's own transactions (open tab, withdraw, close) carry Vex's attribution tag too
  const client = useMemo(() => createClient({ chains: [CELO], agentIdentity: false, appCode: agent?.appCodes ?? ["vex"] }), [agent]);
  const [wallet, setWallet] = useState<string | null>(null);
  const [signer, setSigner] = useState<Signer | null>(null);
  const [demo, setDemo] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [tab, setTab] = useState<TabState | null>(null);
  const [balance, setBalance] = useState<string>("");
  const [busy, setBusy] = useState("");
  const [done, setDone] = useState("");
  const [error, setError] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [daily, setDaily] = useState("1");
  const [days, setDays] = useState("7");
  const [watchIn, setWatchIn] = useState({ handle: "", contract: "" });
  const [checkIn, setCheckIn] = useState({ handle: "", contract: "" });
  const [wd, setWd] = useState<{ open: boolean; to: string; amount: string }>({ open: false, to: "", amount: "" });
  const [open, setOpen] = useState<string | null>(null);
  const [room, setRoom] = useState<Allowance | null>(null);
  const [capTest, setCapTest] = useState<CapTest | null>(null);

  const api = useCallback(
    async (path: string, init: RequestInit = {}) => {
      const res = await fetch(path, {
        ...init,
        headers: { "content-type": "application/json", "x-vex-wallet": wallet ?? "", "x-vex-token": token ?? "", ...(init.headers ?? {}) },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Something went wrong.");
      return body;
    },
    [wallet, token],
  );

  // First load: agent info and whatever this browser remembers
  useEffect(() => {
    fetch("/api/agent").then((r) => r.json()).then(setAgent).catch(() => setError("Couldn't reach Vex."));
    setWallet(load(K.wallet));
    setToken(load(K.token));
    setDemo(load(K.demo) === "1");
  }, []);

  // Load the tab once we know who this is
  useEffect(() => {
    if (!wallet || !token) return;
    api("/api/tab")
      .then(setTab)
      .catch(() => {
        setTab(null);
        // Demo tabs live in memory on the server and can be forgotten: start over cleanly
        if (load(K.demo) === "1") { setWallet(null); setToken(null); setDemo(false); keep(K.wallet, null); keep(K.token, null); keep(K.demo, null); }
      });
  }, [wallet, token, api]);

  // What the tab may still spend today, read from Celo (live tabs only)
  useEffect(() => {
    if (!tab || demo || agent?.mock) { setRoom(null); return; }
    api("/api/tab/allowance").then((a) => setRoom(a.source === "chain" ? a : null)).catch(() => setRoom(null));
  }, [tab, demo, agent, api, busy]);

  // Wallet balance
  useEffect(() => {
    if (!wallet || demo) return;
    client
      .balances({ wallet: wallet as `0x${string}`, tokens: [CELO_USDC], chainId: CELO_CHAIN_ID })
      .then((b) => setBalance((b.tokens?.[0] as { display?: string } | undefined)?.display ?? "0"))
      .catch(() => setBalance("?"));
  }, [wallet, demo, client, busy]);

  async function run(label: string, fn: () => Promise<void>, success?: string) {
    setBusy(label);
    setError("");
    try {
      await fn();
      if (success) { setDone(success); setTimeout(() => setDone(""), 2600); }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  const live = !!tab && tab.session.expiry * 1000 > Date.now();
  const cap = tab?.session.permissions.spend?.[0];
  const capUnits = cap ? BigInt(cap.limit) : 0n;
  // Altana's daily cap resets at 00:00 UTC, so count from there, not a rolling 24h
  const dayStart = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
  const loggedSpent = (tab?.log ?? [])
    .filter((l) => l.kind === "check" && l.amount && Date.parse(l.at) >= dayStart)
    .reduce((a, l) => a + BigInt(l.amount!), 0n);
  // Prefer the chain's own numbers when we have them
  const spentUnits = room ? BigInt(room.spent) : loggedSpent;

  // ---------- actions ----------

  const createWallet = () =>
    run("Creating your wallet", async () => {
      const w = await client.createPasskeyWallet({ name: "Vex" });
      setWallet(w.address); setSigner(w.signer); keep(K.wallet, w.address); keep(K.demo, null); setDemo(false);
    }, "Wallet ready");

  const unlock = () =>
    run("Unlocking with your passkey", async () => {
      const w = await client.recoverFromPasskey({ chainId: CELO_CHAIN_ID });
      setWallet(w.address); setSigner(w.signer); keep(K.wallet, w.address); keep(K.demo, null); setDemo(false);
    }, "Unlocked");

  const tryDemo = () =>
    run("Setting up the demo", async () => {
      const bytes = crypto.getRandomValues(new Uint8Array(20));
      const addr = `0x${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
      const res = await fetch("/api/tab", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ demoWallet: addr }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setWallet(addr); setToken(body.ownerToken); setTab(body.tab); setDemo(true);
      keep(K.wallet, addr); keep(K.token, body.ownerToken); keep(K.demo, "1");
    }, "Demo tab open");

  const openTab = () =>
    run("Opening your tab", async () => {
      if (!agent || !wallet || !signer) throw new Error("Unlock your wallet first.");
      const agentKey: Signer = { type: "privateKey", address: agent.sessionAddress, publicKey: agent.sessionPublicKey, signDigest: () => Promise.reject(new Error("The page never signs with the agent key")) };
      const session = await client.grantSession({
        wallet: { address: wallet as `0x${string}` }, signer,
        permissions: { calls: TAB_CALLS, spend: [{ token: CELO_USDC, limit: usdc(daily), period: "day" }] },
        expiry: Math.floor(Date.now() / 1000) + Number(days) * 86_400,
        sessionSigner: agentKey, feeToken: CELO_USDC, feeSpendLimit: usdc("0.5"), chainId: CELO_CHAIN_ID,
      });
      if (session.status !== "granted") throw new Error("The tab wasn't opened. Check the wallet has USDC and a little CELO.");
      if (agent.payMode === "direct") {
        await client.approveSignatureChecker({ wallet: { address: wallet as `0x${string}` }, signer, session, checker: CELO_USDC, chainId: CELO_CHAIN_ID });
      }
      const stored = serializeSession(session);
      // The grant can take a few seconds to be readable onchain
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

  const closeTab = () =>
    run("Closing your tab", async () => {
      if (!demo) {
        if (!wallet || !signer || !tab) throw new Error("Unlock your wallet first.");
        await client.revokeSession({ wallet: { address: wallet as `0x${string}` }, signer, session: tab.session.publicKey, feeToken: CELO_USDC });
      }
      await api("/api/tab", { method: "DELETE" }).catch(() => undefined);
      setTab(null); setToken(null); keep(K.token, null);
      if (demo) { setWallet(null); setDemo(false); keep(K.wallet, null); keep(K.demo, null); }
    }, "Tab closed");

  const withdraw = () =>
    run("Sending", async () => {
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
      setWd({ open: false, to: "", amount: "" });
    }, "Sent");

  const addWatch = () =>
    run("Adding and running the first check", async () => {
      const body = await api("/api/watch", { method: "POST", body: JSON.stringify(watchIn) });
      setTab(body.tab); setWatchIn({ handle: "", contract: "" });
    }, "Watching");

  const runWatchNow = (w: Watch, mode: "decide" | "deep") =>
    run(mode === "decide" ? "Vex is deciding" : "Buying a deep check", async () => {
      const body = await api("/api/watch", { method: "PATCH", body: JSON.stringify({ id: w.id, mode }) });
      setTab(body.tab); setOpen(w.id);
    }, "Done");

  const testCap = () =>
    run("Asking Altana to overspend", async () => {
      setCapTest(await api("/api/tab/cap-test", { method: "POST" }));
    });

  const removeWatch = (w: Watch) =>
    run("Removing", async () => {
      const body = await api(`/api/watch?id=${w.id}`, { method: "DELETE" });
      setTab(body.tab);
    });

  const quickCheck = () =>
    run("Checking", async () => {
      setReport(null);
      const r = await api("/api/check", { method: "POST", body: JSON.stringify(checkIn) });
      setReport(r);
      if (token) api("/api/tab").then(setTab).catch(() => undefined);
    }, "Done");

  // ---------- view ----------

  const hasWallet = !!wallet;
  const locked = hasWallet && !demo && !signer;

  return (
    <>
      <div className="bento">
        {/* Wallet */}
        <div className="card span-4 c-wallet">
          <h3>Wallet {demo && <span className="sample">demo</span>}</h3>
          <p className="lede">{hasWallet ? "Yours alone. Unlocks with your passkey." : "No seed phrase. Face ID or Touch ID."}</p>
          {!hasWallet ? (
            <div className="row">
              <button className="btn btn-primary btn-sm" onClick={createWallet} disabled={!!busy || agent?.mock}>Create wallet</button>
              <button className="btn btn-ghost btn-sm" onClick={unlock} disabled={!!busy || agent?.mock}>I have one</button>
              {agent?.mock && <button className="btn btn-ghost btn-sm" onClick={tryDemo} disabled={!!busy}>Try the demo</button>}
            </div>
          ) : (
            <>
              <div className="mono">{short(wallet!)}</div>
              <div className="big" style={{ marginTop: 6 }}>{demo ? "5.00" : balance || "…"} <span className="muted" style={{ fontSize: 15 }}>USDC</span></div>
              <div className="row" style={{ marginTop: 6 }}><span className="tag celo"><i />Celo</span><span className="tag">Altana wallet</span></div>
              <div className="divider" />
              {locked ? (
                <button className="btn btn-ghost btn-sm" onClick={unlock} disabled={!!busy}>Unlock with passkey</button>
              ) : wd.open ? (
                <>
                  <label className="field"><span>Send to</span><input className="input mono" value={wd.to} onChange={(e) => setWd({ ...wd, to: e.target.value })} placeholder="0x…" /></label>
                  <div className="row">
                    <label className="field"><span>Amount (USDC)</span><input className="input" inputMode="decimal" value={wd.amount} onChange={(e) => setWd({ ...wd, amount: e.target.value })} /></label>
                    <button className="btn btn-primary btn-sm" style={{ alignSelf: "end" }} onClick={withdraw} disabled={!!busy || demo}>Send</button>
                  </div>
                  <p className="note" style={{ marginTop: 8 }}>You sign this with your passkey. Vex can't move money here. {demo && "Off in the demo."}</p>
                  <button className="linkish" onClick={() => setWd({ open: false, to: "", amount: "" })}>Cancel</button>
                </>
              ) : (
                <div className="row">
                  <button className="btn btn-ghost btn-sm" onClick={() => { navigator.clipboard?.writeText(wallet!); setDone("Address copied"); setTimeout(() => setDone(""), 1800); }}>Copy address to fund</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setWd({ ...wd, open: true, amount: balance && balance !== "?" ? balance : "" })}>Withdraw</button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Tab */}
        <div className="card span-4 c-tab">
          <h3>Tab</h3>
          <p className="lede">What Vex may spend on checks. Enforced onchain.</p>
          {live ? (
            <>
              <div className="cap">
                <CapRing spent={spentUnits} cap={capUnits} />
                <div>
                  <div><b>{showUsdc(capUnits)} USDC</b> <span className="muted">a day</span></div>
                  <div className="note">{room ? `${showUsdc(room.remaining)} left today, read from Celo` : "USDC transfers only"}</div>
                  <div className="note">Ends {new Date(tab!.session.expiry * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</div>
                </div>
              </div>
              <div className="divider" />
              <div className="row">
                <button className="btn btn-ghost btn-sm" onClick={testCap} disabled={!!busy}>Test the cap</button>
                <button className="btn btn-ghost btn-sm" onClick={closeTab} disabled={!!busy || locked}>Close tab</button>
              </div>
              {capTest && (
                <div className="bubble" role="status">
                  <div className="from">Cap test {capTest.demo && <span className="sample">demo</span>}</div>
                  Vex asked to move <b>{showUsdc(capTest.attempted)} USDC</b>, 0.01 more than the tab had left.{" "}
                  {capTest.refused ? <b style={{ color: "var(--real)" }}>Refused.</b> : <b style={{ color: "var(--farmed)" }}>It went through.</b>}
                  <div className="muted">{capTest.reason} {txLink(capTest.tx)}</div>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="row">
                <label className="field"><span>Daily cap (USDC)</span><input className="input" inputMode="decimal" value={daily} onChange={(e) => setDaily(e.target.value)} /></label>
                <label className="field"><span>Days</span><input className="input" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} /></label>
              </div>
              <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={openTab} disabled={!!busy || !signer || agent?.mock}>Open tab</button>
              <p className="note" style={{ marginTop: 10 }}>Each check costs {agent?.checkPrice ?? "0.05"} USDC. Close it any time.</p>
            </>
          )}
        </div>

        {/* Telegram */}
        <div className="card span-4 c-alerts">
          <h3>Alerts</h3>
          <p className="lede">A message when a project you watch changes.</p>
          {!tab ? (
            <p className="note">Open a tab first.</p>
          ) : tab.telegram.linked ? (
            <div className="row"><Check /> <span>Telegram linked</span></div>
          ) : tab.telegram.link ? (
            <a className="btn btn-ghost btn-sm" href={tab.telegram.link} target="_blank" rel="noreferrer">Link Telegram</a>
          ) : (
            <p className="note">Telegram alerts aren&apos;t switched on for this site yet. Changes still show in your activity.</p>
          )}
          <div className="bubble" aria-label="Example alert">
            <div className="from">Example alert</div>
            <b style={{ color: "var(--farmed)" }}>@someproject</b>: verdict changed from mixed to looks farmed
            <div className="muted">3 accounts wrote 62% of the posts tagging it. 41% of posts repeat the same text.</div>
            <div className="faint" style={{ marginTop: 4 }}>Paid 0.05 USDC from your tab</div>
          </div>
        </div>

        {/* Watchlist */}
        <div className="card span-8 c-watch">
          <h3>Watchlist</h3>
          <p className="lede">Every day Vex scans each one for under a cent, and only buys a deep check when something moved.</p>
          <div className="row" style={{ marginBottom: 14 }}>
            <label className="field"><span>X handle</span><input className="input" value={watchIn.handle} onChange={(e) => setWatchIn({ ...watchIn, handle: e.target.value })} placeholder="@project" /></label>
            <label className="field"><span>Celo token (optional)</span><input className="input mono" value={watchIn.contract} onChange={(e) => setWatchIn({ ...watchIn, contract: e.target.value })} placeholder="0x…" /></label>
            <button className="btn btn-primary btn-sm" style={{ alignSelf: "end" }} onClick={addWatch} disabled={!!busy || !live || (!watchIn.handle && !watchIn.contract)}>Watch</button>
          </div>
          {!tab?.watches.length ? (
            <div className="empty">{live ? "Add a project you promote or are about to take a deal from." : "Open a tab to start a watchlist."}</div>
          ) : (
            tab.watches.map((w) => (
              <div className="watch" key={w.id}>
                <div className="score" style={{ ["--c" as string]: vColor(w.last?.verdict), ["--p" as string]: w.last?.score ?? 0 }}><b>{w.last ? w.last.score : "–"}</b></div>
                <div style={{ minWidth: 0 }}>
                  <div className="name">{[w.handle && `@${w.handle}`, w.contract && short(w.contract)].filter(Boolean).join(" · ")}</div>
                  <div className="meta">
                    <span className={`verdict ${vClass(w.last?.verdict)}`}>{w.last?.verdict ?? "not checked"}</span>
                    <span>checked {ago(w.lastCheckedAt)}</span>
                    {w.paused && <span style={{ color: "var(--mixed)" }}>{w.paused}</span>}
                    {w.last?.reasons.length ? <button className="linkish" onClick={() => setOpen(open === w.id ? null : w.id)}>{open === w.id ? "hide why" : "why"}</button> : null}
                  </div>
                  {w.lastDecision && <div className="decision">{w.lastDecision}</div>}
                </div>
                <div className="acts">
                  <button className="btn btn-ghost btn-sm" onClick={() => runWatchNow(w, "decide")} disabled={!!busy} title="What the daily run does: a scan, then a deep check only if something moved">Let Vex decide</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => runWatchNow(w, "deep")} disabled={!!busy}>Deep check</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => removeWatch(w)} disabled={!!busy} aria-label="Stop watching">✕</button>
                </div>
                {open === w.id && w.last && <ul className="why reasons">{w.last.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
              </div>
            ))
          )}
        </div>

        {/* Activity */}
        <div className="card span-4 c-activity">
          <h3>Activity</h3>
          <p className="lede">Every check and what it cost.</p>
          {!tab?.log.length ? <div className="empty">Nothing yet.</div> : (
            <ul className="feed">{tab.log.map((l, i) => <Feed key={`${l.at}${i}`} l={l} demo={demo} />)}</ul>
          )}
        </div>

        {/* One-off check */}
        <div className="card span-12 c-quick">
          <h3>Quick check {agent?.mock && <span className="sample">sample data</span>}</h3>
          <p className="lede">One look at a project without adding it to your watchlist.</p>
          <div className="row">
            <label className="field"><span>X handle</span><input className="input" value={checkIn.handle} onChange={(e) => setCheckIn({ ...checkIn, handle: e.target.value })} placeholder="@project" /></label>
            <label className="field"><span>Celo token (optional)</span><input className="input mono" value={checkIn.contract} onChange={(e) => setCheckIn({ ...checkIn, contract: e.target.value })} placeholder="0x…" /></label>
            <button className="btn btn-primary btn-sm" style={{ alignSelf: "end" }} onClick={quickCheck} disabled={!!busy || (!agent?.mock && !live) || (!checkIn.handle && !checkIn.contract)}>Check</button>
          </div>
          {report && <ReportView r={report} />}
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {(busy || done) && (
        <div className="toast" role="status">{busy ? <span className="spinner" /> : <Check />}{busy ? `${busy}…` : done}</div>
      )}
    </>
  );
}

function CapRing({ spent, cap }: { spent: bigint; cap: bigint }) {
  const r = 40, c = 2 * Math.PI * r;
  const p = cap > 0n ? Math.min(1, Number(spent) / Number(cap)) : 0;
  return (
    <div className="ring">
      <svg width="92" height="92" viewBox="0 0 92 92">
        <defs><linearGradient id="cg" x1="0" x2="1"><stop offset="0" stopColor="#ff6a3d" /><stop offset="1" stopColor="#ffb547" /></linearGradient></defs>
        <circle cx="46" cy="46" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="7" />
        <circle cx="46" cy="46" r={r} fill="none" stroke="url(#cg)" strokeWidth="7" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - p)} />
      </svg>
      <div className="val"><div>{showUsdc(spent)}<small>spent today</small></div></div>
    </div>
  );
}

function Feed({ l, demo }: { l: LogEntry; demo: boolean }) {
  return (
    <li>
      <span className="k" aria-hidden><FeedIcon kind={l.kind} auto={l.auto} /></span>
      <div style={{ minWidth: 0 }}>
        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {l.kind === "alert" ? "Alert sent: " : l.kind === "paused" ? "Paused: " : l.kind === "deferred" ? "Deep check waits: " : l.depth === "scan" ? "Scan: " : l.depth === "deep" ? "Deep check: " : ""}{l.subject}
          {l.verdict && l.kind === "check" && <span className={`verdict ${vClass(l.verdict)}`} style={{ marginLeft: 8 }}>{l.score}</span>}
        </div>
        <div className="faint" style={{ fontSize: 12 }}>
          {l.note ?? (l.auto ? "on schedule" : "by you")}
          {l.amount && <> · {showUsdc(l.amount)} USDC{demo ? " (sample)" : ""}</>} {txLink(l.tx)}
        </div>
      </div>
      <span className="when">{ago(l.at)}</span>
    </li>
  );
}

function FeedIcon({ kind, auto }: { kind: LogEntry["kind"]; auto: boolean }) {
  const p = { width: 12, height: 12, viewBox: "0 0 12 12", fill: "none", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (kind === "alert") return <svg {...p} stroke="var(--amber)"><path d="M3 8.5h6L8 7V5a2 2 0 1 0-4 0v2L3 8.5zM5 10h2" /></svg>;
  if (kind === "deferred") return <svg {...p} stroke="var(--mixed)"><path d="M6 3v3l2 1.5" /><circle cx="6" cy="6" r="4" /></svg>;
  if (kind === "paused") return <svg {...p} stroke="var(--mixed)"><path d="M4.5 3v6M7.5 3v6" /></svg>;
  if (kind === "refund") return <svg {...p} stroke="var(--dim)"><path d="M4 3L2 5l2 2M2 5h5a3 3 0 0 1 0 6H5" /></svg>;
  if (auto) return <svg {...p} stroke="var(--amber)"><path d="M9.5 4.5A4 4 0 1 0 10 7M10 2v2.5H7.5" /></svg>;
  return <svg {...p} stroke="var(--real)"><path d="M2.5 6.5l2.2 2L9.5 3.5" /></svg>;
}

function ReportView({ r }: { r: Report }) {
  return (
    <div style={{ marginTop: 20 }}>
      <div className="divider" />
      <div className="report-head">
        <div className="score" style={{ ["--c" as string]: vColor(r.verdict), ["--p" as string]: r.score }}><b>{r.score}</b></div>
        <div>
          <div style={{ fontWeight: 600 }}>{r.subject}</div>
          <span className={`verdict ${vClass(r.verdict)}`}>{r.verdict}</span> {r.mode === "mock" && <span className="sample">sample</span>}
        </div>
      </div>
      <ul className="reasons">{r.reasons.map((x) => <li key={x}>{x}</li>)}</ul>
      <h3 style={{ marginTop: 18 }}>What Vex paid for</h3>
      <ul className="paid">
        {r.charge && <li><span>Check, from your tab</span><span>{showUsdc(r.charge.amount)} USDC {txLink(r.charge.txHash)}</span></li>}
        {r.paidCalls.map((c, i) => <li key={i}><span>{c.service}</span><span>{showUsdc(c.amount)} USDC {txLink(c.txHash)}</span></li>)}
      </ul>
    </div>
  );
}

function Check() {
  return (
    <svg className="check" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3 8.5l3.2 3L13 4.5" stroke="var(--real)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
