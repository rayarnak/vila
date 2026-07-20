"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Shield,
  CheckCircle2,
  XCircle,
  Hash,
  Binary,
  Search,
  ArrowRight,
  Activity,
  Lock,
  Eye,
} from "lucide-react";
import Link from "next/link";
import AppShell from "@/components/AppShell";

interface ProofVerification {
  txHash: string;
  timestamp: number;
  verified: boolean;
  publicInputs: {
    root: string;
    nullifierHash: string;
    recipient: string;
    relayer: string;
    fee: string;
    refund: string;
  };
  proof: {
    a: string;
    b: string;
    c: string;
  };
  pairingEquation: string;
  gasUsed: string;
}

/**
 * Generate deterministic demo verifications from a seed.
 */
function generateDemoVerifications(): ProofVerification[] {
  const now = Date.now();
  return [
    {
      txHash: "a3f8c1d2e5b7...9f4a",
      timestamp: now - 120_000,
      verified: true,
      publicInputs: {
        root: "0x1a2b3c4d5e6f7890abcdef1234567890abcdef1234567890abcdef12345678",
        nullifierHash: "0x9f8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a39281706f5e4d3c2b1a0",
        recipient: "GBZX...YKQF (hashed to BN254 field)",
        relayer: "GCRE...L4YR (hashed to BN254 field)",
        fee: "50 bps (0.5%)",
        refund: "0",
      },
      proof: {
        a: "G1(0x2a89...c3f1, 0x1b7e...d402) — 64 bytes",
        b: "G2(0x0f3a...8b21, 0x4c5d...e6f7, 0x8a9b...0c1d, 0x2e3f...4a5b) — 128 bytes",
        c: "G1(0x7d8e...9f0a, 0x1b2c...3d4e) — 64 bytes",
      },
      pairingEquation: "e(-A, B) · e(α, β) · e(vk_x, γ) · e(C, δ) = 1",
      gasUsed: "~42M instructions",
    },
    {
      txHash: "7b2e4f6a8c0d...3e1f",
      timestamp: now - 3_600_000,
      verified: true,
      publicInputs: {
        root: "0x4f5e6d7c8b9a0f1e2d3c4b5a69780f1e2d3c4b5a69780f1e2d3c4b5a697801",
        nullifierHash: "0x2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c",
        recipient: "GAXN...PQ2R (hashed to BN254 field)",
        relayer: "GCRE...L4YR (hashed to BN254 field)",
        fee: "50 bps (0.5%)",
        refund: "0",
      },
      proof: {
        a: "G1(0x5c6d...7e8f, 0x9a0b...1c2d) — 64 bytes",
        b: "G2(0x3e4f...5a6b, 0x7c8d...9e0f, 0x1a2b...3c4d, 0x5e6f...7a8b) — 128 bytes",
        c: "G1(0x0d1e...2f3a, 0x4b5c...6d7e) — 64 bytes",
      },
      pairingEquation: "e(-A, B) · e(α, β) · e(vk_x, γ) · e(C, δ) = 1",
      gasUsed: "~41M instructions",
    },
  ];
}

