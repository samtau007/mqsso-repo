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

/** A column on wide screens; a row that scrolls sideways on a phone. */
export function Nav() {
  const path = usePathname() ?? "";
  const active = (href: string) => (href === "/dashboard" ? path === href : path === href || path.startsWith(`${href}/`));
  return (
    <nav className="d-nav" aria-label="Your Muslim Quotient">
      {ITEMS.map((i) => (
        <Link key={i.href} href={i.href} className={active(i.href) ? "on" : undefined} aria-current={active(i.href) ? "page" : undefined}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
