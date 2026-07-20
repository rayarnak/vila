import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { createHash } from "crypto";

/* ── Postgres pool (lazy) ───────────────────────────────── */

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return pool;
}

async function ensureTable() {
  const db = getPool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS vaults (
      identifier_hash TEXT PRIMARY KEY,
      encrypted_vault TEXT NOT NULL,
      auth_hash TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

let tableReady = false;

/* ── Validation ─────────────────────────────────────────── */

const HEX64 = /^[a-f0-9]{64}$/;
const MAX_VAULT_SIZE = 5 * 1024 * 1024; // 5 MB

/* ── Route ──────────────────────────────────────────────── */

export async function POST(req: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "Vault not configured" },
      { status: 503 }
    );
  }

  let body: { action?: string; identifierHash?: string; encryptedVault?: string; authToken?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { action, identifierHash } = body;

  if (!identifierHash || !HEX64.test(identifierHash)) {
    return NextResponse.json(
      { error: "identifierHash must be 64-char hex" },
      { status: 400 }
    );
  }

  if (!tableReady) {
    await ensureTable();
    tableReady = true;
  }

  const db = getPool();

  if (action === "save") {
    const { encryptedVault, authToken } = body;
    if (!encryptedVault || encryptedVault.length > MAX_VAULT_SIZE) {
      return NextResponse.json(
        { error: "encryptedVault missing or too large" },
        { status: 400 }
      );
    }
    if (!authToken || !HEX64.test(authToken)) {
      return NextResponse.json(
        { error: "authToken required (64-char hex)" },
        { status: 400 }
      );
    }

    const authHash = createHash("sha256").update(authToken).digest("hex");

    // Check if row already exists
    const existing = await db.query(
      `SELECT auth_hash FROM vaults WHERE identifier_hash = $1`,
      [identifierHash]
    );

    if (existing.rows.length > 0) {
      // Verify auth before allowing overwrite
      if (existing.rows[0].auth_hash !== authHash) {
        return NextResponse.json(
          { error: "Authentication failed" },
          { status: 403 }
        );
      }
      await db.query(
        `UPDATE vaults SET encrypted_vault = $2, updated_at = NOW() WHERE identifier_hash = $1`,
        [identifierHash, encryptedVault]
      );
    } else {
      // First save — store auth_hash alongside vault
      await db.query(
        `INSERT INTO vaults (identifier_hash, encrypted_vault, auth_hash, updated_at)
         VALUES ($1, $2, $3, NOW())`,
        [identifierHash, encryptedVault, authHash]
      );
    }

    return NextResponse.json({ ok: true });
  }

  if (action === "load") {
    const result = await db.query(
      `SELECT encrypted_vault, updated_at FROM vaults WHERE identifier_hash = $1`,
      [identifierHash]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ found: false });
    }

    const row = result.rows[0];
    return NextResponse.json({
      found: true,
      encryptedVault: row.encrypted_vault,
      updatedAt: row.updated_at,
    });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
