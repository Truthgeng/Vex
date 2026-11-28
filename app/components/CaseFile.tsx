"use client";

import { useEffect, useState } from "react";

/**
 * The hero: one sample project going from fine to farmed, the way Vex sees
 * it. Each step is something Vex really does: the daily scan, the spike, the
 * decision to buy a deep check, the deployer selling, the flagged accounts,
 * the verdict, the alert. Every number here is a sample and says so.
 */
const STEPS = 8;
const PACE = 1250;

export default function CaseFile() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStep(STEPS);
      return;
    }
    let s = 0;
    let t: ReturnType<typeof setTimeout>;
    const tick = () => {
      s = s >= STEPS ? 0 : s + 1;
      setStep(s);
      t = setTimeout(tick, s === STEPS ? 4200 : s === 0 ? 900 : PACE);
    };
    t = setTimeout(tick, 700);
    return () => clearTimeout(t);
  }, []);

  const on = (n: number) => (step >= n ? "on" : "");
  const spent = step >= 3 ? 0.06 : step >= 1 ? 0.01 : 0;
  const sold = step >= 4;
  const farmed = step >= 6;

  return (
    <div className="case-wrap" aria-label="Sample case: Vex noticing a project's insiders selling and its posts being farmed">
      <div className="case">
        <div className="case-top">
          <div className="case-id">
            <div className="avatar">P</div>
            <div>
              <b>@pumpcoin</b>
              <span>Watching since Nov 21 · Celo</span>
            </div>
          </div>
          <div className="meter">
            <small>Today&apos;s tab</small>
            <div className="bar"><i style={{ width: `${(spent / 1) * 100}%` }} /></div>
            <div className="num">{spent.toFixed(2)} / 1.00 USDC</div>
          </div>
        </div>

        <ul className="case-log">
          <li className={`ok ${on(1)}`}><span>Daily scan</span><span className="cost">0.01</span></li>
          <li className={`hot ${on(2)}`}><span>Posts tagging it jumped <em>20 → 48</em></span><span /></li>
          <li className={`ok ${on(3)}`}><span>Vex bought a deep check</span><span className="cost">0.05</span></li>
          <li className={`hot ${on(4)}`}><span>Deployer cut its holding <em>9.5% → 1.2%</em></span><span /></li>
          <li className={`hot ${on(5)}`}><span>2 posters pushed <em>4 other projects</em> this month</span><span /></li>
        </ul>

        <div className="holders">
          <small><span>Holders</span><span>deployer <b style={{ color: sold ? "var(--flare)" : undefined }}>{sold ? "1.2%" : "9.5%"}</b></span></small>
          <div className="hbar">
            <i style={{ flexBasis: sold ? "1.2%" : "9.5%", background: "var(--flare)" }} />
            <i style={{ flexBasis: "31%", background: "rgba(237,234,227,0.55)" }} />
            <i style={{ flexBasis: "22%", background: "rgba(237,234,227,0.22)" }} />
            <i style={{ flexBasis: sold ? "45.8%" : "37.5%", background: "rgba(237,234,227,0.07)" }} />
          </div>
        </div>

        <div className="verdict-row">
          <small>Verdict</small>
          <div className="stamp" style={{ color: farmed ? "var(--farmed)" : "var(--real)" }}>
            {farmed ? "Looks farmed" : "Looks real"}
            <span>{farmed ? "38" : "74"}/100</span>
          </div>
        </div>
      </div>

      <div className={`case-alert ${on(7)}`} role="status">
        <div className="tg">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="#fff" aria-hidden><path d="M21.5 4.3 2.9 11.5c-1.3.5-1.3 1.2-.2 1.6l4.8 1.5 1.8 5.6c.2.6.4.8.9.8.4 0 .6-.2.9-.5l2.3-2.2 4.7 3.5c.9.5 1.5.2 1.7-.8l3.1-14.6c.3-1.3-.5-1.9-1.4-1.6zM8.9 14.2l9.3-5.9c.4-.3.8-.1.5.2l-7.7 7-.3 3.2-1.8-4.5z" /></svg>
        </div>
        <div>
          <b>Vex · @pumpcoin now looks farmed</b>
          <p>The deployer cut its holding from 9.5% to 1.2% of supply. Paid 0.06 USDC from your tab.</p>
        </div>
      </div>
      <p className="case-caption">Sample case. Live checks read real X posts and Celo or Ethereum holders.</p>
    </div>
  );
}
