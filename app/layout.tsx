import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vex",
  description: "Check if a crypto project's traction is real. Pay from a capped Altana tab on Celo.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
