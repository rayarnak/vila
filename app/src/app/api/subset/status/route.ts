import { NextRequest, NextResponse } from "next/server";
import {
  isInSubset,
  getSubsetProof,
  getSubsetTreeInfo,
} from "@/lib/subsetTree";

export const dynamic = "force-dynamic";

/**
 * GET /api/subset/status?commitment=<hex>
 *
 * Returns whether a specific commitment is in the approved subset,
 * plus its Merkle proof if approved.
 */
export async function GET(req: NextRequest) {
  const commitment = req.nextUrl.searchParams.get("commitment");

  if (
    !commitment ||
    !/^(0x)?[0-9a-f]{1,64}$/i.test(commitment)
  ) {
    return NextResponse.json(
      { error: "Missing or invalid commitment query parameter" },
      { status: 400 }
    );
  }

  try {
    const approved = isInSubset(commitment);

    if (!approved) {
      const info = await getSubsetTreeInfo();
      return NextResponse.json({
        commitment,
        approved: false,
        status: info.size === 0 ? "not_screened" : "pending_review",
        subsetSize: info.size,
      });
    }

    const proof = await getSubsetProof(commitment);
    const info = await getSubsetTreeInfo();

    return NextResponse.json({
      commitment,
      approved: true,
      status: "compliant",
      proof,
      subsetRoot: info.root,
      subsetSize: info.size,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
