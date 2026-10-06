import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "MimiTales",
  description: "A safe, multilingual storytelling companion for children.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-amber-50 text-slate-800 antialiased">{children}</body>
    </html>
  );
}