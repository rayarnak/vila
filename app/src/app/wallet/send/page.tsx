"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowLeftRight,
  Send,
  Clipboard,
  Check,
  Loader2,
  ShieldCheck,
  AlertTriangle,
  Eye,
  Copy,
  Clock,
  Shield,
  Zap,
  Share2,
  Link2,
  Wallet,
  ArrowDownToLine,
  Info,
  QrCode,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import AppShell from "@/components/AppShell";
import {
  isWalletInitialized,
  isUnlocked,
  getUnspentNotes,
  selectNoteForAmount,
  markSpent,
  markShared,
  generateViewingKey,
  addConfidentialTransfer,
  getStellarAddress,
  type StoredNote,
} from "@/lib/noteStore";
import { getActiveTokens, getPoolTiers, getSwapPairs, SUPPORTED_TOKENS, parseTokenAmount, formatTokenAmount, type SupportedToken, type PoolTier } from "@/lib/tokens";
import { executeWithdraw, checkSubsetStatus } from "@/lib/withdraw";
import { executeConfidentialTransfer } from "@/lib/confidentialTransfer";
import type { SubsetStatus } from "@/lib/withdraw";

type SendMode = "shielded" | "confidential";
type ShieldedSubMode = "transfer" | "self_withdraw";
type SendState = "form" | "review" | "processing" | "success" | "error";

const FRIENDLY_STEPS = [
  "Preparing your transaction...",
  "Securing your privacy...",
  "Verifying compliance...",
  "Building zero-knowledge proof...",
  "Generating Groth16 proof...",
  "Proof complete!",
  "Submitting to network...",
  "Sending...",
];

const CONFIDENTIAL_STEPS = [
  "Preparing transfer...",
  "Signing...",
  "Submitting...",
  "Confirming...",
];

/* ── Public Balance Strip ────────────────────────────────── */

function usePublicBalance(address: string | null) {
  const [bal, setBal] = useState<{ xlm: string; usdc: string; funded: boolean }>({
    xlm: "0",
    usdc: "0",
    funded: false,
  });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!address) return;
    try {
      const res = await fetch(
        `https://horizon-testnet.stellar.org/accounts/${address}`
      );
      if (!res.ok) {
        setBal({ xlm: "0", usdc: "0", funded: false });
        setLoading(false);
        return;
      }
      const data = await res.json();
      let xlm = "0";
      let usdc = "0";
      for (const b of data.balances) {
        if (b.asset_type === "native") xlm = b.balance;
        if (b.asset_code === "USDC") usdc = b.balance;
      }
      setBal({ xlm, usdc, funded: true });
    } catch {
      // Network error
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15000);
    return () => clearInterval(id);
  }, [refresh]);

  return { ...bal, loading };
}

function PublicBalanceStrip({ address }: { address: string | null }) {
  const { xlm, usdc, funded, loading } = usePublicBalance(address);
  if (loading || !funded) return null;

  const xlmNum = parseFloat(xlm);
  const usdcNum = parseFloat(usdc);

  return (
    <div className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#181c25] border border-[#1e2329]">
      <Wallet className="h-3 w-3 text-[#848e9c]" />
      <span className="text-[10px] font-mono font-bold text-[#848e9c] uppercase tracking-wider">
        Public
      </span>
      <span className="text-xs font-mono font-bold text-[#eaecef]">
        {xlmNum.toFixed(2)} XLM
      </span>
      {usdcNum > 0 && (
        <>
          <span className="text-[#1e2329]">|</span>
          <span className="text-xs font-mono font-bold text-[#eaecef]">
            {usdcNum.toFixed(2)} USDC
          </span>
        </>
      )}
    </div>
  );
}

/* ── Bearer Note Success Screen ──────────────────────────── */

