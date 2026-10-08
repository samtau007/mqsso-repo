import type { Metadata } from "next";
import { currentDeveloper } from "@/lib/portal";
import { signOut } from "./actions";
import "./portal.css";

export const metadata: Metadata = {
  title: "Muslim Quotient for developers",
  description: "Register a platform to offer Sign in with Muslim Quotient.",
  robots: { index: false },
};

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const dev = await currentDeveloper();
  return (
    <div className="p-page">
      <header className="p-wrap p-head">
        <a className="p-brand" href="/">
          <svg width="28" height="28" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="34" fill="none" stroke="#3a4c6b" strokeWidth="14" /><path d="M50 16 A34 34 0 0 0 50 84" fill="none" stroke="#8a6ca6" strokeWidth="14" /><rect x="44" y="10" width="12" height="12" rx="2.5" fill="#ffffff" transform="rotate(45 50 16)" /></svg>
          Muslim Quotient <small>for developers</small>
        </a>
        <nav className="p-nav" aria-label="Portal">
          <a href="/guide">Developer guide</a>
          {dev && <a href="/">Your platforms</a>}
          {dev && <form action={signOut}><button type="submit">Sign out</button></form>}
        </nav>
      </header>
      <main className="p-wrap p-main">{children}</main>
      <footer className="p-wrap p-foot">Platforms are approved by Muslim Quotient before they go live.</footer>
    </div>
  );
}
