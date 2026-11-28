import HeroCanvas from "./components/HeroCanvas";
import VexApp from "./components/VexApp";
import { Logo, Nav, Footer } from "./components/Chrome";
import { checkPrice, isMock, scanPrice } from "@/lib/server/scout";
import { showUsdc } from "@/lib/config";

export const dynamic = "force-dynamic";

export default function Home() {
  const mock = isMock();
  return (
    <>
      <div className="ambient" aria-hidden />
      <Nav mock={mock} />

      <header className="hero">
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <h1>
              Know when the buzz is bought.
            </h1>
            <p className="sub">
              Vex watches the projects you promote and tells you on Telegram when their traction starts to look farmed. It pays for
              its own checks from a capped tab, never from your keys.
            </p>
            <div className="hero-ctas">
              <a className="btn btn-primary" href="#app">Start watching</a>
              <a className="btn btn-ghost" href="/proof">See the onchain proof</a>
            </div>
            <div className="facts">
              <div><b>{showUsdc(scanPrice())} USDC</b>a daily scan</div>
              <div><b>{showUsdc(checkPrice())} USDC</b>a deep check, only when needed</div>
              <div><b>Capped</b>by Altana, onchain</div>
            </div>
          </div>
          <div className="hero-stage">
            <HeroCanvas />
            <div className="hero-legend">
              <span style={{ ["--c" as string]: "var(--real)" }}>real activity</span>
              <span style={{ ["--c" as string]: "var(--farmed)" }}>farmed</span>
              <span style={{ ["--c" as string]: "var(--amber)" }}>check paid from your tab</span>
            </div>
          </div>
        </div>
      </header>

      <section className="section" id="app">
        <div className="wrap">
          <div className="section-head">
            <h2>Your watch desk</h2>
            <p>Make a wallet, open a tab with a daily limit, add the projects you care about. Vex does the rest.</p>
          </div>
          <VexApp />
        </div>
      </section>

      <section className="section" id="how">
        <div className="wrap">
          <div className="section-head">
            <h2>A tab, not your keys</h2>
            <p>The agent never holds your money. You give it narrow, temporary permission that the chain itself enforces.</p>
          </div>
          <div className="steps">
            <div className="card step">
              <div className="glyph"><Logo size={18} /></div>
              <h3>You set the limits</h3>
              <p>Your tab lets Vex move USDC only, up to a daily amount you pick, until a date you pick. Altana writes those limits onchain on Celo.</p>
            </div>
            <div className="card step">
              <div className="glyph">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#ffb547" strokeWidth="1.8" strokeLinecap="round"><path d="M14.5 6.5A6 6 0 1 0 15 10M15 3v3.5h-3.5" /></svg>
              </div>
              <h3>Vex decides what to spend</h3>
              <p>A cheap scan every day. When the posts, accounts or wallets around a project shift, Vex buys a deep check on its own, if your cap has room.</p>
            </div>
            <div className="card step">
              <div className="glyph">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#ffb547" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 12.5h9L12 10.5v-3a3 3 0 1 0-6 0v3l-1.5 2zM7.5 15h3" /></svg>
              </div>
              <h3>You hear when it changes</h3>
              <p>A Telegram message when a verdict flips or a score drops, with the reasons. If Vex tries to spend past your cap, the chain says no.</p>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}
