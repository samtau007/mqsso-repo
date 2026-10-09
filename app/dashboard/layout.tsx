import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { NAME_DAYS } from "@/lib/names";
import { getPerson } from "@/lib/people";
import { currentPersonId } from "@/lib/site/session";
import { Nav } from "./Nav";
import { Shield } from "./Shield";
import "./dashboard.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your Muslim Quotient", robots: { index: false } };

/** Every dashboard screen: the header with the given name, the menu, and the person's own record. */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const personId = await currentPersonId();
  if (!personId) redirect("/signin");
  const person = await getPerson(personId);
  if (!person) redirect("/signin");
  const days = Math.min(NAME_DAYS, Math.max(0, Math.ceil((person.nameChangesOn.getTime() - Date.now()) / 86_400_000)));

  return (
    <div className="d-page">
      <Shield />
      <header className="d-head">
        <div className="d-head-in">
          <a className="d-brand" href="/dashboard">
            <svg width="30" height="30" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="34" fill="none" stroke="#3a4c6b" strokeWidth="14" /><path d="M50 16 A34 34 0 0 0 50 84" fill="none" stroke="#8a6ca6" strokeWidth="14" /><rect x="44" y="10" width="12" height="12" rx="2.5" fill="#ffffff" transform="rotate(45 50 16)" /></svg>
            Muslim Quotient
          </a>
          <div className="d-who">
            <span className="d-name"><b>{person.givenName}</b> · <span>new name in {days} {days === 1 ? "day" : "days"}</span></span>
            <form action="/signout" method="post"><button className="d-out" type="submit">Sign out</button></form>
          </div>
        </div>
      </header>
      <div className="d-shell">
        <Nav />
        <main className="d-body">{children}</main>
      </div>
    </div>
  );
}
