import type { Metadata } from "next";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vex · know when the buzz is bought",
  description:
    "Vex watches the crypto projects you promote and tells you on Telegram when the hype turns into bots, paid posts or insiders selling. It pays for its own checks from a capped Altana tab on Celo, never your keys.",
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
