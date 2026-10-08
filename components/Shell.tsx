import Link from "next/link";
import Logo from "./Logo";

const MOHASABA = process.env.NEXT_PUBLIC_MOHASABA_URL || "https://mohasaba.io";

/** Page frame shared by every screen: grain, nav, footer. */
export default function Shell({ children, marquee = false }: { children: React.ReactNode; marquee?: boolean }) {
  return (
    <>
      <div className="sky" aria-hidden="true"><div className="grain" /></div>
      <div className="page">
        <div className="wrap">
          <nav className="nav" aria-label="Main">
            <Link className="logo" href="/">
              <Logo />
              <span className="tag">Muslim Quotient</span>
            </Link>
            <Link className="btn btn-glass" href="/signup">Log in</Link>
          </nav>
        </div>

        {children}

        {marquee && (
          <div className="marquee" aria-hidden="true">
            <div className="track">
              {[0, 1].map((k) => (
                <span key={k} style={{ display: "contents" }}>
                  <span>الشهادة</span><span>الصلاة</span><span>الزكاة</span><span>الصوم</span><span>الحج</span><span>محاسبة</span>
                </span>
              ))}
            </div>
          </div>
        )}

        <footer>
          <div className="wrap foot">
            <span>muslimquotient.com is part of <a href={MOHASABA} target="_blank" rel="noopener">Mohasaba</a></span>
            <span>© {new Date().getFullYear()} Mohasaba</span>
          </div>
        </footer>
      </div>
    </>
  );
}
