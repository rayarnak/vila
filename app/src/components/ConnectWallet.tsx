"use client";

import { useEffect, useState } from "react";
import { Wallet, LogOut, Check, ChevronDown, ExternalLink } from "lucide-react";
import { useWalletConnection } from "@/lib/walletConnection";
import { isFreighterInstalled } from "@/lib/freighter";

/**
 * Connect Wallet button using the Freighter Stellar wallet.
 *
 * States:
 *   - not installed  → link to install Freighter
 *   - disconnected   → "Connect Wallet" (triggers setAllowed + requestAccess)
 *   - connected      → truncated address + disconnect menu
 */
export default function ConnectWallet() {
  const { address, connecting, error, connect, disconnect } = useWalletConnection();
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    isFreighterInstalled().then(setInstalled);
  }, []);

  const handleConnect = async () => {
    try {
      await connect();
    } catch {
      /* error surfaced via `error` from the hook */
    }
  };

  const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

  const copyAddress = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Freighter not installed — offer install link.
  if (installed === false && !address) {
    return (
      <a
        href="https://www.freighter.app/"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 h-9 px-3.5 rounded-lg text-xs font-mono font-bold bg-[#181c25] border border-[#1e2329] text-[#848e9c] hover:text-[#f7a600] hover:border-[#f7a600]/40 transition-colors"
        title="Install the Freighter Stellar wallet"
      >
        <Wallet className="h-3.5 w-3.5" />
        Install Freighter
        <ExternalLink className="h-3 w-3" />
      </a>
    );
  }

  // Connected — show address + disconnect menu.
  if (address) {
    return (
      <div className="relative">
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className="inline-flex items-center gap-2 h-9 px-3.5 rounded-lg text-xs font-mono font-bold bg-[#f7a600]/10 border border-[#f7a600]/40 text-[#f7a600] hover:bg-[#f7a600]/20 transition-colors"
          title="Connected with Freighter"
        >
          <span className="h-2 w-2 rounded-full bg-[#0ecb81] animate-pulse" />
          {short(address)}
          <ChevronDown className="h-3 w-3" />
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 mt-2 w-56 z-50 rounded-xl border border-[#1e2329] bg-[#131722] shadow-xl p-2 animate-in fade-in slide-in-from-top-1 duration-150">
              <div className="px-3 py-2 border-b border-[#1e2329]">
                <p className="text-[9px] font-mono uppercase tracking-wider text-[#848e9c]/70">
                  Freighter Wallet
                </p>
                <p className="text-[11px] font-mono text-[#eaecef] break-all mt-1">
                  {address}
                </p>
              </div>
              <button
                onClick={copyAddress}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-mono text-[#eaecef] hover:bg-[#181c25] transition-colors"
              >
                {copied ? (
                  <><Check className="h-3.5 w-3.5 text-[#0ecb81]" /> Copied</>
                ) : (
                  <><Wallet className="h-3.5 w-3.5 text-[#848e9c]" /> Copy address</>
                )}
              </button>
              <button
                onClick={() => {
                  disconnect();
                  setMenuOpen(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-mono text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <LogOut className="h-3.5 w-3.5" />
                Disconnect
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  // Disconnected — connect button.
  return (
    <div className="relative">
      <button
        onClick={handleConnect}
        disabled={connecting}
        className="inline-flex items-center gap-2 h-9 px-3.5 rounded-lg text-xs font-mono font-bold bg-[#f7a600] text-[#0b0e11] hover:bg-[#f7a600]/90 transition-colors disabled:opacity-60"
      >
        <Wallet className="h-3.5 w-3.5" />
        {connecting ? "Connecting…" : "Connect Wallet"}
      </button>
      {error && (
        <p className="absolute right-0 mt-1 text-[10px] font-mono text-red-400 whitespace-nowrap">
          {error}
        </p>
      )}
    </div>
  );
}
