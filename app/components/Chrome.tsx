/** The Vex mark: an eye-shaped lens with a cut, the watcher. */
export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <defs>
        <linearGradient id="vx" x1="0" y1="0" x2="32" y2="32">
          <stop offset="0" stopColor="#ff6a3d" />
          <stop offset="1" stopColor="#ffb547" />
        </linearGradient>
      </defs>
      <path d="M2 16C6 8.5 10.8 5.5 16 5.5S26 8.5 30 16c-4 7.5-8.8 10.5-14 10.5S6 23.5 2 16z" stroke="url(#vx)" strokeWidth="2.4" />
      <circle cx="16" cy="16" r="5" fill="url(#vx)" />
      <path d="M21 9L11 23" stroke="#07080a" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function Nav({ mock = false }: { mock?: boolean }) {
  return (
    <nav className="nav">
      <div className="wrap">
        <a className="logo" href="/"><Logo /> Vex</a>
        <div className="nav-links">
          <a href="/#app">Watch desk</a>
          <a href="/#how">How it works</a>
          <a href="/proof">Proof</a>
        </div>
        <div className="nav-right">
          <span className={`pill ${mock ? "" : "live"}`}><i />{mock ? "Demo mode" : "Live on Celo"}</span>
          <a className="btn btn-primary btn-sm" href="/#app">Open Vex</a>
        </div>
      </div>
    </nav>
  );
}

export function Footer() {
  return (
    <footer>
      <div className="wrap">
        <span>Vex · built on Celo with Altana agent wallets</span>
        <span>
          <a href="https://github.com/Truthgeng/Vex" target="_blank" rel="noreferrer">GitHub</a> ·{" "}
          <a href="/agent.json">Agent card</a> · <a href="/proof">Proof</a>
        </span>
      </div>
    </footer>
  );
}
