import type { Metadata } from "next";
import "./globals.css";
import { VersionGuard } from "./version-guard";

export const metadata: Metadata = {
  title: "WAR ARISAN CEPAT KAYA",
  description: "Pemilihan bulan GET arisan secara real-time."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="id" data-skin="clay"><body>{children}<VersionGuard /></body></html>;
}
