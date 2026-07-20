import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vila Protocol — Private Payments on Stellar",
  description:
    "Shielded stablecoin payments on Stellar using Soroban ZK proofs, fixed-denomination privacy pools, and optional reveal keys for selective disclosure.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        {children}
      </body>
    </html>
  );
}
