/**
 * WARBIRD Token Distribution Script
 * 
 * Distributes tokens from the main wallet to allocation wallets:
 *   - Liquidity Pool:  40M (40%) — goes to LP creation
 *   - Community/Airdrop: 20M (20%) — for airdrops, rewards
 *   - Marketing:        15M (15%) — campaigns, KOLs
 *   - Team/Dev:         15M (15%) — vested over 12 months
 *   - Reserve/Burns:    10M (10%) — future use or burn
 * 
 * Usage:
 *   node scripts/distribute-tokens.js
 * 
 * Creates wallet files for each allocation if they don't exist.
 */

require('dotenv').config();
const {
  Connection,
  Keypair,
  clusterApiUrl,
  PublicKey,
} = require('@solana/web3.js');
const {
  getOrCreateAssociatedTokenAccount,
  transfer,
  getAccount,
} = require('@solana/spl-token');
const fs = require('fs');
const path = require('path');

// ── Config ──────────────────────────────────────────────
const CLUSTER = process.env.SOLANA_CLUSTER || 'devnet';
const WALLET_PATH = process.env.WALLET_PATH || './wallet.json';
const TOKEN_DECIMALS = parseInt(process.env.TOKEN_DECIMALS || '9');

// ── Allocation Plan (100M total) ──────────────────────
const ALLOCATIONS = [
  { name: 'liquidity',  label: 'Liquidity Pool',     tokens: 40_000_000, file: 'wallet-liquidity.json' },
  { name: 'community',  label: 'Community / Airdrop', tokens: 20_000_000, file: 'wallet-community.json' },
  { name: 'marketing',  label: 'Marketing',           tokens: 15_000_000, file: 'wallet-marketing.json' },
  { name: 'team',       label: 'Team / Dev',          tokens: 15_000_000, file: 'wallet-team.json' },
  { name: 'reserve',    label: 'Reserve / Burns',     tokens: 10_000_000, file: 'wallet-reserve.json' },
];

