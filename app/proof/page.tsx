import { Nav, Footer } from "../components/Chrome";
import { proofs, allWallets, hasStore, capTests } from "@/lib/server/store";
import { isMock } from "@/lib/server/scout";
import { showUsdc } from "@/lib/config";

export const dynamic = "force-dynamic";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";

/**
 * Public record: every check Vex charged from a user's tab, with its Celo
 * transaction, and every cap test. Demo tabs never appear here.
 */
export default async function Proof() {
  const mock = isMock();
  const [list, wallets, capsAll] = await Promise.all([proofs(), allWallets(), capTests()]);
  const caps = capsAll.filter((c) => !c.demo);
  const payers = new Set(list.map((p) => p.wallet)).size;
  const auto = list.filter((p) => p.auto).length;
  const total = list.reduce((a, p) => a + BigInt(p.amount), 0n);
  const scans = list.filter((p) => p.subject.endsWith("(scan)")).length;

  return (
    <>
      <div className="grain" aria-hidden />
      <Nav mock={mock} />
      <main className="proof-page">
        <div className="wrap">
          <p className="kicker">On the record</p>
          <h1>Proof</h1>
          <p className="lead dim" style={{ maxWidth: 620, fontSize: 17 }}>
            Every check Vex charged to a user&apos;s tab, with its Celo transaction, and every attempt to spend past a cap. Demo activity
            never appears here.
          </p>

          <div className="proofs">
            <div><b>{scans} · {list.length - scans}</b><span>scans · deep checks charged</span></div>
            <div><b>{auto}</b><span>run on schedule, no one clicking</span></div>
            <div><b>{payers}</b><span>paying wallets, {wallets.length} tabs opened</span></div>
            <div><b>{showUsdc(total)}</b><span>USDC charged in total</span></div>
          </div>

          <section className="sec" style={{ marginTop: 40 }}>
            <div className="sec-h"><h3>Charges</h3><span>newest first</span></div>
            {!hasStore() && <p className="error">No database is connected, so this list resets on every deploy.</p>}
            {list.length === 0 ? (
              <div className="empty"><span className="serif">Nothing charged yet.</span>The first live checks will appear here with their transactions.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="tbl">
                  <thead><tr><th>When</th><th>Wallet</th><th>Project</th><th>Paid</th><th className="hide-sm">How</th><th>Transaction</th></tr></thead>
                  <tbody>
                    {list.map((p, i) => (
                      <tr key={i}>
                        <td className="dim">{when(p.at)}</td>
                        <td><a className="tx" href={`https://celoscan.io/address/${p.wallet}`} target="_blank" rel="noreferrer">{short(p.wallet)}</a></td>
                        <td>{p.subject}</td>
                        <td>{showUsdc(p.amount)} USDC</td>
                        <td className="hide-sm dim">{p.auto ? <span className="pill auto">on schedule</span> : <span className="pill">by the user</span>}</td>
                        <td>{p.tx ? <a className="tx" href={`https://celoscan.io/tx/${p.tx}`} target="_blank" rel="noreferrer">{p.tx.slice(0, 12)}…</a> : <span className="faint">none</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="sec">
            <div className="sec-h">
              <h3>Cap tests</h3>
              <span>Vex asks to move 0.01 USDC more than a tab has left, with its usual key and call</span>
            </div>
            {caps.length === 0 ? (
              <div className="empty"><span className="serif">No live cap tests yet.</span>Each one is listed here, refused or not.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="tbl">
                  <thead><tr><th>When</th><th>Wallet</th><th>Cap</th><th>Spent before</th><th>Asked for</th><th>Result</th><th>Transaction</th></tr></thead>
                  <tbody>
                    {caps.map((c, i) => (
                      <tr key={i}>
                        <td className="dim">{when(c.at)}</td>
                        <td><a className="tx" href={`https://celoscan.io/address/${c.wallet}`} target="_blank" rel="noreferrer">{short(c.wallet)}</a></td>
                        <td>{showUsdc(c.limit)}</td>
                        <td>{showUsdc(c.spentBefore)}</td>
                        <td>{showUsdc(c.attempted)}</td>
                        <td style={{ whiteSpace: "normal" }}>
                          <span className={`vtag ${c.refused ? "v-real" : "v-farmed"}`}>{c.refused ? "Refused" : "Went through, refunded"}</span>
                          <div className="faint" style={{ fontSize: 12, marginTop: 3 }}>{c.reason}</div>
                        </td>
                        <td>{c.tx ? <a className="tx" href={`https://celoscan.io/tx/${c.tx}`} target="_blank" rel="noreferrer">{c.tx.slice(0, 12)}…</a> : <span className="faint">none sent</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="note" style={{ marginTop: 14 }}>
              &quot;None sent&quot; means Altana refused the call before any transaction reached the chain. The cap and the amount spent come
              from the account itself on Celo.
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
