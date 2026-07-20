"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  ArrowLeftRight,
  Sparkles,
  ArrowUpRight,
  ArrowDownLeft,
  Shield,
  ShieldCheck,
  Eye,
  Zap,
  Lock,
  Users,
  CheckCircle2,
  Activity,
  Send,
  Download,
  Wallet,
  Copy,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

/* ── Navbar ─────────────────────────────────────────────────────────── */
function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={`sticky top-0 z-50 w-full border-b transition-colors duration-200 ${
        scrolled
          ? "border-[#1e2329] bg-[#131722]/95 backdrop-blur-md"
          : "border-transparent bg-transparent"
      }`}
    >
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-[#f7a600] flex items-center justify-center shadow-sm">
              <span className="text-[#0b0e11] font-black text-sm font-mono tracking-tighter">V</span>
            </div>
            <span className="text-base font-bold tracking-tight text-[#eaecef]">Vila</span>
          </Link>
          <div className="hidden md:flex items-center gap-1">
            <NavLink href="#how-it-works">How It Works</NavLink>
            <NavLink href="#features">Features</NavLink>
            <NavLink href="#architecture">Architecture</NavLink>
            <NavLink href="/explorer">Explorer</NavLink>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] font-mono font-bold text-[#f7a600] bg-[#f7a600]/10 border border-[#f7a600]/25 px-2.5 py-1 rounded uppercase tracking-wider">
            Testnet
          </span>
          <Button size="sm" className="rounded-full px-5 bg-[#f7a600] hover:bg-[#e09500] text-[#0b0e11] font-bold" asChild>
            <Link href="/wallet">Launch App</Link>
          </Button>
        </div>
      </div>
    </nav>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="px-3 py-2 rounded-md text-sm font-medium text-[#848e9c] hover:text-[#eaecef] transition-colors"
    >
      {children}
    </Link>
  );
}