export default function ExplorerPage() {
  const [verifications, setVerifications] = useState<ProofVerification[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [stats, setStats] = useState({ depositCount: 0, denominationXLM: 0 });

  useEffect(() => {
    setVerifications(generateDemoVerifications());
    fetch("/api/tree")
      .then((r) => r.json())
      .then((data) =>
        setStats({
          depositCount: data.depositCount || data.leafCount || 0,
          denominationXLM: data.denominationXLM || 100,
        })
      )
      .catch(() => {});
  }, []);

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto px-4 lg:px-6 py-6 pb-24 lg:pb-6">
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-emerald-200/60 bg-emerald-50/50 text-xs text-emerald-700 mb-4">
            <Shield className="w-3 h-3" />
            ZK Proof Verification
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-3">
            Proof Explorer
          </h1>
          <p className="text-muted-foreground leading-relaxed">
            Every withdrawal on Vila is verified on-chain using a Groth16 zero-knowledge proof.
            This page shows exactly what the Soroban verifier checks — the pairing equation,
            public inputs, and proof points. Nothing is hidden.
          </p>
        </div>

        {/* Pool stats bar */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          <div className="rounded-lg border border-border/50 p-3 text-center">
            <div className="text-lg font-bold">{stats.depositCount}</div>
            <div className="text-xs text-muted-foreground">Total deposits</div>
          </div>
          <div className="rounded-lg border border-border/50 p-3 text-center">
            <div className="text-lg font-bold">{verifications.length}</div>
            <div className="text-xs text-muted-foreground">Verified proofs</div>
          </div>
          <div className="rounded-lg border border-border/50 p-3 text-center">
            <div className="text-lg font-bold">BN254</div>
            <div className="text-xs text-muted-foreground">Curve</div>
          </div>
        </div>

        {/* How verification works */}
        <div className="rounded-xl border border-border/50 p-6 mb-8">
          <h2 className="text-base font-semibold mb-4">How Groth16 Verification Works</h2>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              The on-chain verifier receives a proof <code className="font-mono bg-muted px-1 rounded text-xs">(A, B, C)</code> and
              public inputs <code className="font-mono bg-muted px-1 rounded text-xs">(root, nullifierHash, recipient, relayer, fee, refund)</code>.
              It checks the following pairing equation:
            </p>
            <div className="bg-muted/50 rounded-lg p-4 font-mono text-xs text-center border border-border/30">
              e(-A, B) · e(α, β) · e(vk_x, γ) · e(C, δ) = 1<sub>GT</sub>
            </div>
            <p>Where:</p>
            <ul className="list-disc ml-5 space-y-1 text-xs">
              <li><strong>A, B, C</strong> — proof points from the prover (G1, G2, G1)</li>
              <li><strong>α, β, γ, δ</strong> — verification key points (embedded in contract at deploy time)</li>
              <li><strong>vk_x</strong> — linear combination of public inputs with IC points: <code className="font-mono bg-muted px-1 rounded">IC[0] + Σ(input[i] · IC[i+1])</code></li>
            </ul>
            <p>
              This uses Stellar&apos;s native BN254 host functions:
              <code className="font-mono bg-muted px-1 rounded text-xs ml-1">bn254_g1_add</code>,
              <code className="font-mono bg-muted px-1 rounded text-xs ml-1">bn254_g1_mul</code>,
              <code className="font-mono bg-muted px-1 rounded text-xs ml-1">bn254_multi_pairing_check</code>.
            </p>
          </div>
        </div>

        {/* Verified proofs */}
        <h2 className="text-lg font-semibold mb-4">Recent Verified Proofs</h2>
        <div className="space-y-4">
          {verifications.map((v, i) => (
            <div key={i} className="rounded-xl border border-border/50 overflow-hidden">
              {/* Header */}
              <button
                onClick={() => setExpanded(expanded === i ? null : i)}
                className="w-full flex items-center justify-between p-5 hover:bg-muted/20 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${v.verified ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"}`}>
                    {v.verified ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                  </div>
                  <div>
                    <div className="text-sm font-medium font-mono">{v.txHash}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(v.timestamp).toLocaleString()} · {v.gasUsed}
                    </div>
                  </div>
                </div>
                <div className={`text-xs font-medium px-2.5 py-1 rounded-full ${v.verified ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                  {v.verified ? "Verified" : "Failed"}
                </div>
              </button>

              {/* Expanded detail */}
              {expanded === i && (
                <div className="border-t border-border/30 p-5 space-y-5 bg-muted/10">
                  {/* Pairing equation */}
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      Verification Equation
                    </div>
                    <div className="bg-background rounded-lg p-3 font-mono text-sm text-center border border-border/30">
                      {v.pairingEquation}
                    </div>
                    <div className="text-center mt-1.5">
                      <span className={`text-xs font-medium ${v.verified ? "text-emerald-600" : "text-red-600"}`}>
                        {v.verified ? "✓ Equation holds — proof is valid" : "✗ Equation failed"}
                      </span>
                    </div>
                  </div>

                  {/* Public inputs */}
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      Public Inputs (visible on-chain)
                    </div>
                    <div className="space-y-2">
                      {Object.entries(v.publicInputs).map(([key, val]) => (
                        <div key={key} className="flex items-start gap-3 bg-background rounded-lg p-3 border border-border/30">
                          <div className="text-xs font-medium text-muted-foreground w-28 shrink-0 pt-0.5 capitalize">
                            {key.replace(/([A-Z])/g, " $1").trim()}
                          </div>
                          <div className="font-mono text-xs text-foreground break-all">{val}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Proof points */}
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      Proof Points (A, B, C)
                    </div>
                    <div className="space-y-2">
                      {Object.entries(v.proof).map(([key, val]) => (
                        <div key={key} className="flex items-start gap-3 bg-background rounded-lg p-3 border border-border/30">
                          <div className="text-xs font-medium text-muted-foreground w-12 shrink-0 pt-0.5 uppercase">
                            π_{key}
                          </div>
                          <div className="font-mono text-xs text-foreground break-all">{val}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* What's hidden */}
                  <div className="rounded-lg border border-amber-200/60 bg-amber-50/30 p-4">
                    <div className="flex items-start gap-2">
                      <Lock className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                      <div className="text-xs text-amber-800">
                        <p className="font-medium mb-1">What stays private</p>
                        <p className="text-amber-700">
                          The proof reveals nothing about: which deposit is being withdrawn (the nullifier and secret are private inputs),
                          the Merkle path proving membership, or any link between the depositor and recipient.
                          Only the root, nullifier hash, and recipient are public — and the nullifier hash cannot be reversed to find the deposit.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Demo note */}
        <div className="mt-8 flex items-start gap-2 text-xs text-muted-foreground">
          <Activity className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            These are demo verifications showing the structure of on-chain proof data.
            In production, this page would index real Soroban contract events and display
            actual proof verifications from the pool contract.
          </span>
        </div>
      </div>
    </AppShell>
  );
}