async function main() {
  console.log('');
  console.log('🦅 ═══════════════════════════════════════════');
  console.log('   $WARBIRD TOKEN DISTRIBUTION');
  console.log('   ═══════════════════════════════════════════');
  console.log(`   Cluster: ${CLUSTER}`);
  console.log('');

  // ── Load token info ─────────────────────────────────
  const tokenInfoPath = path.join(__dirname, '..', 'token-info.json');
  if (!fs.existsSync(tokenInfoPath)) {
    console.error('❌ token-info.json not found. Create the token first: npm run create-token');
    process.exit(1);
  }
  const tokenInfo = JSON.parse(fs.readFileSync(tokenInfoPath, 'utf-8'));
  const mint = new PublicKey(tokenInfo.mint);
  console.log(`   Token Mint: ${mint.toBase58()}`);

  // ── Load main wallet ─────────────────────────────────
  if (!fs.existsSync(WALLET_PATH)) {
    console.error(`❌ Main wallet not found: ${WALLET_PATH}`);
    process.exit(1);
  }
  const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(WALLET_PATH, 'utf-8'))));
  console.log(`   Main Wallet: ${payer.publicKey.toBase58()}`);

  // ── Connect ─────────────────────────────────────────
  const endpoint = CLUSTER === 'mainnet-beta' ? clusterApiUrl('mainnet-beta') : clusterApiUrl('devnet');
  const connection = new Connection(endpoint, 'confirmed');

  const balance = await connection.getBalance(payer.publicKey);
  console.log(`   SOL Balance: ${(balance / 1e9).toFixed(4)} SOL`);
  console.log('');

  // ── Get main token account ────────────────────────────
  const mainAta = await getOrCreateAssociatedTokenAccount(connection, payer, mint, payer.publicKey);
  const mainBalance = await getAccount(connection, mainAta.address);
  const readable = Number(mainBalance.amount) / (10 ** TOKEN_DECIMALS);
  console.log(`   Token Balance: ${readable.toLocaleString()} WARBIRD`);
  console.log('');

  if (readable < 100_000_000) {
    console.error('❌ Expected 100M tokens in main wallet. Aborting.');
    process.exit(1);
  }

  // ── Safety confirmation for mainnet ────────────────
  if (CLUSTER === 'mainnet-beta') {
    const readline = require('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log('⚠️  MAINNET DISTRIBUTION — This sends REAL tokens!');
    console.log('');
    ALLOCATIONS.forEach(a => console.log(`   ${a.label.padEnd(22)} → ${a.tokens.toLocaleString()} WARBIRD`));
    console.log('');
    const answer = await new Promise(resolve => {
      rl.question('   Type "DISTRIBUTE" to confirm: ', resolve);
    });
    rl.close();
    if (answer.trim() !== 'DISTRIBUTE') {
      console.log('❌ Distribution cancelled.');
      process.exit(0);
    }
    console.log('');
  }

  // ── Create wallets + distribute ─────────────────────
  const results = [];
  const walletsDir = path.join(__dirname, '..', 'wallets');
  if (!fs.existsSync(walletsDir)) fs.mkdirSync(walletsDir, { recursive: true });

  for (const alloc of ALLOCATIONS) {
    const walletPath = path.join(walletsDir, alloc.file);
    let wallet;

    // Create or load allocation wallet
    if (fs.existsSync(walletPath)) {
      wallet = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, 'utf-8'))));
      console.log(`   📂 Loaded existing wallet for ${alloc.label}: ${wallet.publicKey.toBase58()}`);
    } else {
      wallet = Keypair.generate();
      fs.writeFileSync(walletPath, JSON.stringify(Array.from(wallet.secretKey)));
      console.log(`   🆕 Created wallet for ${alloc.label}: ${wallet.publicKey.toBase58()}`);
    }

    // Create token account for this wallet
    const destAta = await getOrCreateAssociatedTokenAccount(connection, payer, mint, wallet.publicKey);

    // Transfer tokens
    const amount = BigInt(alloc.tokens) * BigInt(10 ** TOKEN_DECIMALS);
    console.log(`   ⏳ Sending ${alloc.tokens.toLocaleString()} WARBIRD to ${alloc.label}...`);
    
    const sig = await transfer(
      connection,
      payer,
      mainAta.address,
      destAta.address,
      payer,
      amount,
    );

    console.log(`   ✅ ${alloc.label}: ${sig}`);
    console.log('');

    results.push({
      name: alloc.name,
      label: alloc.label,
      tokens: alloc.tokens,
      wallet: wallet.publicKey.toBase58(),
      tokenAccount: destAta.address.toBase58(),
      signature: sig,
    });
  }

  // ── Save distribution record ─────────────────────────
  const distRecord = {
    mint: mint.toBase58(),
    cluster: CLUSTER,
    distributedAt: new Date().toISOString(),
    allocations: results,
  };
  const distPath = path.join(__dirname, '..', 'distribution-record.json');
  fs.writeFileSync(distPath, JSON.stringify(distRecord, null, 2));
  console.log('');
  console.log('🦅 ═══════════════════════════════════════════');
  console.log('   DISTRIBUTION COMPLETE!');
  console.log('   ═══════════════════════════════════════════');
  results.forEach(r => {
    console.log(`   ${r.label.padEnd(22)} ${r.tokens.toLocaleString().padStart(14)} WARBIRD → ${r.wallet.substring(0,8)}...`);
  });
  console.log('');
  console.log(`   Record saved: distribution-record.json`);
  console.log(`   Wallets saved: wallets/`);
  console.log('');
  console.log('   ⚠️  IMPORTANT: Back up the wallets/ folder securely!');
  console.log('   ⚠️  Anyone with these files can move the tokens.');
  console.log('');
  console.log('   Next steps:');
  console.log('   1. Create LP: node scripts/create-lp.js');
  console.log('   2. Set up airdrops: node scripts/airdrop-community.js');
  console.log('   3. Lock team tokens: node scripts/vesting.js');
  console.log('═══════════════════════════════════════════════');
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
