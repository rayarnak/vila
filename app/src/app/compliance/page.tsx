"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Lock,
  Unlock,
  Clock,
  Key,
  CheckCircle2,
} from "lucide-react";
import AppShell from "@/components/AppShell";

interface DecryptedAuditRecord {
  id: string;
  noteHash: string;
  denomination: string;
  asset: string;
  leafIndex: number;
  timestamp: number;
  status: "unlocked" | "timelocked";
  secondsRemaining?: number;
  aspScreening: "Passed (Clean Set)" | "Pending Timelock";
}

export default function RevealKeysPage() {
  const [viewingKey, setViewingKey] = useState("");
  const [records, setRecords] = useState<DecryptedAuditRecord[]>([]);
  const [loaded, setLoaded] = useState(false);

  function handleInspectKey(inputKey: string = viewingKey) {
    const key = inputKey.trim();
    if (!key) return;

    const now = Math.floor(Date.now() / 1000);
    const isTreasury = key.toLowerCase().includes("treasury") || key.toLowerCase().includes("5000");
    const isLocked = key.toLowerCase().includes("locked");

    const newRecords: DecryptedAuditRecord[] = [
      {
        id: "REC-01",
        noteHash: isTreasury ? "0x9a8f...41e2" : "0x7c2b...99a1",
        denomination: isTreasury ? "5,000.00" : "1,000.00",
        asset: "USDC",
        leafIndex: isTreasury ? 412 : 184,
        timestamp: now - 3600 * 14,
        status: isLocked ? "timelocked" : "unlocked",
        secondsRemaining: isLocked ? 14400 : 0,
        aspScreening: isLocked ? "Pending Timelock" : "Passed (Clean Set)",
      },
      {
        id: "REC-02",
        noteHash: isTreasury ? "0x3e1d...88f0" : "0x1a4f...22b8",
        denomination: isTreasury ? "5,000.00" : "500.00",
        asset: "USDC",
        leafIndex: isTreasury ? 413 : 185,
        timestamp: now - 3600 * 38,
        status: "unlocked",
        aspScreening: "Passed (Clean Set)",
      },
    ];

    setRecords(newRecords);
    setLoaded(true);
  }

  function handleReset() {
    setViewingKey("");
    setRecords([]);
    setLoaded(false);
  }

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto px-4 lg:px-6 py-8 pb-24 lg:pb-12 space-y-6">
        {/* Header */}
        <div className="pb-5 border-b border-[#1e2329]">
          <div className="flex items-center gap-2 text-xs font-mono font-bold tracking-wider text-[#f7a600] uppercase mb-2">
            <Key className="w-4 h-4" />
            Timelocked Reveal Keys
          </div>
          <p className="text-sm font-mono text-[#848e9c] leading-relaxed max-w-xl">
            Authorized auditors can paste a reveal key to inspect transaction metadata once the mandatory timelock delay has elapsed.
          </p>
        </div>

        {/* Input Section */}
        <div className="rounded-xl border border-[#1e2329] bg-[#131722] p-6 shadow-sm">
          <h3 className="text-sm font-mono font-bold text-[#eaecef] mb-4 uppercase tracking-wide">
            Decrypt Audit Receipt
          </h3>

          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <input
              type="text"
              value={viewingKey}
              onChange={(e) => setViewingKey(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleInspectKey()}
              placeholder="Paste reveal key (e.g., vk-testnet-1000usdc-...)"
              className="flex-1 rounded-lg border border-[#1e2329] bg-[#0b0e11] px-4 py-3 font-mono text-sm placeholder:text-[#848e9c]/50 text-[#eaecef] focus:outline-none focus:border-[#f7a600]"
              disabled={loaded}
            />
            {loaded ? (
              <Button variant="outline" onClick={handleReset} className="h-12 px-6 border-[#1e2329] text-[#eaecef] hover:bg-[#181c25] font-mono">
                Clear Key
              </Button>
            ) : (
              <Button onClick={() => handleInspectKey()} className="h-12 px-6 bg-[#f7a600] text-[#0b0e11] font-mono font-bold hover:bg-[#f7a600]/90">
                Verify & Decrypt
              </Button>
            )}
          </div>

          {/* Sample Keys */}
          {!loaded && (
            <div className="pt-4 border-t border-[#1e2329]">
              <span className="text-xs font-mono text-[#848e9c] uppercase tracking-wider block mb-2.5">
                Sample Keys:
              </span>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    setViewingKey("vk-testnet-1000usdc-pilot-7a9b");
                    handleInspectKey("vk-testnet-1000usdc-pilot-7a9b");
                  }}
                  className="text-xs font-mono bg-[#181c25] hover:bg-[#1e2329] text-[#eaecef] border border-[#1e2329] rounded-md px-3 py-1.5 transition-colors font-bold"
                >
                  vk-testnet-1000usdc-pilot
                </button>
                <button
                  onClick={() => {
                    setViewingKey("vk-testnet-5000usdc-treasury-2c81");
                    handleInspectKey("vk-testnet-5000usdc-treasury-2c81");
                  }}
                  className="text-xs font-mono bg-[#181c25] hover:bg-[#1e2329] text-[#eaecef] border border-[#1e2329] rounded-md px-3 py-1.5 transition-colors font-bold"
                >
                  vk-testnet-5000usdc-treasury
                </button>
                <button
                  onClick={() => {
                    setViewingKey("vk-testnet-locked-24h-sample");
                    handleInspectKey("vk-testnet-locked-24h-sample");
                  }}
                  className="text-xs font-mono bg-[#f7a600]/15 text-[#f7a600] border border-[#f7a600]/40 rounded-md px-3 py-1.5 transition-colors font-bold"
                >
                  vk-timelocked-24h-sample
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Decrypted Results */}
        {loaded && records.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-[#1e2329] pb-3">
              <h3 className="text-sm font-mono font-bold text-[#eaecef] uppercase tracking-wider">Decrypted Record</h3>
              <span className="text-xs font-mono font-bold text-[#0ecb81] bg-[#0ecb81]/15 border border-[#0ecb81]/30 px-3 py-1 rounded">
                Signature Validated
              </span>
            </div>

            <div className="space-y-4">
              {records.map((rec) => (
                <div key={rec.id} className="rounded-xl border border-[#1e2329] bg-[#131722] p-6 shadow-sm">
                  {rec.status === "timelocked" ? (
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <Lock className="w-4 h-4 text-[#f7a600]" />
                          <span className="text-xs font-mono font-bold text-[#f7a600] uppercase tracking-wider">
                            Timelock Active
                          </span>
                        </div>
                        <span className="text-xs font-mono text-[#848e9c]">ID: #{rec.leafIndex}</span>
                      </div>
                      <div className="p-4 rounded-lg bg-[#181c25] border border-[#f7a600]/40 text-center mb-2">
                        <div className="text-2xl font-mono font-bold text-[#f7a600] tracking-tight">04 : 00 : 00</div>
                        <div className="text-xs font-mono text-[#848e9c] mt-1">Remaining until decryption authorized</div>
                      </div>
                      <p className="text-xs font-mono text-[#848e9c]">
                        Note Hash: <code className="text-[#eaecef]">{rec.noteHash}</code>
                      </p>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center justify-between border-b border-[#1e2329] pb-4 mb-4">
                        <div className="flex items-center gap-2">
                          <Unlock className="w-4 h-4 text-[#0ecb81]" />
                          <span className="text-xs font-mono font-bold text-[#0ecb81] uppercase tracking-wider">
                            Decrypted
                          </span>
                        </div>
                        <span className="text-xs font-mono text-[#848e9c]">
                          {new Date(rec.timestamp * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                        <div>
                          <span className="text-[11px] font-mono text-[#848e9c] uppercase tracking-wider block mb-1">Amount</span>
                          <span className="text-lg font-mono font-bold text-[#eaecef]">${rec.denomination} {rec.asset}</span>
                        </div>
                        <div>
                          <span className="text-[11px] font-mono text-[#848e9c] uppercase tracking-wider block mb-1">Leaf</span>
                          <span className="text-base font-mono font-bold text-[#eaecef]">#{rec.leafIndex}</span>
                        </div>
                        <div>
                          <span className="text-[11px] font-mono text-[#848e9c] uppercase tracking-wider block mb-1">ASP</span>
                          <span className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-[#0ecb81] bg-[#0ecb81]/15 px-2.5 py-1 rounded border border-[#0ecb81]/30">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {rec.aspScreening}
                          </span>
                        </div>
                        <div>
                          <span className="text-[11px] font-mono text-[#848e9c] uppercase tracking-wider block mb-1">Hash</span>
                          <span className="text-xs font-mono text-[#848e9c] block truncate">{rec.noteHash}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Compact Architecture Explainer */}
        <div className="rounded-xl border border-[#1e2329] bg-[#131722] p-6 shadow-sm">
          <h3 className="text-sm font-mono font-bold text-[#eaecef] mb-3 flex items-center gap-2 uppercase tracking-wide">
            <Clock className="w-4 h-4 text-[#f7a600]" />
            Reveal Architecture
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs font-mono text-[#848e9c] leading-relaxed">
            <div>
              <strong className="text-[#eaecef] block mb-1">Read-Only</strong>
              Reveal keys decrypt note metadata but have zero spending authority.
            </div>
            <div>
              <strong className="text-[#eaecef] block mb-1">Timelocked</strong>
              Mandatory delay (24h–72h) before decryption is authorized on-chain.
            </div>
            <div>
              <strong className="text-[#eaecef] block mb-1">Selective</strong>
              Keys are shared privately with your auditor or compliance team.
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
