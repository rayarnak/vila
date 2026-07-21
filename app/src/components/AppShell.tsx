"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Wallet,
  Send,
  Download,
  Settings,
  Key,
  Activity,
  FileText,
  Lock,
  MoreHorizontal,
  X,
} from "lucide-react";
import { lockWallet, isUnlocked } from "@/lib/noteStore";
import ConnectWallet from "@/components/ConnectWallet";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  section?: "main" | "network" | "advanced";
}

const NAV_ITEMS: NavItem[] = [
  { label: "Wallet", href: "/wallet", icon: Wallet, section: "main" },
  { label: "Send", href: "/wallet/send", icon: Send, section: "main" },
  { label: "Receive", href: "/wallet/receive", icon: Download, section: "main" },
  { label: "Notes", href: "/wallet/notes", icon: FileText, section: "main" },
  { label: "Reveal Keys", href: "/compliance", icon: Key, section: "network" },
  { label: "Explorer", href: "/explorer", icon: Activity, section: "network" },
  { label: "Settings", href: "/wallet/settings", icon: Settings, section: "advanced" },
];

const MOBILE_TABS: NavItem[] = [
  { label: "Wallet", href: "/wallet", icon: Wallet },
  { label: "Send", href: "/wallet/send", icon: Send },
  { label: "Receive", href: "/wallet/receive", icon: Download },
  { label: "Notes", href: "/wallet/notes", icon: FileText },
];

const MORE_ITEMS: NavItem[] = [
  { label: "Reveal Keys", href: "/compliance", icon: Key },
  { label: "Explorer", href: "/explorer", icon: Activity },
  { label: "Settings", href: "/wallet/settings", icon: Settings },
];

