/**
 * paid_apy_server.ts
 *
 * A minimal x402-protected API that serves Jito APY.
 *
 * Flow:
 *  - Client requests /apy/jito
 *  - Server responds 402 Payment Required with payment requirements (if no payment)
 *  - Client pays and retries with X-PAYMENT header
 *  - Server verifies/settles payment and responds 200 with APY
 *
 * This uses the x402 HTTP pattern described in Solana’s guide. 
 */

import "dotenv/config";
import express from "express";

// NOTE: APIs in x402-solana may evolve; follow the library docs if signatures differ.
// The repo explicitly supports client + server side usage. 
import createX402Server from "x402-solana/dist/server";

function mustGetEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable: ${name}`);
  return v;
}

const PORT = Number(process.env.X402_SERVER_PORT ?? "4021");

async function main() {
  const app = express();
  app.use(express.json());

  const network = mustGetEnv("X402_NETWORK"); // e.g. solana-devnet
  const receiver = mustGetEnv("X402_RECEIVER"); // receiver pubkey (base58)

  // Create x402 server middleware
  const x402 = createX402Server({
    network,
    receiver, // who gets paid
    // Pricing: charge a tiny amount per request (example: 0.01 USDC)
    // Depending on SDK, this may be expressed in "minor units" for SPL tokens.
    // Start simple; you can tune later.
    price: {
      amount: "10000", // example units (SDK-specific)
      currency: "USDC",
    },
  });

  // Protected endpoint
  app.get("/apy/jito", x402.protect(), async (_req, res) => {
    // Fetch Jito APY (same function you already use)
    const apy = await fetchJitoApyPercent();
    res.json({ protocol: "Jito", apyPercent: apy, source: "kobe.mainnet.jito.network" });
  });

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.listen(PORT, () => {
    console.log(`Paid APY server listening on http://localhost:${PORT}`);
    console.log(`Protected endpoint: http://localhost:${PORT}/apy/jito`);
  });
}

/**
 * Calls Jito stake_pool_stats endpoint and extracts the latest APY datapoint.
 */
async function fetchJitoApyPercent(): Promise<number> {
  const url = "https://kobe.mainnet.jito.network/api/v1/stake_pool_stats";

  const now = new Date();
  const end = now.toISOString();
  const start = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();

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

  const latest = apySeries[apySeries.length - 1];
  const apyDecimal = Number(latest?.data);

  if (!Number.isFinite(apyDecimal)) {
    throw new Error("Jito API APY datapoint is not a valid number.");
  }

  return apyDecimal * 100;
}

main().catch((err) => {
  console.error("Paid APY server failed:", err);
  process.exit(1);
});
