/**
 * WARBIRD Raydium Liquidity Pool Creator
 * 
 * Creates an OpenBook market + Raydium AMM pool for WARBIRD/SOL trading.
 * 
 * HOW LISTING WORKS:
 *   1. Create an OpenBook (Serum) market for WARBIRD/SOL
 *   2. Create a Raydium AMM pool using that market
 *   3. Deposit initial liquidity (WARBIRD + SOL)
 *   4. Trading begins immediately!
 * 
 * Prerequisites:
 *   - Token created and distributed (run distribute-tokens.js first)
 *   - SOL funded in the liquidity wallet
 *   - Minimum ~3 SOL for pool creation fees + initial liquidity
 * 
 * Usage:
 *   node scripts/create-lp.js
 * 
 * NOTE: This is a guide/scaffold. Raydium SDK changes frequently.
 *       Always verify with the latest Raydium docs before mainnet use.
 */

require('dotenv').config();
const {
  Connection,
  Keypair,
  clusterApiUrl,
  PublicKey,
  LAMPORTS_PER_SOL,
} = require('@solana/web3.js');
const {
  getOrCreateAssociatedTokenAccount,
  getAccount,
} = require('@solana/spl-token');
const fs = require('fs');
const path = require('path');

// ── Config ──────────────────────────────────────────────
const CLUSTER = process.env.SOLANA_CLUSTER || 'devnet';
const TOKEN_DECIMALS = parseInt(process.env.TOKEN_DECIMALS || '9');

// ═══ INITIAL LIQUIDITY SETTINGS ═══
// These determine the launch price!
// Example: 10M WARBIRD + 5 SOL = 0.0000005 SOL per WARBIRD
// At SOL = $150, that's $0.000075 per token, $7,500 FDV
const WARBIRD_FOR_LP = 40_000_000;  // From liquidity wallet
const SOL_FOR_LP = 5;               // SOL to pair with (adjust based on desired price)