const isTestnet = process.env.NEXT_PUBLIC_STELLAR_NETWORK === "testnet";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);

  const handleLock = () => {
    lockWallet();
    router.push("/wallet");
  };

  const isActive = (href: string) => {
    if (href === "/wallet") return pathname === "/wallet";
    return pathname.startsWith(href);
  };

  const isMobileActive = (href: string) => {
    if (href === "/wallet") return pathname === "/wallet";
    return pathname.startsWith(href);
  };

  const isMoreActive = MORE_ITEMS.some((item) => pathname.startsWith(item.href));

  return (
    <div className="min-h-screen bg-background flex">
      {/* ── Desktop Sidebar ───────────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-60 border-r border-[#1e2329] bg-[#131722]">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 px-6 h-16 border-b border-[#1e2329]">
          <div className="h-8 w-8 rounded-lg bg-[#f7a600] flex items-center justify-center shadow-sm">
            <span className="text-[#0b0e11] font-black text-base font-mono tracking-tighter">V</span>
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold tracking-tight text-[#eaecef]">Vila Pro</span>
            <span className="text-[10px] font-mono text-[#848e9c] uppercase tracking-widest">Shielded Desk</span>
          </div>
        </Link>

        <nav className="flex-1 py-4 px-3 space-y-1">
          {NAV_ITEMS.filter((i) => i.section === "main").map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href + item.label}
                href={item.href}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  active
                    ? "bg-[#f7a600] text-[#0b0e11] font-bold shadow-sm"
                    : "text-[#848e9c] hover:text-[#eaecef] hover:bg-[#181c25]"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}

          <div className="pt-4 pb-1.5 px-3.5">
            <span className="text-[10px] font-mono font-bold text-[#848e9c]/70 uppercase tracking-wider">
              Network & Audit
            </span>
          </div>

          {NAV_ITEMS.filter((i) => i.section === "network").map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href + item.label}
                href={item.href}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  active
                    ? "bg-[#f7a600] text-[#0b0e11] font-bold shadow-sm"
                    : "text-[#848e9c] hover:text-[#eaecef] hover:bg-[#181c25]"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}

          <div className="pt-4 pb-1.5 px-3.5">
            <span className="text-[10px] font-mono font-bold text-[#848e9c]/70 uppercase tracking-wider">
              Preferences
            </span>
          </div>

          {NAV_ITEMS.filter((i) => i.section === "advanced").map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href + item.label}
                href={item.href}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  active
                    ? "bg-[#f7a600] text-[#0b0e11] font-bold shadow-sm"
                    : "text-[#848e9c] hover:text-[#eaecef] hover:bg-[#181c25]"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* ── Main Content ──────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Top bar (mobile + desktop) */}
        <header className="h-16 border-b border-[#1e2329] flex items-center justify-between px-4 lg:px-6 bg-[#131722]">
          <Link href="/" className="lg:hidden flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-[#f7a600] flex items-center justify-center">
              <span className="text-[#0b0e11] font-black text-sm font-mono">V</span>
            </div>
            <span className="text-sm font-bold text-[#eaecef]">Vila Pro</span>
          </Link>
          <div className="hidden lg:flex items-center gap-3">
            <span className="text-xs font-mono font-bold text-[#eaecef] tracking-wide">
              SHIELDED DESK / STELLAR SOROBAN
            </span>
            <span className="text-[11px] font-mono bg-[#181c25] border border-[#1e2329] px-2.5 py-1 rounded text-[#848e9c]">
              Protocol v2.4
            </span>
          </div>
          <div className="flex items-center gap-3">
            {isTestnet && (
              <div className="hidden md:flex items-center gap-3 text-xs font-mono">
                <span className="inline-flex items-center gap-1.5 bg-[#181c25] border border-[#1e2329] px-2.5 py-1 rounded text-[#0ecb81]">
                  <span className="h-2 w-2 rounded-full bg-[#0ecb81] animate-pulse" />
                  ASP Clean Set: Active
                </span>
                <span className="inline-flex items-center gap-1.5 bg-[#181c25] border border-[#1e2329] px-2.5 py-1 rounded text-[#848e9c]">
                  Relayer: 12ms
                </span>
              </div>
            )}

            {/* Stellar wallet connection (Freighter) */}
            <ConnectWallet />

            {isUnlocked() && (
              <button
                onClick={handleLock}
                className="h-8 w-8 rounded-lg bg-[#181c25] border border-[#1e2329] flex items-center justify-center text-[#848e9c] hover:text-[#f7a600] hover:border-[#f7a600]/40 transition-colors"
                title="Lock wallet"
              >
                <Lock className="h-3.5 w-3.5" />
              </button>
            )}
            {isTestnet && (
              <div className="text-xs font-mono font-bold bg-[#f7a600]/15 border border-[#f7a600]/40 text-[#f7a600] px-3 py-1 rounded-md">
                TESTNET PILOT
              </div>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto bg-[#0b0e11]">
          {children}
        </main>
      </div>

      {/* ── Mobile "More" Sheet ─────────────────────────── */}
      {moreOpen && (
        <div className="lg:hidden fixed inset-0 z-[60]">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setMoreOpen(false)}
          />
          {/* Sheet */}
          <div className="absolute bottom-0 inset-x-0 bg-[#131722] border-t border-[#1e2329] rounded-t-2xl p-5 pb-8 space-y-1 animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-mono font-bold text-[#848e9c] uppercase tracking-wider">More</span>
              <button
                onClick={() => setMoreOpen(false)}
                className="h-8 w-8 rounded-lg bg-[#181c25] border border-[#1e2329] flex items-center justify-center text-[#848e9c] hover:text-[#eaecef] transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {MORE_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                    active
                      ? "bg-[#f7a600] text-[#0b0e11] font-bold"
                      : "text-[#eaecef] hover:bg-[#181c25]"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Mobile Bottom Tabs (5 tabs) ────────────────── */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-[#131722] border-t border-[#1e2329] flex items-center justify-around h-16 z-50">
        {MOBILE_TABS.map((item) => {
          const Icon = item.icon;
          const active = isMobileActive(item.href);
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`flex flex-col items-center gap-1 px-2 py-1.5 transition-colors ${
                active ? "text-[#f7a600]" : "text-[#848e9c]"
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider">{item.label}</span>
            </Link>
          );
        })}
        {/* More tab */}
        <button
          onClick={() => setMoreOpen(true)}
          className={`flex flex-col items-center gap-1 px-2 py-1.5 transition-colors ${
            isMoreActive ? "text-[#f7a600]" : "text-[#848e9c]"
          }`}
        >
          <MoreHorizontal className="h-5 w-5" />
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider">More</span>
        </button>
      </nav>
    </div>
  );
}
