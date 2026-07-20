"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Download,
  Check,
  Loader2,
  AlertTriangle,
  Wallet,
  Copy,
  QrCode,
  Shield,
  Building2,
  Eye,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import AppShell from "@/components/AppShell";
import {
  isWalletInitialized,
  isUnlocked,
  addNote,
  generateViewingKey,
  getStellarAddress,
} from "@/lib/noteStore";
import {
  formatTokenAmount,
  findTierByPoolId,
} from "@/lib/tokens";
import { executeWithdraw } from "@/lib/withdraw";

/* ── Types ─────────────────────────────────────────────────── */

type Tab = "deposit" | "claim";

interface ClaimPayload {
  note?: string;
  poolId?: string;
  notes?: { note: string; poolId: string }[];
}

/* ── Helpers ───────────────────────────────────────────────── */

function decodeClaimPayload(encoded: string): ClaimPayload | null {
  try {
    const data = JSON.parse(atob(encoded));
    if (data.note && data.poolId) return data as ClaimPayload;
    if (
      Array.isArray(data.notes) &&
      data.notes.every((item: { note?: unknown; poolId?: unknown }) => (
        typeof item.note === "string" && typeof item.poolId === "string"
      ))
    ) {
      return data as ClaimPayload;
    }
    return null;
  } catch {
    return null;
  }
}

function claimPayloadItems(payload?: ClaimPayload | null): { note: string; poolId: string }[] {
  if (!payload) return [];
  if (payload.notes?.length) return payload.notes;
  if (payload.note && payload.poolId) return [{ note: payload.note, poolId: payload.poolId }];
  return [];
}

function parseNoteAmount(noteString: string, poolId?: string): string {
  const raw = parseNoteRaw(noteString);
  if (raw === null) return "?";
  const symbol = poolId ? (findTierByPoolId(poolId)?.tokenSymbol ?? "XLM") : "XLM";
  return formatTokenAmount(raw, 7, symbol);
}

function parseNoteRaw(noteString: string): bigint | null {
  const parts = noteString.split("-");
  if (parts.length !== 5 || parts[0] !== "vila") return null;
  try {
    return BigInt(parts[3]);
  } catch {
    return null;
  }
}

function formatClaimItemsAmount(items: { note: string; poolId?: string }[]): string {
  const totalRaw = items.reduce((sum, item) => sum + (parseNoteRaw(item.note) ?? 0n), 0n);
  const symbol = items[0]?.poolId ? (findTierByPoolId(items[0].poolId)?.tokenSymbol ?? "XLM") : "XLM";
  return formatTokenAmount(totalRaw, 7, symbol);
}

function shortenAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

/* ── Deposit Tab ───────────────────────────────────────────── */

function DepositTab() {
  const [address, setAddress] = useState("");
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);

  useEffect(() => {
    if (address) return;
    const addr = getStellarAddress();
    if (addr) setAddress(addr);
  }, [address]);

  const copyAddress = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-5">
      {/* Send from exchange or wallet */}
      <div className="rounded-xl border border-border/60 overflow-hidden">
        <div className="p-4 bg-card">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-9 w-9 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
              <Building2 className="h-4.5 w-4.5 text-emerald-600" />
            </div>
            <div>
              <div className="text-sm font-semibold">Send from exchange or wallet</div>
              <p className="text-xs text-muted-foreground">
                Send XLM or USDC to your Stellar address
              </p>
            </div>
          </div>

          {address ? (
            <>
              {showQR && (
                <div className="mb-3 flex justify-center">
                  <div className="bg-white p-3 rounded-xl inline-block">
                    <QRCodeSVG value={address} size={160} />
                  </div>
                </div>
              )}
              <div className="bg-muted/50 rounded-lg px-3 py-2.5 mb-3">
                <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Your Stellar Address</div>
                <div className="text-xs font-mono break-all leading-relaxed">{address}</div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="flex-1" onClick={copyAddress}>
                  {copied ? (
                    <><Check className="h-3.5 w-3.5 mr-1.5 text-emerald-500" /> Copied</>
                  ) : (
                    <><Copy className="h-3.5 w-3.5 mr-1.5" /> Copy Address</>
                  )}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowQR(!showQR)}>
                  <QrCode className="h-3.5 w-3.5 mr-1.5" />
                  {showQR ? "Hide" : "Show"} QR
                </Button>
              </div>
            </>
          ) : (
            <Button
              size="sm"
              className="w-full"
              variant="outline"
              onClick={() => {
                const addr = getStellarAddress();
                if (addr) setAddress(addr);
              }}
            >
              <Wallet className="h-3.5 w-3.5 mr-1.5" />
              Show Address
            </Button>
          )}
        </div>
        <div className="px-4 py-2.5 bg-muted/20 border-t border-border/40">
          <p className="text-[11px] text-muted-foreground text-center">
            Send from Binance, Coinbase, Yellow Card, Luno, or any Stellar wallet
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── Claim Tab ─────────────────────────────────────────────── */

