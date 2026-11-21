import { Nav, Footer } from "../components/Chrome";
import { proofs, allWallets, hasStore } from "@/lib/server/store";
import { isMock } from "@/lib/server/scout";
import { showUsdc } from "@/lib/config";

export const dynamic = "force-dynamic";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/**
 * Public record: every check Vex charged from a user's tab, with its Celo
 * transaction, so anyone (judges included) can verify the activity.
 */
export default async function Proof() {
  const mock = isMock();
  const list = await proofs();
  const wallets = new Set(list.map((p) => p.wallet)).size;
  const auto = list.filter((p) => p.auto).length;
  const total = list.reduce((a, p) => a + BigInt(p.amount), 0n);
  const tabs = (await allWallets()).length;

  return (
    <>
      <div className="ambient" aria-hidden />
      <Nav mock={mock} />
      <main className="section" style={{ paddingTop: 130 }}>
        <div className="wrap">
          <div className="section-head">
            <h2>Onchain proof</h2>
            <p>Every check Vex charged from a user&apos;s tab, with the Celo transaction. Each one went through Altana&apos;s onchain cap.</p>
          </div>
          <div className="bento" style={{ marginBottom: 14 }}>
            <div className="card span-4"><div className="note">Checks charged</div><div className="big">{list.length}</div></div>
            <div className="card span-4"><div className="note">Run on schedule, with no one clicking</div><div className="big">{auto}</div></div>
            <div className="card span-4"><div className="note">Paying wallets · open tabs</div><div className="big">{wallets} · {tabs}</div></div>
          </div>
          <div className="card">
            {mock && <p className="note"><span className="sample">demo mode</span> Demo checks are not charged and don&apos;t appear here.</p>}
            {!hasStore() && !mock && <p className="error">No database is connected, so this list resets on every deploy.</p>}
            {list.length === 0 ? (
              <div className="empty">No charged checks yet.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="table">
                  <thead><tr><th>When</th><th>Wallet</th><th>Project</th><th>Paid</th><th className="hide-sm">How</th><th>Tx</th></tr></thead>
                  <tbody>
                    {list.map((p, i) => (
                      <tr key={i}>
                        <td className="muted">{new Date(p.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                        <td className="mono"><a href={`https://celoscan.io/address/${p.wallet}`} target="_blank" rel="noreferrer">{short(p.wallet)}</a></td>
                        <td>{p.subject}</td>
                        <td>{showUsdc(p.amount)} USDC</td>
                        <td className="hide-sm muted">{p.auto ? "on schedule" : "by the user"}</td>
                        <td>{p.tx ? <a className="tx" href={`https://celoscan.io/tx/${p.tx}`} target="_blank" rel="noreferrer">{p.tx.slice(0, 10)}…</a> : "–"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="note" style={{ marginTop: 16 }}>Total charged: {showUsdc(total)} USDC</p>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