/* ── Mobile Phone Mockup (mirrors actual /wallet dashboard) ────────── */
function MobilePreview() {
  return (
    <div className="mx-auto" style={{ width: 320 }}>
      {/* Phone frame */}
      <div className="rounded-[2.5rem] border-[3px] border-[#2a2e37] bg-[#0b0e11] p-2 shadow-2xl shadow-black/60">
        {/* Screen */}
        <div className="rounded-[2rem] overflow-hidden bg-[#0b0e11]">
          {/* Status bar */}
          <div className="flex items-center justify-between px-6 pt-3 pb-1">
            <span className="text-[10px] font-mono text-[#848e9c]">9:41</span>
            <div className="w-20 h-5 rounded-full bg-[#1e2329]" />
            <div className="flex items-center gap-1">
              <div className="w-4 h-2 rounded-sm border border-[#848e9c]">
                <div className="w-2.5 h-full rounded-sm bg-[#0ecb81]" />
              </div>
            </div>
          </div>

          {/* App header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#1e2329] bg-[#131722]">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-md bg-[#f7a600] flex items-center justify-center">
                <span className="text-[#0b0e11] font-black text-[9px] font-mono">V</span>
              </div>
              <span className="text-[10px] font-bold text-[#eaecef]">Vila Pro</span>
            </div>
            <div className="flex items-center gap-2">
              <Lock className="h-3 w-3 text-[#848e9c]" />
              <span className="text-[8px] font-mono font-bold bg-[#f7a600]/15 border border-[#f7a600]/40 text-[#f7a600] px-1.5 py-0.5 rounded">
                TESTNET
              </span>
            </div>
          </div>

          {/* Balance card */}
          <div className="mx-3 mt-3 rounded-xl overflow-hidden border border-[#1e2329] relative"
            style={{ background: "linear-gradient(135deg, #1a1e26 0%, #131722 100%)" }}
          >
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-[#f7a600]" />
            <div className="p-4 pt-5">
              <div className="flex items-center justify-between mb-2">
                <span className="inline-flex items-center gap-1 text-[8px] font-mono font-bold uppercase tracking-widest text-[#f7a600] bg-[#f7a600]/10 border border-[#f7a600]/25 px-1.5 py-0.5 rounded">
                  <Shield className="h-2 w-2" />
                  Shielded
                </span>
                <Eye className="h-3 w-3 text-[#848e9c]" />
              </div>
              <div className="text-2xl font-mono font-black tracking-tight text-[#eaecef] mb-2">1,250.00</div>
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-[8px] font-mono font-bold text-[#eaecef] bg-[#181c25] border border-[#1e2329] rounded-full px-2 py-0.5">1,000 XLM</span>
                <span className="text-[8px] font-mono font-bold text-[#eaecef] bg-[#181c25] border border-[#1e2329] rounded-full px-2 py-0.5">250 USDC</span>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#0b0e11]/50 border border-[#1e2329]">
                <span className="text-[8px] font-mono tracking-wider text-[#848e9c] truncate">GABC DEFG HIJK LMNO</span>
                <Copy className="h-2.5 w-2.5 text-[#848e9c] shrink-0" />
              </div>
            </div>
          </div>

          {/* Quick actions */}
          <div className="flex gap-2 mx-3 mt-3">
            {[
              { icon: Send, label: "Send" },
              { icon: Download, label: "Receive" },
              { icon: ArrowLeftRight, label: "Swap" },
            ].map((a) => (
              <div key={a.label} className="flex-1 flex flex-col items-center gap-1.5 p-2.5 rounded-xl border border-[#1e2329] bg-[#131722]">
                <div className="h-7 w-7 rounded-lg bg-[#181c25] border border-[#1e2329] flex items-center justify-center text-[#eaecef]">
                  <a.icon className="h-3 w-3" />
                </div>
                <span className="text-[8px] font-mono font-medium text-[#848e9c]">{a.label}</span>
              </div>
            ))}
          </div>

          {/* Recent activity */}
          <div className="mx-3 mt-3 rounded-xl border border-[#1e2329] bg-[#131722]">
            <div className="flex items-center justify-between px-3 py-2 border-b border-[#1e2329]">
              <span className="text-[8px] font-mono font-bold text-[#eaecef] uppercase tracking-wider">Recent Activity</span>
              <Clock className="h-3 w-3 text-[#848e9c]" />
            </div>
            <div className="divide-y divide-[#1e2329]/60">
              <MobileTxRow type="deposit" amount="+100.00 USDC" time="2m ago" />
              <MobileTxRow type="withdraw" amount="-50.00 XLM" time="45m ago" />
              <MobileTxRow type="swap" amount="100 XLM → USDC" time="1h ago" />
            </div>
          </div>

          {/* Bottom tabs — matches AppShell mobile */}
          <div className="flex items-center justify-around mt-3 px-2 py-2.5 border-t border-[#1e2329] bg-[#131722]">
            {[
              { icon: Wallet, label: "Wallet", active: true },
              { icon: Send, label: "Send", active: false },
              { icon: Download, label: "Receive", active: false },
              { icon: Eye, label: "Keys", active: false },
            ].map((tab) => (
              <div key={tab.label} className="flex flex-col items-center gap-0.5">
                <tab.icon className={`h-4 w-4 ${tab.active ? "text-[#f7a600]" : "text-[#848e9c]"}`} />
                <span className={`text-[7px] font-mono font-bold uppercase tracking-wider ${tab.active ? "text-[#f7a600]" : "text-[#848e9c]"}`}>{tab.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MobileTxRow({ type, amount, time }: { type: "deposit" | "withdraw" | "swap"; amount: string; time: string }) {
  const config = {
    deposit: { icon: <ArrowDownLeft className="w-2.5 h-2.5" />, bg: "bg-[#0ecb81]/15 text-[#0ecb81]", color: "text-[#0ecb81]", label: "Received" },
    withdraw: { icon: <ArrowUpRight className="w-2.5 h-2.5" />, bg: "bg-[#f7a600]/15 text-[#f7a600]", color: "text-[#f7a600]", label: "Sent" },
    swap: { icon: <ArrowLeftRight className="w-2.5 h-2.5" />, bg: "bg-indigo-500/15 text-indigo-400", color: "text-indigo-400", label: "Swap" },
  };
  const c = config[type];
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <div className="flex items-center gap-2">
        <div className={`w-5 h-5 rounded-full flex items-center justify-center ${c.bg}`}>{c.icon}</div>
        <div>
          <div className="text-[9px] font-medium text-[#eaecef]">{c.label}</div>
          <div className="text-[7px] font-mono text-[#848e9c]">{time}</div>
        </div>
      </div>
      <div className={`text-[9px] font-mono font-semibold ${c.color}`}>{amount}</div>
    </div>
  );
}

/* ── Fade-in wrapper ────────────────────────────────────────────────── */
function FadeIn({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ── Main Page ──────────────────────────────────────────────────────── */
export default function Home() {
  const [stats, setStats] = useState({ depositCount: 0, denominationXLM: 0, lastRoot: "", network: "" });

  useEffect(() => {
    fetch("/api/tree")
      .then((r) => r.json())
      .then((data) => setStats({
        depositCount: data.depositCount || data.leafCount || 0,
        denominationXLM: data.denominationXLM || 100,
        lastRoot: data.lastRoot || "0",
        network: data.network || "testnet",
      }))
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-[#0b0e11] text-[#eaecef]">
      <Navbar />

      <main>
        {/* ─── Hero ─── */}
        <section className="relative overflow-hidden">
          {/* Mesh background — subtle amber glow for dark theme */}
          <div className="absolute inset-0 pointer-events-none">
            <div
              className="absolute top-[-40%] left-1/2 -translate-x-1/2 w-[900px] h-[900px] opacity-[0.07]"
              style={{
                background: "radial-gradient(circle, #f7a600 0%, transparent 70%)",
              }}
            />
            <div
              className="absolute top-[10%] left-[15%] w-[500px] h-[500px] opacity-[0.04]"
              style={{
                background: "radial-gradient(circle, #f7a600 0%, transparent 70%)",
              }}
            />
            <div
              className="absolute top-[5%] right-[10%] w-[400px] h-[400px] opacity-[0.03]"
              style={{
                background: "radial-gradient(circle, #f7a600 0%, transparent 70%)",
              }}
            />
          </div>

          <div className="relative z-10 flex flex-col items-center px-6 pt-20 pb-16">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="mb-6">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[#f7a600]/30 bg-[#f7a600]/10 text-sm text-[#f7a600] font-medium">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Soroban Testnet Pilot</span>
              </div>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="text-center text-5xl sm:text-6xl md:text-7xl font-bold tracking-tighter leading-[0.95] mb-6 max-w-4xl"
            >
              <span>Hold stablecoins.</span>
              <br />
              <span className="italic font-normal text-[#f7a600]">Transfer & Swap</span>{" "}
              <span>privately.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="text-center text-base sm:text-lg text-[#848e9c] max-w-2xl mb-10 leading-relaxed"
            >
              The confidential wallet and DEX swap layer for Stellar. Transfer instantly
              or swap assets on-chain with zero public link between sender and receiver.
            </motion.p>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.3 }} className="flex items-center gap-3 mb-10">
              <Button size="lg" className="rounded-full px-7 gap-2 bg-[#f7a600] hover:bg-[#e09500] text-[#0b0e11] font-bold shadow-lg shadow-[#f7a600]/15" asChild>
                <Link href="/wallet">
                  Get Started
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </Button>
              <Button variant="outline" size="lg" className="rounded-full px-7 gap-2 border-[#1e2329] text-[#eaecef] hover:bg-[#181c25] hover:text-[#eaecef]" asChild>
                <Link href="#how-it-works">
                  Learn More
                </Link>
              </Button>
            </motion.div>

            {/* Stats bar */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="w-full max-w-3xl mb-14"
            >
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 rounded-xl border border-[#1e2329] bg-[#131722]/80 p-2 backdrop-blur">
                {[
                  ["Network", "Soroban"],
                  ["ZK Engine", "Groth16"],
                  ["Assets", "XLM / USDC"],
                  ["Deposits", String(stats.depositCount)],
                  ["Pools", "8 Active"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg bg-[#181c25]/60 px-3 py-2 text-center">
                    <div className="text-[9px] font-mono font-bold uppercase tracking-wider text-[#848e9c]">{label}</div>
                    <div className="mt-0.5 text-sm font-bold text-[#eaecef]">{value}</div>
                  </div>
                ))}
              </div>
              {stats.network && (
                <p className="mt-3 text-center text-xs text-[#848e9c]">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#0ecb81] animate-pulse" />
                    Live on Stellar {stats.network} — proofs verify on-chain in ~5 seconds
                  </span>
                </p>
              )}
            </motion.div>

            {/* Mobile phone preview */}
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.5 }}
            >
              <MobilePreview />
            </motion.div>
          </div>
        </section>

        {/* ─── How It Works ─── */}
        <section id="how-it-works" className="px-6 py-24 border-t border-[#1e2329]">
          <div className="max-w-5xl mx-auto">
            <FadeIn>
              <div className="text-center mb-14">
                <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">How It Works</h2>
                <p className="text-[#848e9c] max-w-2xl mx-auto">
                  Deposit into a shielded pool, send privately or swap assets — no public link between sender and receiver.
                </p>
              </div>
            </FadeIn>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {[
                {
                  step: "01",
                  title: "Fund your wallet",
                  desc: "Create a wallet with a PIN. Deposit XLM or USDC into a fixed-denomination shielded pool. Your secret note is saved automatically.",
                  icon: <ArrowDownLeft className="w-5 h-5" />,
                  color: "bg-[#0ecb81]/15 text-[#0ecb81]",
                },
                {
                  step: "02",
                  title: "Send privately",
                  desc: "Enter a recipient and amount. Your wallet auto-selects the right note, generates a Groth16 ZK proof in the browser, and submits it on-chain.",
                  icon: <Lock className="w-5 h-5" />,
                  color: "bg-[#f7a600]/15 text-[#f7a600]",
                },
                {
                  step: "03",
                  title: "Swap assets privately",
                  desc: "Withdraw as a different token via the on-chain swap router. Deposit XLM and withdraw USDC — breaks transaction graphs while changing settlement assets.",
                  icon: <ArrowLeftRight className="w-5 h-5" />,
                  color: "bg-indigo-500/15 text-indigo-400",
                },
                {
                  step: "04",
                  title: "Disclose selectively",
                  desc: "Generate timelocked reveal keys for auditors. They can inspect transaction details after the timelock expires — but never spend your funds.",
                  icon: <ShieldCheck className="w-5 h-5" />,
                  color: "bg-violet-500/15 text-violet-400",
                },
              ].map((item, i) => (
                <FadeIn key={item.step} delay={i * 0.08}>
                  <div className="rounded-xl border border-[#1e2329] bg-[#131722] p-6 h-full hover:border-[#1e2329]/80 transition-colors">
                    <div className="flex items-center gap-3 mb-4">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${item.color}`}>
                        {item.icon}
                      </div>
                      <div>
                        <span className="text-[10px] font-mono font-bold text-[#848e9c] uppercase tracking-wider">Step {item.step}</span>
                        <h3 className="text-base font-semibold text-[#eaecef]">{item.title}</h3>
                      </div>
                    </div>
                    <p className="text-sm text-[#848e9c] leading-relaxed">{item.desc}</p>
                  </div>
                </FadeIn>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Features ─── */}
        <section id="features" className="px-6 py-24 border-t border-[#1e2329]">
          <div className="max-w-5xl mx-auto">
            <FadeIn>
              <div className="text-center mb-14">
                <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">Built for Real Privacy</h2>
                <p className="text-[#848e9c] max-w-2xl mx-auto">
                  On-chain ZK proofs, client-side proving, and compliance-oriented disclosure.
                </p>
              </div>
            </FadeIn>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                {
                  icon: <Shield className="w-5 h-5" />,
                  title: "Groth16 on Soroban",
                  desc: "ZK proofs verified on-chain using Stellar's native BN254 host functions. No off-chain trust.",
                },
                {
                  icon: <Zap className="w-5 h-5" />,
                  title: "Poseidon Hashing",
                  desc: "ZK-friendly hash over BN254 Fr for circuits and on-chain Merkle tree. Matching parameters ensure validity.",
                },
                {
                  icon: <Users className="w-5 h-5" />,
                  title: "Relayer Network",
                  desc: "Submit withdrawals through a relayer so recipients don't need gas. Random delays decorrelate timing.",
                },
                {
                  icon: <Eye className="w-5 h-5" />,
                  title: "Timelocked Reveal Keys",
                  desc: "User-held keys that disclose transaction details after a configurable period. Can prove activity, can't spend funds.",
                },
                {
                  icon: <ShieldCheck className="w-5 h-5" />,
                  title: "Privacy Pools",
                  desc: "Prove membership in an approved set without revealing which deposit is yours. Inspired by Vitalik's Privacy Pools paper.",
                },
                {
                  icon: <Sparkles className="w-5 h-5" />,
                  title: "Client-side Proving",
                  desc: "Proofs are generated in the browser using snarkjs WASM. Your secret note never leaves your device.",
                },
              ].map((feature, i) => (
                <FadeIn key={feature.title} delay={i * 0.05}>
                  <div className="rounded-xl border border-[#1e2329] bg-[#131722] p-5 h-full hover:border-[#f7a600]/20 transition-colors">
                    <div className="w-10 h-10 rounded-lg bg-[#181c25] border border-[#1e2329] flex items-center justify-center text-[#eaecef] mb-4">
                      {feature.icon}
                    </div>
                    <h3 className="text-sm font-semibold text-[#eaecef] mb-2">{feature.title}</h3>
                    <p className="text-sm text-[#848e9c] leading-relaxed">{feature.desc}</p>
                  </div>
                </FadeIn>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Architecture + Compliance ─── */}
        <section id="architecture" className="px-6 py-24 border-t border-[#1e2329]">
          <div className="max-w-5xl mx-auto">
            <FadeIn>
              <div className="text-center mb-14">
                <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">Under the Hood</h2>
                <p className="text-[#848e9c] max-w-2xl mx-auto">
                  The privacy pipeline — from deposit commitment to zero-knowledge withdrawal.
                </p>
              </div>
            </FadeIn>

            <FadeIn delay={0.1}>
              <div className="rounded-xl border border-[#1e2329] bg-[#131722] p-6 sm:p-8 overflow-x-auto">
                <pre className="font-mono text-xs sm:text-sm text-[#848e9c] leading-relaxed whitespace-pre">
{`  Depositor                    Vila Pool (Soroban)               Recipient
  ─────────                    ──────────────────               ──────────
      │                               │                              │
      │── deposit(commitment) ───────▶│                              │
      │   [100 XLM + Poseidon hash]   │                              │
      │                               │◀── Merkle tree insert        │
      │                               │                              │
      │── share secret note (QR) ────────────────────────────────▶  │
      │                               │                              │
      │                               │◀── withdraw(proof) ──────── │
      │                               │    [Groth16 ZK proof]        │
      │                               │                              │
      │                               │── BN254 pairing verify ──▶  │
      │                               │── nullifier check ────────▶ │
      │                               │── transfer 100 XLM ───────▶ │
      │                               │                              │
   hidden link ◀────────────────── zero knowledge ──────────────▶ funds`}
                </pre>
              </div>
            </FadeIn>

            <FadeIn delay={0.2}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
                <div className="rounded-xl border border-[#1e2329] bg-[#131722] p-5">
                  <h3 className="font-semibold text-[#eaecef] mb-3">Tech Stack</h3>
                  <ul className="space-y-2 text-sm text-[#848e9c]">
                    <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-[#0ecb81] shrink-0" /> Circom 2.0 circuits + snarkjs (Groth16)</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-[#0ecb81] shrink-0" /> BN254 curve with native Soroban host fns</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-[#0ecb81] shrink-0" /> Poseidon hash (circomlib + on-chain)</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-[#0ecb81] shrink-0" /> Incremental Merkle tree (depth 20)</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-[#0ecb81] shrink-0" /> Client-side WASM proof generation</li>
                  </ul>
                </div>
                <div className="rounded-xl border border-[#1e2329] bg-[#131722] p-5">
                  <h3 className="font-semibold text-[#eaecef] mb-3">Security & Compliance</h3>
                  <ul className="space-y-2 text-sm text-[#848e9c]">
                    <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-[#0ecb81] shrink-0" /> No public sender-recipient link</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-[#0ecb81] shrink-0" /> Nullifier prevents double-spending</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-[#0ecb81] shrink-0" /> On-chain proof verification (no trust)</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-[#0ecb81] shrink-0" /> Timelocked reveal keys for auditors</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-[#0ecb81] shrink-0" /> Privacy Pools subset compliance</li>
                  </ul>
                </div>
              </div>
            </FadeIn>
          </div>
        </section>

        {/* ─── CTA ─── */}
        <section className="px-6 py-24 border-t border-[#1e2329]">
          <FadeIn>
            <div className="max-w-2xl mx-auto text-center">
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
                Hold dollars. Move privately.
              </h2>
              <p className="text-[#848e9c] mb-8">
                Deposit stablecoins, send privately, or execute DEX swaps — all with
                selective disclosure for compliance.
              </p>
              <div className="flex items-center justify-center gap-3">
                <Button size="lg" className="rounded-full px-7 gap-2 bg-[#f7a600] hover:bg-[#e09500] text-[#0b0e11] font-bold shadow-lg shadow-[#f7a600]/15" asChild>
                  <Link href="/wallet">
                    Get Started
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </Button>
                <Button variant="outline" size="lg" className="rounded-full px-7 gap-2 border-[#1e2329] text-[#eaecef] hover:bg-[#181c25] hover:text-[#eaecef]" asChild>
                  <Link href="/compliance">
                    Try Compliance Demo
                  </Link>
                </Button>
              </div>
            </div>
          </FadeIn>
        </section>

        {/* ─── Footer ─── */}
        <footer className="px-6 py-10 border-t border-[#1e2329] bg-[#131722]/50">
          <div className="max-w-5xl mx-auto">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
              <div className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-lg bg-[#f7a600] flex items-center justify-center">
                  <span className="text-[#0b0e11] font-black text-xs font-mono">V</span>
                </div>
                <span className="text-sm font-bold text-[#eaecef]">Vila Protocol</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-[#848e9c]">
                <Link href="/wallet" className="hover:text-[#eaecef] transition-colors">Wallet</Link>
                <Link href="/explorer" className="hover:text-[#eaecef] transition-colors">Proof Explorer</Link>
                <Link href="/compliance" className="hover:text-[#eaecef] transition-colors">Compliance</Link>
                <Link href="/wallet/settings" className="hover:text-[#eaecef] transition-colors">Settings</Link>
              </div>
            </div>
            <div className="mt-6 pt-6 border-t border-[#1e2329] flex flex-col sm:flex-row items-center justify-between gap-3">
              <p className="text-xs text-[#848e9c]">
                Built for the Stellar ZK Hack 2026
              </p>
              <div className="flex items-center gap-1.5 text-xs text-[#848e9c]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#0ecb81]" />
                Stellar Testnet
              </div>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
