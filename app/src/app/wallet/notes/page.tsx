"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Shield,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import {
  isWalletInitialized,
  isUnlocked,
  getUnspentNotes,
  getAllActivity,
  type StoredNote,
} from "@/lib/noteStore";

function NoteRow({ note }: { note: StoredNote }) {
  const isSpent = note.status === "spent";
  const isShared = note.status === "shared";

  return (
    <div className="flex items-center justify-between p-3.5 rounded-lg bg-[#181c25] border border-[#1e2329]">
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-sm font-mono font-bold text-[#eaecef]">
          {note.amountDisplay}
        </span>
        <span
          className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
            isSpent
              ? "bg-[#848e9c]/15 text-[#848e9c] border border-[#848e9c]/30"
              : isShared
              ? "bg-[#f7a600]/15 text-[#f7a600] border border-[#f7a600]/30"
              : "bg-[#0ecb81]/15 text-[#0ecb81] border border-[#0ecb81]/30"
          }`}
        >
          {isSpent ? "SPENT" : isShared ? "SHARED" : "CLEAN NOTE"}
        </span>
      </div>
      <span className="text-xs font-mono text-[#848e9c] shrink-0 ml-3">
        {note.id}
      </span>
    </div>
  );
}

function NotesContent() {
  const [unspent, setUnspent] = useState<StoredNote[]>([]);
  const [spent, setSpent] = useState<StoredNote[]>([]);
  const [spentExpanded, setSpentExpanded] = useState(false);

  const refresh = useCallback(() => {
    setUnspent(getUnspentNotes());
    const all = getAllActivity();
    setSpent(all.filter((n) => n.status === "spent"));
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, [refresh]);

  return (
    <div className="max-w-2xl mx-auto px-4 lg:px-6 py-6 space-y-6 pb-24 lg:pb-6">
      {/* Back header */}
      <div className="flex items-center gap-3">
        <Link
          href="/wallet"
          className="h-9 w-9 rounded-lg bg-[#181c25] border border-[#1e2329] flex items-center justify-center text-[#848e9c] hover:text-[#eaecef] hover:border-[#f7a600]/40 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-lg font-mono font-bold text-[#eaecef] tracking-tight">
            Shielded Notes
          </h1>
          <p className="text-xs font-mono text-[#848e9c]">
            {unspent.length} unspent note{unspent.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Unspent Notes */}
      <div className="rounded-xl border border-[#1e2329] bg-[#131722] shadow-sm">
        <div className="px-5 py-4 border-b border-[#1e2329] flex items-center gap-2">
          <Shield className="h-4 w-4 text-[#0ecb81]" />
          <h3 className="text-xs font-mono font-bold text-[#eaecef] uppercase tracking-wider">
            Unspent Notes
          </h3>
        </div>
        <div className="p-4 space-y-2">
          {unspent.length === 0 ? (
            <p className="text-xs font-mono text-[#848e9c] text-center py-6">
              No active notes in local storage
            </p>
          ) : (
            unspent.map((note) => <NoteRow key={note.id} note={note} />)
          )}
        </div>
      </div>

      {/* Spent Notes (collapsible) */}
      {spent.length > 0 && (
        <div className="rounded-xl border border-[#1e2329] bg-[#131722] shadow-sm">
          <button
            onClick={() => setSpentExpanded((v) => !v)}
            className="w-full px-5 py-4 flex items-center justify-between hover:bg-[#181c25] transition-colors rounded-xl"
          >
            <h3 className="text-xs font-mono font-bold text-[#848e9c] uppercase tracking-wider">
              Spent Notes ({spent.length})
            </h3>
            {spentExpanded ? (
              <ChevronUp className="h-4 w-4 text-[#848e9c]" />
            ) : (
              <ChevronDown className="h-4 w-4 text-[#848e9c]" />
            )}
          </button>
          {spentExpanded && (
            <div className="p-4 pt-0 space-y-2 border-t border-[#1e2329]">
              {spent.map((note) => (
                <NoteRow key={note.id} note={note} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function NotesPage() {
  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    setReady(true);
    if (isWalletInitialized() && isUnlocked()) {
      setAuthenticated(true);
    }
  }, []);

  if (!ready) return <AppShell><div className="min-h-screen" /></AppShell>;

  if (!authenticated) {
    return (
      <AppShell>
        <div className="max-w-2xl mx-auto px-4 py-12 text-center">
          <p className="text-sm font-mono text-[#848e9c]">
            Please <Link href="/wallet" className="text-[#f7a600] hover:underline">unlock your wallet</Link> first.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <NotesContent />
    </AppShell>
  );
}
