import { NextRequest, NextResponse } from "next/server";
import {
  getSubsetTreeInfo,
  addToSubset,
} from "@/lib/subsetTree";

export const dynamic = "force-dynamic";

/**
 * GET /api/subset — Returns the current subset tree state
 * (root, size, all approved commitments).
 */
export async function GET() {
  try {
    const info = await getSubsetTreeInfo();
    return NextResponse.json(info);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/subset — ASP endpoint: add a commitment to the approved subset.
 *
 * For demo: auto-approves all commitments (simulates a permissive ASP).
 * In production: would check against OFAC/sanctions lists before approving.
 *
 * Body: { commitment: "hex string" }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const commitment = body?.commitment;

    if (
      !commitment ||
      typeof commitment !== "string" ||
      !/^(0x)?[0-9a-f]{1,64}$/i.test(commitment)
    ) {
      return NextResponse.json(
        { error: "Invalid commitment hex" },
        { status: 400 }
      );
    }

    // ── Demo ASP: auto-approve all commitments ──
    // In production, this would:
    // 1. Check commitment against OFAC SDN list
    // 2. Check against known sanctioned/stolen fund addresses
    // 3. Apply risk scoring
    // 4. Only add to subset if screening passes

    const added = addToSubset(commitment);
    const info = await getSubsetTreeInfo();

    return NextResponse.json({
      approved: true,
      added,
      root: info.root,
      size: info.size,
      screening: "demo-auto-approve",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
