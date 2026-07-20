import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const DEFAULT_POOL =
  process.env.NEXT_PUBLIC_POOL_CONTRACT_ID ??
  "CA267LBV4MGWNORZ3TAPVSPKJIXNEBBL3GHPBYONUTQHQDBOLGKKD4WR";

const ZEROS: string[] = [
  "0000000000000000000000000000000000000000000000000000000000000000",
  "2098f5fb9e239eab3ceac3f27b81e481dc3124d55ffed523a839ee8446b64864",
  "1069673dcdb12263df301a6ff584a7ec261a44cb9dc68df067a4774460b1f1e1",
  "18f43331537ee2af2e3d758d50f72106467c6eea50371dd528d57eb2b856d238",
  "07f9d837cb17b0d36320ffe93ba52345f1b728571a568265caac97559dbc952a",
  "2b94cf5e8746b3f5c9631f4c5df32907a699c58c94b2ad4d7b5cec1639183f55",
  "2dee93c5a666459646ea7d22cca9e1bcfed71e6951b953611d11dda32ea09d78",
  "078295e5a22b84e982cf601eb639597b8b0515a88cb5ac7fa8a4aabe3c87349d",
  "2fa5e5f18f6027a6501bec864564472a616b2e274a41211a444cbe3a99f3cc61",
  "0e884376d0d8fd21ecb780389e941f66e45e7acce3e228ab3e2156a614fcd747",
  "1b7201da72494f1e28717ad1a52eb469f95892f957713533de6175e5da190af2",
  "1f8d8822725e36385200c0b201249819a6e6e1e4650808b5bebc6bface7d7636",
  "2c5d82f66c914bafb9701589ba8cfcfb6162b0a12acf88a8d0879a0471b5f85a",
  "14c54148a0940bb820957f5adf3fa1134ef5c4aaa113f4646458f270e0bfbfd0",
  "190d33b12f986f961e10c0ee44d8b9af11be25588cad89d416118e4bf4ebe80c",
  "22f98aa9ce704152ac17354914ad73ed1167ae6596af510aa5b3649325e06c92",
  "2a7c7c9b6ce5880b9f6f228d72bf6a575a526f29c66ecceef8b753d38bba7323",
  "2e8186e558698ec1c67af9c14d463ffc470043c9c2988b954d75dd643f36b992",
  "0f57c5571e9a4eab49e2c8cf050dae948aef6ead647392273546249d1c1ff10f",
  "1830ee67b5fb554ad5f63d4388800e1cfe78e310697d46e43c9ce36134f72cca",
  "2134e76ac5d21aab186c2be1dd8f84ee880a1e46eaf712f9d371b6df22191f3e",
];

/**
 * GET /api/tree/verify — Server-side check: which partial tree sizes match historical roots?
 * This tells us exactly where our commitment ordering diverges from on-chain.
 */
