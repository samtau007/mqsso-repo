"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/goals", label: "My goals" },
  { href: "/dashboard/picture", label: "My picture" },
  { href: "/dashboard/platforms", label: "My platforms" },
  { href: "/dashboard/connect", label: "Connect a platform" },
  { href: "/dashboard/prayer", label: "Prayer settings" },
  { href: "/dashboard/privacy", label: "Privacy" },
];

const INBOX = { href: "/dashboard/inbox", label: "Inbox" };

/** A column on wide screens; a row that scrolls sideways on a phone. */
export function Nav({ inbox, unread }: { inbox: boolean; unread: number }) {
  const items = inbox ? [...ITEMS.slice(0, 1), INBOX, ...ITEMS.slice(1)] : ITEMS;
  const path = usePathname() ?? "";
  const active = (href: string) => (href === "/dashboard" ? path === href : path === href || path.startsWith(`${href}/`));
  return (
    <nav className="d-nav" aria-label="Your Muslim Quotient">
      {items.map((i) => (
        <Link key={i.href} href={i.href} className={active(i.href) ? "on" : undefined} aria-current={active(i.href) ? "page" : undefined}>
          {i.label}{i === INBOX && unread > 0 ? <span className="d-count" aria-label={`${unread} unread`}>{unread}</span> : null}
        </Link>
      ))}
    </nav>
  );
}
