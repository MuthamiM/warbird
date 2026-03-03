/**
 * WARBIRD Community Airdrop Script
 * 
 * Sends tokens from the community wallet to a list of recipient addresses.
 * 
 * HOW RECIPIENTS GET COINS:
 *   1. Community members share their Solana wallet address (via Telegram/Discord/form)
 *   2. Addresses are added to airdrop-list.json
 *   3. This script sends tokens to each address automatically
 * 
 * Usage:
 *   node scripts/airdrop-community.js
 * 
 * Create airdrop-list.json first:
 * [
 *   { "address": "ABC...xyz", "amount": 1000, "note": "Twitter contest winner" },
 *   { "address": "DEF...uvw", "amount": 500,  "note": "Early Telegram member" }
 * ]
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
const TOKEN_DECIMALS = parseInt(process.env.TOKEN_DECIMALS || '9');

async function main() {
  console.log('');
  console.log('🦅 ═══════════════════════════════════════════');
  console.log('   $WARBIRD COMMUNITY AIRDROP');
  console.log('   ═══════════════════════════════════════════');
  console.log(`   Cluster: ${CLUSTER}`);
  console.log('');

  // ── Load token info ─────────────────────────────────
  const tokenInfoPath = path.join(__dirname, '..', 'token-info.json');
  if (!fs.existsSync(tokenInfoPath)) {
    console.error('❌ token-info.json not found. Create & distribute tokens first.');
    process.exit(1);
  }
  const tokenInfo = JSON.parse(fs.readFileSync(tokenInfoPath, 'utf-8'));
  const mint = new PublicKey(tokenInfo.mint);

  // ── Load community wallet ────────────────────────────
  const communityWalletPath = path.join(__dirname, '..', 'wallets', 'wallet-community.json');
  if (!fs.existsSync(communityWalletPath)) {
    console.error('❌ Community wallet not found. Run distribute-tokens.js first.');
    process.exit(1);
  }
  const communityWallet = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(communityWalletPath, 'utf-8')))
  );

  // ── Load main wallet as fee payer ────────────────────
  const mainWalletPath = process.env.WALLET_PATH || './wallet.json';
  const payer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(mainWalletPath, 'utf-8')))
  );

  // ── Load airdrop list ────────────────────────────────
  const listPath = path.join(__dirname, '..', 'airdrop-list.json');
  if (!fs.existsSync(listPath)) {
    // Create sample file
    const sample = [
      { address: 'PASTE_SOLANA_ADDRESS_HERE', amount: 1000, note: 'Example recipient' },
    ];
    fs.writeFileSync(listPath, JSON.stringify(sample, null, 2));
    console.log('📝 Created sample airdrop-list.json — edit it with real addresses, then re-run.');
    process.exit(0);
  }

  const recipients = JSON.parse(fs.readFileSync(listPath, 'utf-8'));
  const validRecipients = recipients.filter(r => {
    try {
      new PublicKey(r.address);
      return r.amount > 0;
    } catch { return false; }
  });

  if (validRecipients.length === 0) {
    console.error('❌ No valid recipients in airdrop-list.json');
    process.exit(1);
  }

  const totalTokens = validRecipients.reduce((sum, r) => sum + r.amount, 0);
  console.log(`   Recipients: ${validRecipients.length}`);
  console.log(`   Total tokens to send: ${totalTokens.toLocaleString()} WARBIRD`);
  console.log('');

  // ── Connect ─────────────────────────────────────────
  const endpoint = CLUSTER === 'mainnet-beta' ? clusterApiUrl('mainnet-beta') : clusterApiUrl('devnet');
  const connection = new Connection(endpoint, 'confirmed');

  // ── Check community wallet balance ─────────────────
  const srcAta = await getOrCreateAssociatedTokenAccount(connection, payer, mint, communityWallet.publicKey);
  const srcBalance = await getAccount(connection, srcAta.address);
  const available = Number(srcBalance.amount) / (10 ** TOKEN_DECIMALS);
  console.log(`   Community wallet balance: ${available.toLocaleString()} WARBIRD`);

  if (available < totalTokens) {
    console.error(`❌ Not enough tokens. Need ${totalTokens.toLocaleString()}, have ${available.toLocaleString()}`);
    process.exit(1);
  }

  // ── Safety confirmation ──────────────────────────────
  if (CLUSTER === 'mainnet-beta') {
    const readline = require('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise(resolve => {
      rl.question('   Type "AIRDROP" to confirm: ', resolve);
    });
    rl.close();
    if (answer.trim() !== 'AIRDROP') {
      console.log('❌ Airdrop cancelled.');
      process.exit(0);
    }
  }

  // ── Send tokens ──────────────────────────────────────
  const results = [];
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < validRecipients.length; i++) {
    const r = validRecipients[i];
    const recipient = new PublicKey(r.address);
    const amount = BigInt(r.amount) * BigInt(10 ** TOKEN_DECIMALS);

    try {
      console.log(`   [${i + 1}/${validRecipients.length}] Sending ${r.amount.toLocaleString()} to ${r.address.substring(0, 8)}...`);
      
      const destAta = await getOrCreateAssociatedTokenAccount(connection, payer, mint, recipient);
      const sig = await transfer(connection, payer, srcAta.address, destAta.address, communityWallet, amount);
      
      results.push({ ...r, status: 'success', signature: sig });
      successCount++;
      console.log(`       ✅ ${sig}`);
    } catch (err) {
      results.push({ ...r, status: 'failed', error: err.message });
      failCount++;
      console.log(`       ❌ Failed: ${err.message}`);
    }

    // Small delay to avoid rate limits
    if (i < validRecipients.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // ── Save results ──────────────────────────────────────
  const reportPath = path.join(__dirname, '..', `airdrop-report-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({
    cluster: CLUSTER,
    mint: mint.toBase58(),
    executedAt: new Date().toISOString(),
    totalRecipients: validRecipients.length,
    success: successCount,
    failed: failCount,
    totalTokensSent: validRecipients.filter((_, i) => results[i]?.status === 'success').reduce((s, r) => s + r.amount, 0),
    results,
  }, null, 2));

  console.log('');
  console.log('🦅 ═══════════════════════════════════════════');
  console.log('   AIRDROP COMPLETE!');
  console.log(`   ✅ Success: ${successCount}  ❌ Failed: ${failCount}`);
  console.log(`   Report: ${path.basename(reportPath)}`);
  console.log('═══════════════════════════════════════════════');
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
