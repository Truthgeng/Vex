import CaseFile from "./components/CaseFile";
import { Nav, Footer } from "./components/Chrome";
import { checkPrice, isMock, scanPrice } from "@/lib/server/scout";
import { allWallets, capTests, proofs } from "@/lib/server/store";
import { showUsdc } from "@/lib/config";

export const dynamic = "force-dynamic";

const Arrow = () => (
  <div className="arrow" aria-hidden>
    <svg width="28" height="12" viewBox="0 0 28 12" fill="none"><path d="M0 6h26M21 1l5 5-5 5" stroke="currentColor" strokeWidth="1.3" /></svg>
  </div>
);

const Tg = () => (
  <div className="tg">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="#fff" aria-hidden><path d="M21.5 4.3 2.9 11.5c-1.3.5-1.3 1.2-.2 1.6l4.8 1.5 1.8 5.6c.2.6.4.8.9.8.4 0 .6-.2.9-.5l2.3-2.2 4.7 3.5c.9.5 1.5.2 1.7-.8l3.1-14.6c.3-1.3-.5-1.9-1.4-1.6z" /></svg>
  </div>
);

export default async function Home() {
  const mock = isMock();
  // Live numbers from the record. Zero is shown as zero
  const [list, caps, tabs] = await Promise.all([proofs().catch(() => []), capTests().catch(() => []), allWallets().catch(() => [])]);
  const scheduled = list.filter((p) => p.auto).length;
  const refused = caps.filter((c) => !c.demo && c.refused).length;

  return (
    <>
      <div className="grain" aria-hidden />
      <Nav mock={mock} />

      <header className="hero">
        <div className="wrap hero-grid">
          <div>
            <h1>Know when the buzz is <em>bought.</em></h1>
            <p className="sub">
              Vex watches the projects you promote. When the hype turns into bots, paid posts or insiders selling, you hear it on Telegram
              first. It pays for its own checks from a capped tab on your wallet, never your keys.
            </p>
            <div className="ctas">
              <a className="btn btn-paper" href="/app">Open the desk</a>
              <a className="btn btn-line" href="/app?demo=1">Try the demo</a>
            </div>
            <div className="facts">
              <div><b>{showUsdc(scanPrice())} USDC</b><span>a daily scan</span></div>
              <div><b>{showUsdc(checkPrice())} USDC</b><span>a deep check, when needed</span></div>
              <div><b>Capped</b><span>by Altana, onchain</span></div>
            </div>
          </div>
          <CaseFile />
        </div>
      </header>

      <section className="section" id="catches">
        <div className="wrap">
          <p className="kicker">What it catches</p>
          <h2>Three ways hype gets faked. Vex checks all of them, every day.</h2>
          <div className="findings">
            <div className="finding">
              <h3>Insiders heading for the exit</h3>
              <p>Vex tracks the deployer and the ten biggest wallets, with pools and exchanges left out. When one of them cuts its holding, you hear about it before the chart shows it.</p>
              <div className="excerpt">
                <div className="line"><span>Deployer</span><span className="warn">9.5% → 1.2%</span></div>
                <div className="line"><span>Top wallet 0x3f9a…99b8</span><span>6.1% → 6.0%</span></div>
                <div className="line"><span>Pools and exchanges</span><span>left out</span></div>
              </div>
            </div>
            <div className="finding">
              <h3>Accounts paid to post</h3>
              <p>It reads who is posting: how old the accounts are, how many people follow them, and which of them pushed three other projects this month.</p>
              <div className="excerpt">
                <div className="line"><span>@sample_caller</span><span className="warn">pushed 4 projects</span></div>
                <div className="line"><span>@sample_newbie</span><span>12 days old</span></div>
                <div className="line"><span>@sample_alpha</span><span>nothing odd</span></div>
              </div>
            </div>
            <div className="finding">
              <h3>Engagement that doesn&apos;t add up</h3>
              <p>Copy-paste posts, a few accounts doing most of the talking, big followings with no likes, and tokens passed back and forth between the same wallets.</p>
              <div className="excerpt">
                <div className="line"><span>Same text repeated</span><span className="warn">44% of posts</span></div>
                <div className="line"><span>Top 3 accounts</span><span>61% of posts</span></div>
                <div className="line"><span>Back-and-forth transfers</span><span>32%</span></div>
              </div>
            </div>
          </div>
          <p className="note" style={{ marginTop: 18 }}>Figures above are samples.</p>
        </div>
      </section>

      <section className="section" id="how">
        <div className="wrap">
          <p className="kicker">How it pays</p>
          <h2>Vex spends on its own. The chain keeps it honest.</h2>
          <p className="lead">
            You open a tab on your own Altana wallet. Vex can move USDC only, up to your daily cap, until the date you set. It decides what
            each project deserves: a cheap scan most days, a deep check when something moves.
          </p>
          <div className="flow">
            <div className="node">
              <small>Passkey, no seed phrase</small>
              <b>Your wallet</b>
              <ul>
                <li><span>Money</span><span>stays yours</span></li>
                <li><span>Withdraw</span><span>any time</span></li>
                <li><span>Keys</span><span>never shared</span></li>
              </ul>
            </div>
            <Arrow />
            <div className="node key">
              <small>Enforced by Altana on Celo</small>
              <b>The tab</b>
              <ul>
                <li><span>Can move</span><span>USDC only</span></li>
                <li><span>Daily cap</span><span>you pick, e.g. 1 USDC</span></li>
                <li><span>Ends</span><span>you pick, e.g. 7 days</span></li>
                <li><span>Close</span><span>any time</span></li>
              </ul>
            </div>
            <Arrow />
            <div className="node">
              <small>Buys only what it needs</small>
              <b>Vex</b>
              <ul>
                <li><span>Daily scan</span><span>{showUsdc(scanPrice())} USDC</span></li>
                <li><span>Deep check</span><span>{showUsdc(checkPrice())} USDC</span></li>
                <li><span>Holder read</span><span>free</span></li>
              </ul>
            </div>
          </div>
          <div className="refusal">
            <span className="x" aria-hidden>
              <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.6"><path d="M1 1l8 8M9 1L1 9" /></svg>
            </span>
            <span>
              The cap test: Vex asks to move <b>0.01 USDC more</b> than a tab has left today, and the account refuses. Every test is on the{" "}
              <a href="/proof">proof page</a>.
            </span>
          </div>
        </div>
      </section>

      <section className="section" id="alert">
        <div className="wrap split">
          <div>
            <p className="kicker">The alert</p>
            <h2>Quiet on normal days. Specific when it matters.</h2>
            <ul className="points">
              <li><span>When</span><span>A verdict flips, a score moves 15 points, or an insider sells.</span></li>
              <li><span>What&apos;s in it</span><span>What changed, why, who is pushing it, what Vex bought to confirm it and what that cost.</span></li>
              <li><span>Receipts</span><span>A Celo transaction for every charge.</span></li>
              <li><span>Where</span><span>Telegram, and the activity log on your desk.</span></li>
            </ul>
          </div>
          <div className="phone" aria-label="Sample Telegram alert from Vex">
            <div className="phone-head">
              <Tg />
              <div><b>Vex</b><span>bot · sample alert</span></div>
            </div>
            <div className="msg">
              🚩 <b>@pumpcoin</b>: verdict changed from looks real to looks farmed
              <br />Now looks farmed (38/100), was looks real (74/100)
              <h5>Insiders</h5>
              <ul><li>The deployer cut its holding from 9.5% to 1.2% of supply.</li></ul>
              <h5>Who&apos;s pushing it</h5>
              <ul>
                <li>@sample_caller: pushed 4 other watched projects this month</li>
                <li>@sample_newbie: account is 12 days old, under 100 followers</li>
              </ul>
              <h5>What made Vex look closer</h5>
              Today&apos;s scan: posts tagging it jumped from 20 to 48
              <h5>Cost</h5>
              0.06 USDC from your tab · <span style={{ color: "#6ab3f3" }}>celoscan.io/tx/…</span>
              <div className="time">08:02</div>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <p className="kicker">On the record</p>
          <h2>Every charge is a transaction anyone can check.</h2>
          <div className="proofs">
            <div><b>{list.length}</b><span>checks charged to tabs</span></div>
            <div><b>{scheduled}</b><span>run on schedule, no one clicking</span></div>
            <div><b>{refused}</b><span>overspend attempts refused</span></div>
            <div><b>{tabs.length}</b><span>tabs opened</span></div>
          </div>
          <p style={{ marginTop: 24 }}><a className="link" href="/proof">Open the proof page</a></p>
        </div>
      </section>

      <section className="closing">
        <div className="wrap">
          <h2 className="serif" style={{ font: "400 clamp(44px, 5.6vw, 80px)/0.95 var(--serif)", letterSpacing: "-0.03em", maxWidth: 900 }}>
            Put your name on projects that deserve it.
          </h2>
          <div className="ctas">
            <a className="btn btn-paper" href="/app">Open the desk</a>
            <a className="btn btn-line" href="/app?demo=1">Try the demo</a>
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}
