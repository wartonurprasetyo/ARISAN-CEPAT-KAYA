import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WAR ARISAN CEPAT KAYA",
  description: "Pemilihan bulan GET arisan secara real-time."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="id"><body>{children}</body></html>;
}