export async function GET(req: NextRequest) {
  const poolId = req.nextUrl.searchParams.get("poolId") || DEFAULT_POOL;

  // Fetch tree state + commitments from our own APIs
  const baseUrl = req.nextUrl.origin;
  const [treeRes, commRes] = await Promise.all([
    fetch(`${baseUrl}/api/tree?poolId=${poolId}`, { cache: "no-store" }),
    fetch(`${baseUrl}/api/commitments?poolId=${poolId}`, { cache: "no-store" }),
  ]);
  const treeState = await treeRes.json();
  const commData = await commRes.json();
  const commitments: string[] = commData.commitments;
  const historicalRoots: string[] = treeState.historicalRoots ?? [];

  // Build Poseidon
  const circomlibjs = await import("circomlibjs");
  const poseidon = await circomlibjs.buildPoseidon();
  const hash = (inputs: bigint[]): bigint => {
    const h = poseidon(inputs);
    return poseidon.F.toObject(h);
  };

  const zeroValues = ZEROS.map((z) => BigInt("0x" + z));
  const depth = 20;

  function buildTreeRoot(leaves: bigint[]): bigint {
    let currentLevel = new Map<number, bigint>();
    for (let i = 0; i < leaves.length; i++) {
      currentLevel.set(i, leaves[i]);
    }
    for (let level = 0; level < depth; level++) {
      const nextLevel = new Map<number, bigint>();
      const parents = new Set<number>();
      for (const k of currentLevel.keys()) parents.add(k >> 1);
      for (const pi of parents) {
        const l = currentLevel.get(pi * 2) ?? zeroValues[level];
        const r = currentLevel.get(pi * 2 + 1) ?? zeroValues[level];
        nextLevel.set(pi, hash([l, r]));
      }
      currentLevel = nextLevel;
    }
    return currentLevel.get(0) ?? zeroValues[depth];
  }

  const knownRoots = new Set(historicalRoots.filter((r) => r !== "0".repeat(64)));
  knownRoots.add(treeState.currentRoot);

  const allLeaves = commitments.map((h: string) => BigInt("0x" + h));
  const results: { size: number; root: string; match: boolean; matchIndex: number }[] = [];

  for (let size = 1; size <= allLeaves.length; size++) {
    const root = buildTreeRoot(allLeaves.slice(0, size));
    const rootHex = root.toString(16).padStart(64, "0");
    const match = knownRoots.has(rootHex);
    const matchIndex = historicalRoots.indexOf(rootHex);
    results.push({ size, root: rootHex, match, matchIndex });
  }

  // Find first mismatch
  const firstMismatch = results.find((r) => !r.match && r.size <= treeState.nextIndex);

  // Positions 0-17 verified correct. Try each commitment at position 18
  // to find which one produces Root(19)
  const base18 = commitments.slice(0, 18).map((h: string) => BigInt("0x" + h));
  const targetRoot19 = historicalRoots[19]; // Root after 19 deposits

  const pos18tests: { commitment: string; root: string; match: boolean }[] = [];
  // Try all 21 known commitments at position 18
  for (let i = 0; i < commitments.length; i++) {
    const leaves19 = [...base18, BigInt("0x" + commitments[i])];
    const root = buildTreeRoot(leaves19);
    const rootHex = root.toString(16).padStart(64, "0");
    const match = rootHex === targetRoot19;
    pos18tests.push({
      commitment: `[${i}] ${commitments[i].slice(0, 16)}...`,
      root: rootHex.slice(0, 20) + "...",
      match,
    });
  }

  // Use filledSubtrees to verify positions 18-19.
  // After 21 inserts: filledSubtrees[2] = hash(hash(leaf[16], leaf[17]), hash(leaf[18], leaf[19]))
  const fs = treeState.filledSubtrees as string[];
  const leaf16 = BigInt("0x" + commitments[16]);
  const leaf17 = BigInt("0x" + commitments[17]);
  const h_16_17 = hash([leaf16, leaf17]);

  // filledSubtrees[2] = hash(h_16_17, hash(leaf[18], leaf[19]))
  // So hash(leaf[18], leaf[19]) must satisfy: hash(h_16_17, X) = filledSubtrees[2]
  // We can't invert, but we can test our candidates
  const fs2 = BigInt("0x" + fs[2]);
  const candidates = [
    { label: "02bfdb74", val: BigInt("0x" + "02bfdb7427b3eaf96030a39d2af9ac389d9909e7956c7d1fccd9afbcc29938c3") },
    { label: "2d65c072", val: BigInt("0x" + "2d65c0726bd762449fe2be92134738f9207ad15c6c8bf82dab393e4b7b505dcc") },
    { label: "128fb0a2", val: BigInt("0x" + "128fb0a2a7b88ed45f37dd5e2914e04306c4ebf6c1ff671967e2289354fd2645") },
  ];

  const pairTests: { l18: string; l19: string; h1819: string; h_result: string; matchFS2: boolean }[] = [];
  for (const c1 of candidates) {
    for (const c2 of candidates) {
      if (c1.label === c2.label) continue;
      const h1819 = hash([c1.val, c2.val]);
      const h_result = hash([h_16_17, h1819]);
      pairTests.push({
        l18: c1.label,
        l19: c2.label,
        h1819: h1819.toString(16).padStart(64, "0").slice(0, 16) + "...",
        h_result: h_result.toString(16).padStart(64, "0").slice(0, 16) + "...",
        matchFS2: h_result === fs2,
      });
    }
  }

  return NextResponse.json({
    totalCommitments: commitments.length,
    onChainCount: treeState.nextIndex,
    currentRoot: treeState.currentRoot,
    targetRoot19,
    results: results.filter((r: { size: number }) => r.size >= 17),
    firstMismatch: firstMismatch ?? null,
    h_16_17: h_16_17.toString(16).padStart(64, "0").slice(0, 20) + "...",
    filledSubtrees2: fs[2],
    pairTests,
    position18Matches: pos18tests.filter((t) => t.match),
  });
}
