import Link from "next/link";

/** Page frame for the starter sign-up screen: nav and footer. Replaced in M2. */
export default function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="page">
      <div className="wrap">
        <nav className="nav" aria-label="Main">
          <Link className="logo" href="/">
            <svg width="32" height="32" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="34" fill="none" stroke="#3a4c6b" strokeWidth="14" /><path d="M50 16 A34 34 0 0 0 50 84" fill="none" stroke="#8a6ca6" strokeWidth="14" /><rect x="44" y="10" width="12" height="12" rx="2.5" fill="#ffffff" transform="rotate(45 50 16)" /></svg>
            <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.03em" }}>Muslim Quotient</span>
          </Link>
        </nav>
      </div>

      {children}

      <footer>
        <div className="wrap foot">
          <span>© {new Date().getFullYear()} Muslim Quotient</span>
        </div>
      </footer>
    </div>
  );
}
