/** The Vex mark: a lens with a single flare point, the thing it noticed. */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9.25" stroke="#edeae3" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="4.25" stroke="#edeae3" strokeWidth="1.5" opacity="0.45" />
      <circle cx="17.2" cy="7.2" r="2.4" fill="#ff5a36" />
    </svg>
  );
}

export function Nav({ mock = false, app = false }: { mock?: boolean; app?: boolean }) {
  return (
    <nav className="nav">
      <div className="wrap">
        <a className="mark" href="/" aria-label="Vex home"><Logo /> <b>Vex</b></a>
        <div className="nav-links">
          {app ? (
            <>
              <a href="/app" className="on">Desk</a>
              <a href="/proof">Proof</a>
              <a href="/#how">How it works</a>
            </>
          ) : (
            <>
              <a href="#catches">What it catches</a>
              <a href="#how">How it pays</a>
              <a href="#alert">The alert</a>
              <a href="/proof">Proof</a>
            </>
          )}
        </div>
        <div className="nav-end">
          <span className={`status ${mock ? "demo" : ""}`}><i />{mock ? "Demo mode" : "Live on Celo"}</span>
          {!app && <a className="btn btn-paper btn-sm" href="/app">Open the desk</a>}
        </div>
      </div>
    </nav>
  );
}

export function Footer() {
  return (
    <footer>
      <div className="wrap">
        <span>Vex. Built on Celo with Altana agent wallets.</span>
        <span>
          <a href="https://github.com/Truthgeng/Vex" target="_blank" rel="noreferrer">GitHub</a>
          {"  ·  "}
          <a href="/agent.json">Agent card</a>
          {"  ·  "}
          <a href="/proof">Proof</a>
        </span>
      </div>
    </footer>
  );
}