async function main() {
  console.log('');
  console.log('🦅 ═══════════════════════════════════════════');
  console.log('   $WARBIRD LIQUIDITY POOL CREATION');
  console.log('   ═══════════════════════════════════════════');
  console.log(`   Cluster: ${CLUSTER}`);
  console.log('');

  // ── Load token info ─────────────────────────────────
  const tokenInfoPath = path.join(__dirname, '..', 'token-info.json');
  if (!fs.existsSync(tokenInfoPath)) {
    console.error('❌ token-info.json not found.');
    process.exit(1);
  }
  const tokenInfo = JSON.parse(fs.readFileSync(tokenInfoPath, 'utf-8'));
  const mint = new PublicKey(tokenInfo.mint);
  console.log(`   Token Mint: ${mint.toBase58()}`);

  // ── Load wallets ────────────────────────────────────
  const mainWalletPath = process.env.WALLET_PATH || './wallet.json';
  const payer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(mainWalletPath, 'utf-8')))
  );

  const liqWalletPath = path.join(__dirname, '..', 'wallets', 'wallet-liquidity.json');
  if (!fs.existsSync(liqWalletPath)) {
    console.error('❌ Liquidity wallet not found. Run distribute-tokens.js first.');
    process.exit(1);
  }
  const liqWallet = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(liqWalletPath, 'utf-8')))
  );

  // ── Connect ─────────────────────────────────────────
  const endpoint = CLUSTER === 'mainnet-beta' ? clusterApiUrl('mainnet-beta') : clusterApiUrl('devnet');
  const connection = new Connection(endpoint, 'confirmed');

  const solBalance = await connection.getBalance(payer.publicKey);
  console.log(`   Payer SOL: ${(solBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);

  const liqAta = await getOrCreateAssociatedTokenAccount(connection, payer, mint, liqWallet.publicKey);
  const liqBalance = await getAccount(connection, liqAta.address);
  const tokenBalance = Number(liqBalance.amount) / (10 ** TOKEN_DECIMALS);
  console.log(`   Liquidity tokens: ${tokenBalance.toLocaleString()} WARBIRD`);

  if (tokenBalance < WARBIRD_FOR_LP) {
    console.error(`❌ Need ${WARBIRD_FOR_LP.toLocaleString()} WARBIRD but have ${tokenBalance.toLocaleString()}`);
    process.exit(1);
  }

  if (solBalance < SOL_FOR_LP * LAMPORTS_PER_SOL) {
    console.error(`❌ Need ${SOL_FOR_LP} SOL but have ${(solBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
    process.exit(1);
  }

  // ── Price calculation ─────────────────────────────────
  const pricePerToken = SOL_FOR_LP / WARBIRD_FOR_LP;
  console.log('');
  console.log('   ═══ LISTING PARAMETERS ═══');
  console.log(`   WARBIRD in pool: ${WARBIRD_FOR_LP.toLocaleString()}`);
  console.log(`   SOL in pool:     ${SOL_FOR_LP} SOL`);
  console.log(`   Initial price:   ${pricePerToken.toFixed(12)} SOL per WARBIRD`);
  console.log(`   Market cap:      ${(100_000_000 * pricePerToken).toFixed(2)} SOL (FDV)`);
  console.log('');

  // ═══════════════════════════════════════════════════════
  // RAYDIUM LP CREATION
  // ═══════════════════════════════════════════════════════
  //
  // Raydium AMM pool creation requires:
  //   1. A Serum/OpenBook market for the trading pair
  //   2. Raydium SDK to create the AMM pool
  //
  // Since Raydium SDK APIs change frequently, here's the manual process:
  //
  // OPTION A: Use Raydium UI (Recommended for first-time)
  //   1. Go to https://raydium.io/liquidity/create/
  //   2. Connect your wallet (with the liquidity tokens)
  //   3. Select WARBIRD token (paste mint address)
  //   4. Set SOL as the base pair
  //   5. Set your initial price
  //   6. Approve the transaction
  //
  // OPTION B: Use Raydium CLI/SDK
  //   npm install @raydium-io/raydium-sdk-v2
  //   See: https://github.com/raydium-io/raydium-sdk-V2
  //
  // OPTION C: Use OpenBook + Raydium (most control)
  //   1. Create OpenBook market: https://github.com/openbook-dex/program
  //   2. Initialize Raydium pool pointing to that market
  //
  // ═══════════════════════════════════════════════════════

  console.log('   ═══════════════════════════════════════════');
  console.log('   LP CREATION — STEP-BY-STEP GUIDE');
  console.log('   ═══════════════════════════════════════════');
  console.log('');
  console.log('   METHOD 1: Raydium UI (Easiest)');
  console.log('   ─────────────────────────────────────────');
  console.log('   1. Import your liquidity wallet into Phantom:');
  console.log(`      Wallet file: wallets/wallet-liquidity.json`);
  console.log('   2. Go to https://raydium.io/liquidity/create-pool/');
  console.log('   3. Select "Standard AMM" pool');
  console.log(`   4. Token A: Paste mint ${mint.toBase58()}`);
  console.log('   5. Token B: SOL');
  console.log(`   6. Set initial token amount: ${WARBIRD_FOR_LP.toLocaleString()} WARBIRD`);
  console.log(`   7. Set initial SOL amount: ${SOL_FOR_LP} SOL`);
  console.log('   8. Click "Create Pool" and confirm');
  console.log('   9. Save the Pool ID!');
  console.log('');
  console.log('   METHOD 2: Orca (Alternative)');
  console.log('   ─────────────────────────────────────────');
  console.log('   1. Go to https://www.orca.so/pools/new');
  console.log(`   2. Create WARBIRD/SOL pool with Concentrated Liquidity`);
  console.log('   3. Set your price range');
  console.log('   4. Deposit tokens and confirm');
  console.log('');
  console.log('   METHOD 3: Meteora DLMM (Best for new tokens)');
  console.log('   ─────────────────────────────────────────');
  console.log('   1. Go to https://app.meteora.ag/dlmm/create');
  console.log('   2. Create a new DLMM pool');
  console.log('   3. More capital efficient, better for low liquidity');
  console.log('');
  console.log('   ═══════════════════════════════════════════');
  console.log('   AFTER LP CREATION:');
  console.log('   ═══════════════════════════════════════════');
  console.log('   1. Lock LP tokens (use streamflow.finance or Raydium lock)');
  console.log('   2. Share the pool address with your community');
  console.log('   3. Submit your token to Jupiter for routing:');
  console.log('      https://station.jup.ag/docs/get-your-token-on-jupiter');
  console.log('   4. Verify on DexScreener (auto-detects new pools)');
  console.log('   5. Update your website with the live pool link');
  console.log('');

  // Save LP config
  const lpConfig = {
    mint: mint.toBase58(),
    cluster: CLUSTER,
    warbirdForLp: WARBIRD_FOR_LP,
    solForLp: SOL_FOR_LP,
    initialPrice: pricePerToken,
    fdvInSol: 100_000_000 * pricePerToken,
    liquidityWallet: liqWallet.publicKey.toBase58(),
    configuredAt: new Date().toISOString(),
    status: 'pending — use Raydium UI or Orca to create the pool',
  };
  fs.writeFileSync(path.join(__dirname, '..', 'lp-config.json'), JSON.stringify(lpConfig, null, 2));
  console.log('   ✅ LP config saved to lp-config.json');
  console.log('   📋 Update this file with Pool ID after creation');
  console.log('');
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
