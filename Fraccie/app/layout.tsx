import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Fraccie Team Game",
  description: "Location based one-night team game"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