function ClaimTab({ initialClaim }: { initialClaim?: ClaimPayload | null }) {
  const initialItems = claimPayloadItems(initialClaim);
  const [step, setStep] = useState<"paste" | "withdrawing" | "success">("paste");
  const [claimItems, setClaimItems] = useState<{ note: string; poolId: string }[]>(initialItems);
  const [noteString, setNoteString] = useState(initialItems[0]?.note || "");
  const [poolId, setPoolId] = useState(initialItems[0]?.poolId || "");
  const [walletAddress, setWalletAddress] = useState("");
  const [txHashes, setTxHashes] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const [viewingKey, setViewingKey] = useState("");

  useEffect(() => {
    const items = claimPayloadItems(initialClaim);
    if (items.length > 0) {
      setClaimItems(items);
      setNoteString(items[0].note);
      setPoolId(items[0].poolId);
    }
  }, [initialClaim]);

  const activeClaimItems = claimItems.length > 0
    ? claimItems
    : noteString && noteString.startsWith("vila-")
      ? [{ note: noteString, poolId }]
      : [];

  const connectAndWithdraw = async () => {
    setError("");
    setStep("withdrawing");
    setProgress("Preparing withdrawal...");

    try {
      const addr = getStellarAddress();
      if (!addr) throw new Error("Wallet not initialized");
      setWalletAddress(addr);

      if (activeClaimItems.length === 0) {
        throw new Error("Enter a valid secret note.");
      }

      const completedTxHashes: string[] = [];
      for (let i = 0; i < activeClaimItems.length; i += 1) {
        const item = activeClaimItems[i];
        const result = await executeWithdraw(
          item.note,
          addr,
          (s) => setProgress(activeClaimItems.length > 1 ? `Note ${i + 1}/${activeClaimItems.length}: ${s}` : s),
          item.poolId || undefined
        );

        completedTxHashes.push(result.txHash);

        try {
          const tierInfo = item.poolId ? findTierByPoolId(item.poolId) : undefined;
          const tokenSymbol = tierInfo?.tokenSymbol ?? "XLM";
          const stored = addNote({
            noteString: item.note,
            token: tokenSymbol,
            amountDisplay: parseNoteAmount(item.note, item.poolId),
            amountRaw: item.note.split("-")[3] || "0",
            txHash: result.txHash,
          });
          if (i === 0) {
            const vk = generateViewingKey(stored.id, 24);
            setViewingKey(vk.viewingKey);
          }
        } catch {
          // Non-fatal
        }
      }

      setTxHashes(completedTxHashes);
      setStep("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Withdrawal failed");
      setStep("paste");
    }
  };

  return (
    <div className="space-y-5">
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-50 text-red-700 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Step: Paste note */}
      {step === "paste" && (
        <>
          <div className="rounded-xl border border-border/60 p-5 space-y-3">
            <label className="text-xs font-medium text-muted-foreground block">Secret Note</label>
            <p className="text-[11px] text-muted-foreground mb-2">Paste a bearer note from a sender, or open a claim link they shared with you.</p>
            <textarea
              value={noteString}
              onChange={(e) => {
                const nextNote = e.target.value.trim();
                setNoteString(nextNote);
                setClaimItems([]);
              }}
              placeholder="vila-abc123...-def456...-1000000000-0"
              rows={3}
              className="w-full rounded-lg border border-input bg-background px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
            {claimItems.length <= 1 && noteString && noteString.startsWith("vila-") && (
              <div className="flex items-center gap-2 text-sm">
                <Shield className="h-4 w-4 text-emerald-600" />
                <span className="font-medium">{parseNoteAmount(noteString, poolId)}</span>
                <span className="text-muted-foreground">shielded</span>
              </div>
            )}
            {claimItems.length > 1 && (
              <div className="flex items-center gap-2 text-sm">
                <Shield className="h-4 w-4 text-emerald-600" />
                <span className="font-medium">{formatClaimItemsAmount(claimItems)}</span>
                <span className="text-muted-foreground">across {claimItems.length} notes</span>
              </div>
            )}
          </div>

          {poolId && (
            <div className="text-xs text-muted-foreground">
              Pool: <span className="font-mono">{shortenAddress(poolId)}</span>
            </div>
          )}

          <Button
            className="w-full"
            onClick={connectAndWithdraw}
            disabled={activeClaimItems.length === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            Withdraw{activeClaimItems.length > 1 ? ` ${activeClaimItems.length} Notes` : ""}
          </Button>
        </>
      )}

      {/* Step: Withdrawing */}
      {step === "withdrawing" && (
        <div className="py-12 text-center space-y-4">
          <Loader2 className="h-10 w-10 animate-spin mx-auto text-foreground" />
          <div>
            <h3 className="text-sm font-semibold">Generating ZK Proof & Withdrawing</h3>
            <p className="text-xs text-muted-foreground mt-1">{progress || "Processing..."}</p>
          </div>
          <div className="flex items-center justify-center gap-2 text-xs text-emerald-600">
            <Shield className="h-3 w-3" />
            <span>Privacy proof in progress</span>
          </div>
        </div>
      )}

      {/* Step: Success */}
      {step === "success" && (
        <div className="py-6 space-y-6">
          <div className="text-center">
            <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <Check className="h-8 w-8 text-emerald-600" />
            </div>
            <h2 className="text-xl font-semibold">Withdrawal Complete</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {formatClaimItemsAmount(activeClaimItems)} is now in your wallet
              {walletAddress && ` (${shortenAddress(walletAddress)})`}
            </p>
          </div>

          <div className="rounded-xl border border-border/60 bg-card p-5 space-y-4 text-sm">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">Claim receipt</h3>
                <p className="text-xs text-muted-foreground">Private withdrawal completed</p>
              </div>
              <span className="rounded-full px-2.5 py-1 text-xs font-medium bg-emerald-100 text-emerald-700">
                Settled
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-muted/45 px-3 py-2">
                <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Amount</div>
                <div className="mt-0.5 text-sm font-semibold">{formatClaimItemsAmount(activeClaimItems)}</div>
              </div>
              <div className="rounded-lg bg-muted/45 px-3 py-2">
                <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Notes</div>
                <div className="mt-0.5 text-sm font-semibold">{activeClaimItems.length}</div>
              </div>
            </div>
            {txHashes.length > 0 && (
              <div className="space-y-1">
                <span className="text-muted-foreground">Withdrawal transactions</span>
                {txHashes.map((hash, index) => (
                  <div key={`${hash}-${index}`} className="rounded-lg bg-muted/45 px-3 py-2 font-mono text-xs truncate">
                    {hash}
                  </div>
                ))}
              </div>
            )}
          </div>

          {viewingKey && (
            <div className="rounded-xl border border-border/60 p-5 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Eye className="h-4 w-4" />
                Reveal Key
              </div>
              <div className="bg-muted rounded-lg p-3 text-xs font-mono break-all">{viewingKey}</div>
            </div>
          )}

          <Button asChild className="w-full">
            <Link href="/wallet">Back to Wallet</Link>
          </Button>
        </div>
      )}
    </div>
  );
}

