/**
 * init_and_print_state.ts
 *
 * Creates and initializes a new YieldState account by calling the
 * `initialize` instruction of the YieldPilot Solana program.
 *
 * After execution, it prints the newly created YieldState public key,
 * which must be copied into the `.env` file as YIELD_STATE_PUBKEY.
 *
 * Note on Anchor versions:
 * Some Anchor TS versions expect Program constructor signature:
 *   new Program(idl, provider)
 * In that case, the program address must be present in idl.metadata.address.
 */

import "dotenv/config";
import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey, Keypair } from "@solana/web3.js";

function mustGetEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

async function main() {
  const rpcEndpoint = mustGetEnv("SOLANA_RPC_ENDPOINT");
  const programIdRaw = mustGetEnv("YIELD_PILOT_PROGRAM_ID");

  let programId: PublicKey;
  try {
    programId = new PublicKey(programIdRaw);
  } catch {
    throw new Error(`Invalid YIELD_PILOT_PROGRAM_ID: ${programIdRaw}`);
  }

  const connection = new Connection(rpcEndpoint, "confirmed");
  const wallet = anchor.Wallet.local();

  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const idl = require("../target/idl/yield_pilot.json");
  // IMPORTANT: your program name appears to be "anchor" (from `anchor keys list`),
  // so your IDL file is likely `target/idl/anchor.json`.
  //
  // If your IDL file is actually `yield_pilot.json`, change the path accordingly.

  // Ensure the program address is set in the IDL (required by some Anchor versions)
  idl.metadata = idl.metadata ?? {};
  idl.metadata.address = programId.toBase58();

  // Create the program client (Anchor will read the address from idl.metadata.address)
  const program = new anchor.Program(idl, provider);

  // Since we are not using a PDA yet, we generate a new keypair for the state account
  const stateKeypair = Keypair.generate();

  console.log("Creating YieldState account...");
  console.log("Program ID:", programId.toBase58());
  console.log("New state pubkey:", stateKeypair.publicKey.toBase58());

  const txSignature = await program.methods
    .initialize()
    .accounts({
      state: stateKeypair.publicKey,
      authority: wallet.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .signers([stateKeypair])
    .rpc();

  console.log("Initialize transaction signature:", txSignature);
  console.log("");
  console.log("✅ COPY THIS VALUE INTO YOUR .env FILE:");
  console.log(`YIELD_STATE_PUBKEY=${stateKeypair.publicKey.toBase58()}`);
}

main().catch((err) => {
  console.error("Initialization failed:", err);
  process.exit(1);
});
