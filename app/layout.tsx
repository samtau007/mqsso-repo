import type { Metadata } from "next";
import { Outfit, Amiri } from "next/font/google";
import "./globals.css";

const outfit = Outfit({ subsets: ["latin", "latin-ext"], weight: ["300", "400", "500", "600", "700", "800"], variable: "--font-outfit" });
const amiri = Amiri({ subsets: ["arabic"], weight: ["400"], variable: "--font-amiri" });

export const metadata: Metadata = {
  title: "Muslim Quotient",
  description: "Muslim Quotient helps you grow as a Muslim. One private ID across the Muslim platforms you already use, and your learning, practice and reflection in one private place.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://muslimquotient.com"),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${outfit.variable} ${amiri.variable}`}>
      <body>{children}</body>
    </html>
  );
}
