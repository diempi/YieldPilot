/**
 * yield_pilot_task.ts
 *
 * YieldPilot automation agent (MVP).
 *
 * Responsibilities:
 *  1. Fetch APY data from external sources (mocked for now)
 *  2. Read YieldState from Solana
 *  3. Decide whether a protocol switch is needed
 *  4. Send update_yield transaction on-chain
 */

import "dotenv/config";
import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";

// Only import createX402Client if the module actually resolves successfully
// Otherwise, you might want to wrap the import in a try-catch or provide fallback/mocking
let createX402Client: any;
try {
  // Use require to work around type resolution issues
  // @ts-ignore
  createX402Client = require("x402-solana/client").createX402Client;
} catch (e) {
  console.warn("Warning: Could not import createX402Client from x402-solana/client:", e);
  createX402Client = () => { throw new Error("x402-solana/client unavailable."); };
}


type ProtocolAPY = {
  id: number;
  name: string;
  apy: number; // percentage, e.g. 4.5 = 4.5%
};

type YieldStateView = {
  authority: string;
  currentProtocol: number;
  currentApyBps: number;
};

function mustGetEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

const APY_SWITCH_THRESHOLD = 0.5; // percentage points

/**
 * Reads YieldState from Solana and returns a typed view object.
 */
async function readYieldState(
  program: anchor.Program,
  statePubkey: PublicKey
): Promise<YieldStateView> {
  // The correct syntax for Anchor program account fetch is program.account["yieldState"].fetch
  const state: any = await program.account["yieldState"].fetch(statePubkey);
  return {
    authority: state.authority.toBase58(),
    currentProtocol: state.currentProtocol,
    currentApyBps: state.currentApyBps,
  };
}

/**
 * Mock APY fetcher.
 * Replace this with real HTTP calls in Step 3.
 */
/**
 * Fetch APY data from real Jito endpoint (Kobe) + optional mocks for others.
 *
 * Jito returns APY as a decimal (e.g. 0.072 = 7.2%).
 */
async function fetchProtocolApys(): Promise<ProtocolAPY[]> {
    const jitoApyPct = await fetchJitoApyPercent();
  
    // Keep others mocked for now (Step 3 can replace them later)
    return [
      { id: 0, name: "Marinade (mock)", apy: 4.2 },
      { id: 1, name: "Jito (real)", apy: jitoApyPct },
      { id: 2, name: "Kamino (mock)", apy: 4.8 },
    ];
  }
  
  /**
   * Calls Jito stake_pool_stats endpoint and extracts the latest APY datapoint.
   */
  async function fetchJitoApyPercent(): Promise<number> {
    const url = "https://kobe.mainnet.jito.network/api/v1/stake_pool_stats";
  
    // Request a small daily range so we get recent datapoints
    const now = new Date();
    const end = now.toISOString();
    const start = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString(); // last 48h
  
    const body = {
      bucket_type: "Daily",
      range_filter: { start, end },
      sort_by: { field: "BlockTime", order: "Asc" },
    };
  
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`Jito API error: ${resp.status} ${resp.statusText} ${text}`);
    }
  
    const json: any = await resp.json();
  
    const apySeries = json?.apy;
    if (!Array.isArray(apySeries) || apySeries.length === 0) {
      throw new Error("Jito API returned no APY data points.");
    }
  
    // Take the latest point in the returned series
    const latest = apySeries[apySeries.length - 1];
    const apyDecimal = Number(latest?.data);
  
    if (!Number.isFinite(apyDecimal)) {
      throw new Error("Jito API APY datapoint is not a valid number.");
    }
  
    // Convert decimal to percentage
    const apyPercent = apyDecimal * 100;
    return apyPercent;
  }
  

async function main() {
  console.log("Starting YieldPilot automation task...");

  const rpcEndpoint = mustGetEnv("SOLANA_RPC_ENDPOINT");
  const programIdRaw = mustGetEnv("YIELD_PILOT_PROGRAM_ID");
  const statePubkeyRaw = mustGetEnv("YIELD_STATE_PUBKEY");

  const connection = new Connection(rpcEndpoint, "confirmed");
  const wallet = anchor.Wallet.local();
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const idl = require("../target/idl/yield_pilot.json");

  // Ensure IDL has the correct address (needed for some Anchor TS versions)
  idl.metadata = idl.metadata ?? {};
  idl.metadata.address = programIdRaw;

  const program = new anchor.Program(idl, provider);

  const statePubkey = new PublicKey(statePubkeyRaw);

  // 1) Fetch APY data (mocked)
  const apys = await fetchProtocolApys();

  // 2) Select best protocol
  const best = apys.reduce((acc, curr) => (curr.apy > acc.apy ? curr : acc));

  // 3) Read on-chain state
  const before = await readYieldState(program, statePubkey);
  const beforeApyPct = before.currentApyBps / 100.0;
  const apyDiff = best.apy - beforeApyPct;

  console.log("Current on-chain state (before):", {
    authority: before.authority,
    currentProtocol: before.currentProtocol,
    currentApyPercent: beforeApyPct.toFixed(2) + "%",
  });

  console.log("Best available protocol:", {
    id: best.id,
    name: best.name,
    apy: best.apy.toFixed(2) + "%",
  });

  console.log(`APY difference: ${apyDiff.toFixed(2)}%`);

  // 4) Decision: should we switch?
  if (best.id !== before.currentProtocol && apyDiff > APY_SWITCH_THRESHOLD) {
    console.log(`Decision: switch to protocol ${best.id} (${best.name}).`);

    const newApyBps = Math.round(best.apy * 100);

    console.log("Sending on-chain update_yield transaction...");
    const txSig = await program.methods
      .updateYield(best.id, newApyBps)
      .accounts({
        state: statePubkey,
        authority: wallet.publicKey,
      })
      .rpc();

    console.log("✅ update_yield tx signature:", txSig);

    // 5) Read state again
    const after = await readYieldState(program, statePubkey);
    console.log("Current on-chain state (after):", {
      authority: after.authority,
      currentProtocol: after.currentProtocol,
      currentApyPercent: (after.currentApyBps / 100.0).toFixed(2) + "%",
    });
  } else {
    console.log("Decision: no switch needed.");
  }
}

main().catch((err) => {
  console.error("YieldPilot automation failed:", err);
  process.exit(1);
});