/* ── Inner Page (uses useSearchParams) ─────────────────────── */

function ReceivePageInner() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>("deposit");
  const [claimPayload, setClaimPayload] = useState<ClaimPayload | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => { setReady(true); }, []);

  // Check for ?claim= or ?tab=claim on mount
  useEffect(() => {
    const claimParam = searchParams.get("claim");
    if (claimParam) {
      const payload = decodeClaimPayload(claimParam);
      if (payload) {
        setClaimPayload(payload);
        setTab("claim");
        window.history.replaceState({}, "", "/wallet/receive");
      }
    } else if (searchParams.get("tab") === "claim") {
      setTab("claim");
    }
  }, [searchParams]);

  if (!ready) return <div className="min-h-screen" />;
  if (!isWalletInitialized() || !isUnlocked()) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <p className="text-muted-foreground mb-4">Open your wallet first</p>
        <Button asChild><Link href="/wallet">Go to Wallet</Link></Button>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 lg:px-6 py-6 pb-24 lg:pb-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/wallet" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-semibold">Receive</h1>
      </div>

      {/* Tab toggle */}
      <div className="flex gap-1 p-1 rounded-xl bg-muted/50 mb-6">
        <button
          onClick={() => setTab("deposit")}
          className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            tab === "deposit"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Deposit
        </button>
        <button
          onClick={() => setTab("claim")}
          className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            tab === "claim"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Claim Note
        </button>
      </div>

      {tab === "deposit" && <DepositTab />}
      {tab === "claim" && <ClaimTab initialClaim={claimPayload} />}
    </div>
  );
}

/* ── Default Export (Suspense for useSearchParams) ─────────── */

export default function ReceivePage() {
  return (
    <AppShell>
      <Suspense fallback={
        <div className="max-w-lg mx-auto px-4 lg:px-6 py-12 text-center text-muted-foreground text-sm">
          Loading...
        </div>
      }>
        <ReceivePageInner />
      </Suspense>
    </AppShell>
  );
}