function BearerNoteSuccessScreen({
  claimLink,
  noteString,
  amountDisplay,
}: {
  claimLink: string;
  noteString: string;
  amountDisplay: string;
}) {
  const [linkCopied, setLinkCopied] = useState(false);
  const [noteCopied, setNoteCopied] = useState(false);
  const [showRawNote, setShowRawNote] = useState(false);
  const [shared, setShared] = useState(false);

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(claimLink);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const handleCopyNote = async () => {
    await navigator.clipboard.writeText(noteString);
    setNoteCopied(true);
    setTimeout(() => setNoteCopied(false), 2000);
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Vila Private Payment",
          text: `You've received a private payment of ${amountDisplay}. Open the link to claim:`,
          url: claimLink,
        });
        setShared(true);
      } catch {
        // User cancelled share
      }
    }
  };

  return (
    <div className="py-6 space-y-5">
      {/* Success header */}
      <div className="text-center">
        <div className="h-16 w-16 rounded-full bg-[#0ecb81]/15 border border-[#0ecb81]/30 flex items-center justify-center mx-auto">
          <Link2 className="h-7 w-7 text-[#0ecb81]" />
        </div>
        <h2 className="text-xl font-mono font-bold text-[#eaecef] mt-4">
          Claim Link Ready
        </h2>
        <p className="text-sm font-mono text-[#848e9c] mt-1">
          Share this link with your recipient
        </p>
      </div>

      {/* Amount badge */}
      <div className="flex justify-center">
        <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#f7a600]/10 border border-[#f7a600]/25 text-sm font-mono font-bold text-[#f7a600]">
          <Shield className="h-4 w-4" />
          {amountDisplay}
        </span>
      </div>

      {/* Claim link card */}
      <div className="rounded-xl border border-[#0ecb81]/30 bg-[#0ecb81]/5 p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#0ecb81] uppercase tracking-wider">
          <Link2 className="h-3.5 w-3.5" />
          Claim Link
        </div>
        <div className="rounded-lg bg-[#0b0e11] border border-[#1e2329] px-3 py-2.5 text-xs font-mono text-[#eaecef] break-all leading-relaxed select-all">
          {claimLink}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleCopyLink}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-mono font-bold transition-colors ${
              linkCopied
                ? "bg-[#0ecb81]/15 border border-[#0ecb81]/30 text-[#0ecb81]"
                : "bg-[#181c25] border border-[#1e2329] text-[#eaecef] hover:border-[#0ecb81]/40 hover:text-[#0ecb81]"
            }`}
          >
            {linkCopied ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            {linkCopied ? "Copied!" : "Copy Link"}
          </button>
          {typeof navigator !== "undefined" && "share" in navigator && (
            <button
              onClick={handleNativeShare}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-mono font-bold transition-colors ${
                shared
                  ? "bg-violet-500/15 border border-violet-500/30 text-violet-400"
                  : "bg-[#181c25] border border-[#1e2329] text-[#eaecef] hover:border-violet-500/40 hover:text-violet-400"
              }`}
            >
              <Share2 className="h-3.5 w-3.5" />
              {shared ? "Shared!" : "Share"}
            </button>
          )}
        </div>
      </div>

      {/* Bearer instrument warning */}
      <div className="flex items-start gap-3 px-4 py-3 rounded-lg bg-[#f7a600]/8 border border-[#f7a600]/20">
        <Info className="h-4 w-4 text-[#f7a600] shrink-0 mt-0.5" />
        <div className="text-xs font-mono text-[#848e9c] leading-relaxed">
          <span className="text-[#f7a600] font-bold">Bearer instrument.</span>{" "}
          Anyone with this link can claim the funds. Share it only with your
          intended recipient via a private channel.
        </div>
      </div>

      {/* Collapsible raw note */}
      <div className="rounded-xl border border-[#1e2329] bg-[#131722] overflow-hidden">
        <button
          onClick={() => setShowRawNote(!showRawNote)}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-[#181c25] transition-colors"
        >
          <span className="text-xs font-mono font-bold text-[#848e9c] uppercase tracking-wider">
            Raw Note String
          </span>
          {showRawNote ? (
            <ChevronUp className="h-3.5 w-3.5 text-[#848e9c]" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-[#848e9c]" />
          )}
        </button>
        {showRawNote && (
          <div className="px-4 pb-3 space-y-2 border-t border-[#1e2329]">
            <div className="mt-3 rounded-lg bg-[#0b0e11] border border-[#1e2329] px-3 py-2.5 text-[11px] font-mono text-[#848e9c] break-all leading-relaxed select-all">
              {noteString}
            </div>
            <button
              onClick={handleCopyNote}
              className="flex items-center gap-1.5 text-xs font-mono text-[#848e9c] hover:text-[#eaecef] transition-colors"
            >
              {noteCopied ? (
                <Check className="h-3 w-3 text-[#0ecb81]" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
              {noteCopied ? "Copied" : "Copy note string"}
            </button>
          </div>
        )}
      </div>

      <Button asChild className="w-full">
        <Link href="/wallet">Back to Wallet</Link>
      </Button>
    </div>
  );
}

/* ── Self-Withdraw Success Screen ────────────────────────── */

function WithdrawSuccessScreen({
  txHash,
  noteId,
  mode,
}: {
  txHash: string;
  noteId: string;
  mode: SendMode;
}) {
  const [vk, setVk] = useState<{
    viewingKey: string;
    timelockHours: number;
    expiresAt: number;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [timelock, setTimelock] = useState(24);

  const handleGenerate = () => {
    try {
      const key = generateViewingKey(noteId, timelock);
      setVk(key);
    } catch {
      // note may already be gone
    }
  };

  const handleCopy = async () => {
    if (!vk) return;
    await navigator.clipboard.writeText(vk.viewingKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="py-10 space-y-5">
      <div className="text-center">
        <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
          <Check className="h-8 w-8 text-emerald-600" />
        </div>
        <h2 className="text-xl font-semibold mt-4">
          {mode === "shielded" ? "Withdrawn!" : "Sent!"}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {mode === "shielded"
            ? "Funds withdrawn to your public balance"
            : "Your confidential transfer is complete"}
        </p>
      </div>

      <div className="rounded-lg bg-muted/50 px-4 py-3">
        <div className="text-xs text-muted-foreground mb-1">Transaction</div>
        <div className="text-xs font-mono break-all">{txHash}</div>
      </div>

      {/* Reveal Key Section — only for shielded pool */}
      {mode === "shielded" && (
        <div className="rounded-xl border border-border/60 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-violet-600" />
            <span className="text-sm font-semibold">Reveal Key</span>
          </div>

          {!vk ? (
            <>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Generate a reveal key for this transaction. Share it only with an
                authorized reviewer so they can verify disclosed details after the
                timelock expires. The key cannot spend funds.
              </p>

              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">
                  Timelock period
                </label>
                <div className="flex gap-1.5">
                  {[6, 12, 24, 72].map((h) => (
                    <button
                      key={h}
                      onClick={() => setTimelock(h)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        timelock === h
                          ? "bg-violet-100 text-violet-700 border border-violet-200"
                          : "bg-muted/50 text-muted-foreground border border-transparent hover:bg-muted"
                      }`}
                    >
                      {h}h
                    </button>
                  ))}
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2"
                onClick={handleGenerate}
              >
                <Eye className="h-3.5 w-3.5" />
                Generate Reveal Key
              </Button>
            </>
          ) : (
            <>
              <div className="rounded-lg bg-violet-50/80 border border-violet-200/60 p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-violet-600 font-medium">
                    Key
                  </span>
                  <button
                    onClick={handleCopy}
                    className="text-violet-600 hover:text-violet-800"
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
                <div className="font-mono text-xs break-all text-violet-900">
                  {vk.viewingKey}
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                Unlocks in {vk.timelockHours}h — auditor can verify after{" "}
                {new Date(vk.expiresAt).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            </>
          )}
        </div>
      )}

      <Button asChild className="w-full">
        <Link href="/wallet">Back to Wallet</Link>
      </Button>
    </div>
  );
}

/* ── Main Send Page ──────────────────────────────────────── */

export default function SendPage() {
  const tokens = getActiveTokens();
  const allTokens = SUPPORTED_TOKENS.filter(
    (t) => t.symbol === "XLM" || t.tokenId
  );
  const [mode, setMode] = useState<SendMode>("shielded");
  const [shieldedSub, setShieldedSub] = useState<ShieldedSubMode>("transfer");
  const [token, setToken] = useState<SupportedToken>(
    tokens[0] ?? allTokens[0]
  );
  const [recipient, setRecipient] = useState("");
  const [selectedNote, setSelectedNote] = useState<StoredNote | null>(null);
  const tiers = getPoolTiers(token.symbol);
  const [tier, setTier] = useState<PoolTier | null>(tiers[0] || null);
  const [compliance, setCompliance] = useState<SubsetStatus | null>(null);
  const [state, setState] = useState<SendState>("form");
  const [stepIndex, setStepIndex] = useState(0);
  const [txHash, setTxHash] = useState("");
  const [claimLink, setClaimLink] = useState("");
  const [error, setError] = useState("");
  const [pasted, setPasted] = useState(false);
  const [enableSwap, setEnableSwap] = useState(false);
  const [swapTokenOut, setSwapTokenOut] = useState("");

  // Confidential pay state
  const [confAmount, setConfAmount] = useState("");

  // Swap pairs for selected token
  const swapPairs = getSwapPairs(token.symbol);
  const availableSwapTokens = SUPPORTED_TOKENS.filter(
    (t) =>
      t.symbol !== token.symbol &&
      swapPairs.some((p) => p.tokenOut === t.symbol)
  );
  const selectedPair = swapPairs.find((p) => p.tokenOut === swapTokenOut);

  const stellarAddress = getStellarAddress();

  // Reset tier when token changes
  useEffect(() => {
    const newTiers = getPoolTiers(token.symbol);
    setTier(newTiers[0] || null);
  }, [token.symbol]);

  // Auto-select note when token/tier changes (shielded mode only)
  useEffect(() => {
    if (mode !== "shielded") return;
    if (!tier) {
      setSelectedNote(null);
      return;
    }
    const note = selectNoteForAmount(token.symbol, tier.amount);
    setSelectedNote(note);
    setCompliance(null);
    if (note) {
      const parts = note.noteString.split("-");
      if (parts.length >= 3) {
        try {
          const commitmentBig = BigInt("0x" + parts[1]);
          checkSubsetStatus(commitmentBig)
            .then(setCompliance)
            .catch(() => {});
        } catch {
          // invalid hex, skip compliance check
        }
      }
    }
  }, [token, tier, mode]);

  // Auto-fill recipient for self-withdraw
  useEffect(() => {
    if (shieldedSub === "self_withdraw" && stellarAddress) {
      setRecipient(stellarAddress);
    } else if (shieldedSub === "transfer") {
      setRecipient("");
    }
  }, [shieldedSub, stellarAddress]);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setRecipient(text.trim());
      setPasted(true);
      setTimeout(() => setPasted(false), 1500);
    } catch {
      // clipboard access denied
    }
  };

  const validRecipient =
    recipient.startsWith("G") && recipient.length >= 56;

  // Transfer mode: no recipient needed (bearer note)
  const canReviewShielded =
    shieldedSub === "transfer" ? !!selectedNote : selectedNote && validRecipient;

  const confAmountParsed = confAmount
    ? parseTokenAmount(confAmount, token.decimals)
    : null;
  const canReviewConfidential =
    confAmountParsed && confAmountParsed > 0n && validRecipient;

  const canReview =
    mode === "shielded" ? canReviewShielded : canReviewConfidential;

  const handleSend = async () => {
    setError("");

    // Transfer mode: generate claim link, no on-chain tx
    if (mode === "shielded" && shieldedSub === "transfer") {
      if (!selectedNote || !tier) return;

      const payload = JSON.stringify({
        note: selectedNote.noteString,
        poolId: tier.poolId,
      });
      const encoded = btoa(payload);
      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      const link = `${origin}/wallet/receive?claim=${encoded}`;

      setClaimLink(link);
      markShared(selectedNote.id);
      setState("success");
      return;
    }

    // On-chain flows: self-withdraw or confidential pay
    setState("processing");
    setStepIndex(0);

    try {
      if (!isUnlocked()) throw new Error("Wallet is locked");

      if (mode === "shielded") {
        // Self-withdraw
        if (!selectedNote) return;
        let step = 0;
        const result = await executeWithdraw(
          selectedNote.noteString,
          recipient,
          (msg: string) => {
            if (step < FRIENDLY_STEPS.length - 1) step++;
            setStepIndex(step);
          },
          tier?.poolId
        );
        markSpent(selectedNote.id, result.txHash);
        setTxHash(result.txHash);
      } else {
        // Confidential pay
        if (!confAmountParsed) return;
        let step = 0;
        const result = await executeConfidentialTransfer(
          recipient,
          confAmountParsed,
          token.symbol,
          () => {
            if (step < CONFIDENTIAL_STEPS.length - 1) step++;
            setStepIndex(step);
          }
        );
        addConfidentialTransfer(
          token.symbol,
          confAmountParsed.toString(),
          recipient,
          result.txHash
        );
        setTxHash(result.txHash);
      }
      setState("success");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Transaction failed");
      setState("error");
    }
  };

  // Redirect if wallet not set up
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);

  if (!ready)
    return (
      <AppShell>
        <div className="min-h-screen" />
      </AppShell>
    );
  if (!isWalletInitialized() || !isUnlocked()) {
    return (
      <AppShell>
        <div className="max-w-lg mx-auto px-4 py-20 text-center">
          <p className="text-muted-foreground mb-4">Open your wallet first</p>
          <Button asChild>
            <Link href="/wallet">Go to Wallet</Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  const activeSteps =
    mode === "shielded" ? FRIENDLY_STEPS : CONFIDENTIAL_STEPS;

  return (
    <AppShell>
      <div className="max-w-lg mx-auto px-4 lg:px-6 py-6 pb-24 lg:pb-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link
            href="/wallet"
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-lg font-semibold">Send</h1>
        </div>

        {state === "form" && (
          <div className="space-y-5">
            {/* Public balance strip */}
            <PublicBalanceStrip address={stellarAddress} />

            {/* Mode toggle */}
            <div className="flex gap-1 p-1 rounded-xl bg-muted/50 border border-border/60">
              <button
                onClick={() => setMode("shielded")}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  mode === "shielded"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Shield className="h-4 w-4" />
                Shielded Pool
              </button>
              <button
                onClick={() => setMode("confidential")}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  mode === "confidential"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Zap className="h-4 w-4" />
                Confidential Pay
              </button>
            </div>

            {/* Shielded sub-mode toggle */}
            {mode === "shielded" && (
              <div className="flex gap-1 p-1 rounded-lg bg-[#181c25] border border-[#1e2329]">
                <button
                  onClick={() => setShieldedSub("transfer")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-mono font-bold transition-colors ${
                    shieldedSub === "transfer"
                      ? "bg-[#0ecb81]/15 text-[#0ecb81] border border-[#0ecb81]/30"
                      : "text-[#848e9c] hover:text-[#eaecef]"
                  }`}
                >
                  <Share2 className="h-3.5 w-3.5" />
                  Transfer Note
                </button>
                <button
                  onClick={() => setShieldedSub("self_withdraw")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-mono font-bold transition-colors ${
                    shieldedSub === "self_withdraw"
                      ? "bg-[#f7a600]/15 text-[#f7a600] border border-[#f7a600]/30"
                      : "text-[#848e9c] hover:text-[#eaecef]"
                  }`}
                >
                  <ArrowDownToLine className="h-3.5 w-3.5" />
                  Withdraw to Self
                </button>
              </div>
            )}

            {/* Transfer mode info banner */}
            {mode === "shielded" && shieldedSub === "transfer" && (
              <div className="flex items-start gap-2.5 px-4 py-3 rounded-lg bg-[#0ecb81]/8 border border-[#0ecb81]/20">
                <Shield className="h-4 w-4 text-[#0ecb81] shrink-0 mt-0.5" />
                <p className="text-xs font-mono text-[#848e9c] leading-relaxed">
                  <span className="text-[#0ecb81] font-bold">
                    Maximum privacy.
                  </span>{" "}
                  Generates a claim link — no on-chain transaction. Your
                  recipient claims privately using their own wallet.
                </p>
              </div>
            )}

            {/* Self-withdraw info banner */}
            {mode === "shielded" && shieldedSub === "self_withdraw" && (
              <div className="flex items-start gap-2.5 px-4 py-3 rounded-lg bg-[#f7a600]/8 border border-[#f7a600]/20">
                <ArrowDownToLine className="h-4 w-4 text-[#f7a600] shrink-0 mt-0.5" />
                <p className="text-xs font-mono text-[#848e9c] leading-relaxed">
                  <span className="text-[#f7a600] font-bold">
                    Unshield funds.
                  </span>{" "}
                  Withdraws from the privacy pool to your own public Stellar
                  address. Your deposit remains unlinkable.
                </p>
              </div>
            )}

            {/* Token selector */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Token
              </label>
              <div className="flex gap-2">
                {(mode === "shielded" ? tokens : allTokens).map((t) => {
                  const count =
                    mode === "shielded"
                      ? getUnspentNotes(t.symbol).length
                      : null;
                  return (
                    <button
                      key={t.symbol}
                      onClick={() => setToken(t)}
                      className={`flex-1 py-3 rounded-xl border text-sm font-medium transition-colors ${
                        token.symbol === t.symbol
                          ? "border-foreground bg-foreground text-background"
                          : "border-border/60 text-muted-foreground hover:border-foreground/30"
                      }`}
                    >
                      {t.symbol}
                      {count !== null && (
                        <span className="ml-1 opacity-60">({count})</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Amount — differs by mode */}
            {mode === "shielded" ? (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Amount
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {tiers.map((t) => {
                    const hasNote = !!selectNoteForAmount(
                      token.symbol,
                      t.amount
                    );
                    return (
                      <button
                        key={t.amount}
                        onClick={() => setTier(t)}
                        className={`py-3 rounded-xl border text-sm font-semibold transition-colors relative ${
                          tier?.amount === t.amount
                            ? "border-foreground bg-foreground text-background"
                            : hasNote
                            ? "border-border/60 text-foreground hover:border-foreground/30"
                            : "border-border/40 text-muted-foreground/50"
                        }`}
                      >
                        {t.label}
                        {!hasNote && (
                          <span className="block text-[10px] font-normal opacity-60">
                            no notes
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {tier && !selectedNote && (
                  <div className="mt-3 text-sm text-amber-600 flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4" />
                    No unspent {tier.label} notes
                  </div>
                )}
              </div>
            ) : (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Amount
                </label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={confAmount}
                    onChange={(e) => setConfAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full h-12 rounded-xl border border-input bg-background px-4 pr-16 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                    {token.symbol}
                  </span>
                </div>
                {confAmount && !confAmountParsed && (
                  <div className="mt-2 text-sm text-amber-600 flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4" />
                    Invalid amount
                  </div>
                )}
              </div>
            )}

            {/* Recipient — only for self-withdraw and confidential */}
            {(mode === "confidential" ||
              (mode === "shielded" &&
                shieldedSub === "self_withdraw")) && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  {shieldedSub === "self_withdraw"
                    ? "Withdraw to Address"
                    : "Recipient Address"}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    placeholder="G..."
                    readOnly={
                      mode === "shielded" &&
                      shieldedSub === "self_withdraw"
                    }
                    className={`w-full h-11 rounded-lg border border-input bg-background px-4 pr-11 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring ${
                      mode === "shielded" &&
                      shieldedSub === "self_withdraw"
                        ? "text-muted-foreground"
                        : ""
                    }`}
                  />
                  {mode === "confidential" && (
                    <button
                      onClick={handlePaste}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {pasted ? (
                        <Check className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <Clipboard className="h-4 w-4" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Swap toggle — self-withdraw mode only */}
            {mode === "shielded" && shieldedSub === "self_withdraw" && (
              <div className="rounded-xl border border-border/60 p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <ArrowLeftRight className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      Receive as different token
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Extra unlinkability via swap
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setEnableSwap(!enableSwap);
                    if (
                      !enableSwap &&
                      availableSwapTokens.length > 0
                    ) {
                      setSwapTokenOut(
                        availableSwapTokens[0].symbol
                      );
                    }
                  }}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    enableSwap ? "bg-indigo-600" : "bg-muted"
                  }`}
                >
                  <div
                    className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${
                      enableSwap ? "left-[22px]" : "left-0.5"
                    }`}
                  />
                </button>
              </div>
            )}

            {/* Swap token selector — self_withdraw mode only */}
            {mode === "shielded" &&
              shieldedSub === "self_withdraw" &&
              enableSwap &&
              availableSwapTokens.length > 0 && (
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground block">
                    Recipient receives
                  </label>
                  <div className="flex gap-2">
                    {availableSwapTokens.map((t) => {
                      const pair = swapPairs.find(
                        (p) => p.tokenOut === t.symbol
                      );
                      return (
                        <button
                          key={t.symbol}
                          onClick={() =>
                            setSwapTokenOut(t.symbol)
                          }
                          className={`flex-1 rounded-xl border p-3 text-left transition-colors ${
                            swapTokenOut === t.symbol
                              ? "border-indigo-300 bg-indigo-50"
                              : "border-border/60 hover:border-border"
                          }`}
                        >
                          <div className="text-sm font-medium">
                            {t.symbol}
                          </div>
                          {pair && (
                            <div className="text-xs text-indigo-600 mt-0.5">
                              ~
                              {(tier
                                ? (parseFloat(tier.amount) /
                                    Math.pow(
                                      10,
                                      token.decimals
                                    )) *
                                  pair.rate *
                                  0.95
                                : 0
                              ).toFixed(2)}{" "}
                              {t.symbol}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

            {/* Compliance status — shielded mode only */}
            {mode === "shielded" && compliance && (
              <div
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm ${
                  compliance.status === "compliant"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-amber-50 text-amber-700"
                }`}
              >
                <ShieldCheck className="h-4 w-4" />
                {compliance.status === "compliant"
                  ? "ASP Verified"
                  : "ASP Pending"}
              </div>
            )}

            <Button
              className="w-full"
              disabled={!canReview}
              onClick={() => setState("review")}
            >
              Review
            </Button>
          </div>
        )}

        {state === "review" && (
          <div className="space-y-5">
            <div className="rounded-xl border border-border/60 p-5 space-y-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-semibold">
                  {mode === "shielded"
                    ? selectedNote?.amountDisplay
                    : confAmountParsed
                    ? formatTokenAmount(
                        confAmountParsed,
                        token.decimals,
                        token.symbol
                      )
                    : ""}
                </span>
              </div>

              {/* Show "To" only for non-transfer flows */}
              {!(
                mode === "shielded" && shieldedSub === "transfer"
              ) && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">To</span>
                  <span className="font-mono text-xs">
                    {recipient.slice(0, 8)}...{recipient.slice(-6)}
                  </span>
                </div>
              )}

              {mode === "shielded" && selectedNote && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    Note ID
                  </span>
                  <span className="font-mono text-xs">
                    {selectedNote.id}
                  </span>
                </div>
              )}

              {mode === "shielded" &&
                shieldedSub === "self_withdraw" &&
                enableSwap &&
                selectedPair && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      Swap
                    </span>
                    <span className="flex items-center gap-1 text-indigo-600 font-medium">
                      <ArrowLeftRight className="h-3.5 w-3.5" />
                      {token.symbol} → {swapTokenOut}
                    </span>
                  </div>
                )}

              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Mode</span>
                <span className="flex items-center gap-1 text-emerald-600">
                  {mode === "shielded" ? (
                    shieldedSub === "transfer" ? (
                      <>
                        <Share2 className="h-3.5 w-3.5" />
                        Bearer Note Transfer
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="h-3.5 w-3.5" />
                        ZK Proof
                        {enableSwap ? " + Swap" : ""}
                      </>
                    )
                  ) : (
                    <>
                      <Zap className="h-3.5 w-3.5" />
                      Confidential Transfer
                    </>
                  )}
                </span>
              </div>
            </div>

            {/* Transfer mode: explain no on-chain tx */}
            {mode === "shielded" && shieldedSub === "transfer" && (
              <div className="flex items-start gap-2.5 px-4 py-3 rounded-lg bg-[#0ecb81]/8 border border-[#0ecb81]/20">
                <Shield className="h-4 w-4 text-[#0ecb81] shrink-0 mt-0.5" />
                <p className="text-xs font-mono text-[#848e9c] leading-relaxed">
                  No on-chain transaction will be submitted. A claim
                  link will be generated for your recipient.
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setState("form")}
              >
                Back
              </Button>
              <Button className="flex-1" onClick={handleSend}>
                {mode === "shielded" &&
                shieldedSub === "transfer" ? (
                  <>
                    <Link2 className="h-4 w-4 mr-2" />
                    Generate Claim Link
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    {mode === "shielded"
                      ? "Withdraw"
                      : "Send"}
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {state === "processing" && (
          <div className="py-12 space-y-6">
            <div className="flex justify-center">
              <div className="h-16 w-16 rounded-full bg-foreground/5 flex items-center justify-center">
                <Loader2 className="h-8 w-8 text-foreground animate-spin" />
              </div>
            </div>
            <div className="space-y-2">
              {activeSteps
                .slice(0, stepIndex + 1)
                .map((msg, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-2 text-sm ${
                      i === stepIndex
                        ? "text-foreground font-medium"
                        : "text-muted-foreground"
                    }`}
                  >
                    {i < stepIndex ? (
                      <Check className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    )}
                    {msg}
                  </div>
                ))}
            </div>
          </div>
        )}

        {state === "success" && (
          <>
            {mode === "shielded" && shieldedSub === "transfer" ? (
              <BearerNoteSuccessScreen
                claimLink={claimLink}
                noteString={selectedNote?.noteString ?? ""}
                amountDisplay={selectedNote?.amountDisplay ?? ""}
              />
            ) : (
              <WithdrawSuccessScreen
                txHash={txHash}
                noteId={selectedNote?.id ?? ""}
                mode={mode}
              />
            )}
          </>
        )}

        {state === "error" && (
          <div className="py-12 text-center space-y-5">
            <div className="h-16 w-16 rounded-full bg-red-100 flex items-center justify-center mx-auto">
              <AlertTriangle className="h-8 w-8 text-red-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">Failed</h2>
              <p className="text-sm text-destructive mt-2">{error}</p>
            </div>
            <Button
              onClick={() => setState("form")}
              className="w-full"
            >
              Try Again
            </Button>
          </div>
        )}
      </div>
    </AppShell>
  );
}
