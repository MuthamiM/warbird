/**
 * WARBIRD Pre-Listing Checklist
 * 
 * Run this script to verify everything is ready before listing.
 * 
 * Usage:
 *   node scripts/pre-listing-check.js
 */

require('dotenv').config();
const {
  Connection,
  Keypair,
  clusterApiUrl,
  PublicKey,
} = require('@solana/web3.js');
const {
  getMint,
  getOrCreateAssociatedTokenAccount,
  getAccount,
} = require('@solana/spl-token');
const fs = require('fs');
const path = require('path');

const CLUSTER = process.env.SOLANA_CLUSTER || 'devnet';
const TOKEN_DECIMALS = parseInt(process.env.TOKEN_DECIMALS || '9');

const CHECKS = [];
function pass(msg) { CHECKS.push({ status: '✅', msg }); console.log(`   ✅ ${msg}`); }
function fail(msg) { CHECKS.push({ status: '❌', msg }); console.log(`   ❌ ${msg}`); }
function warn(msg) { CHECKS.push({ status: '⚠️', msg }); console.log(`   ⚠️  ${msg}`); }

async function main() {
  console.log('');
  console.log('🦅 ═══════════════════════════════════════════');
  console.log('   $WARBIRD PRE-LISTING CHECKLIST');
  console.log('   ═══════════════════════════════════════════');
  console.log(`   Cluster: ${CLUSTER}`);
  console.log('');

  // ── 1. Token exists ─────────────────────────────────
  console.log('   ── TOKEN ──');
  const tokenInfoPath = path.join(__dirname, '..', 'token-info.json');
  if (!fs.existsSync(tokenInfoPath)) { fail('token-info.json not found'); return; }
  const tokenInfo = JSON.parse(fs.readFileSync(tokenInfoPath, 'utf-8'));
  pass(`Token mint: ${tokenInfo.mint}`);

  const endpoint = CLUSTER === 'mainnet-beta' ? clusterApiUrl('mainnet-beta') : clusterApiUrl('devnet');
  const connection = new Connection(endpoint, 'confirmed');

  try {
    const mintAccount = await getMint(connection, new PublicKey(tokenInfo.mint));
    
    // Check supply
    const supply = Number(mintAccount.supply) / (10 ** TOKEN_DECIMALS);
    if (supply === 100_000_000) pass(`Supply: ${supply.toLocaleString()} WARBIRD`);
    else warn(`Supply: ${supply.toLocaleString()} (expected 100M)`);

    // Check mint authority revoked
    if (mintAccount.mintAuthority === null) pass('Mint authority: REVOKED (good!)');
    else fail(`Mint authority still active: ${mintAccount.mintAuthority.toBase58()}`);

    // Check freeze authority
    if (mintAccount.freezeAuthority === null) pass('Freeze authority: NONE (good!)');
    else warn(`Freeze authority exists: ${mintAccount.freezeAuthority.toBase58()}`);

    // Check decimals
    if (mintAccount.decimals === 9) pass(`Decimals: ${mintAccount.decimals}`);
    else warn(`Decimals: ${mintAccount.decimals} (expected 9)`);

  } catch (err) {
    fail(`Cannot read token on-chain: ${err.message}`);
  }

  // ── 2. Wallets exist ────────────────────────────────
  console.log('');
  console.log('   ── WALLETS ──');
  const mainWalletPath = process.env.WALLET_PATH || './wallet.json';
  if (fs.existsSync(mainWalletPath)) pass('Main wallet exists');
  else fail('Main wallet missing');

  const walletNames = ['wallet-liquidity', 'wallet-community', 'wallet-marketing', 'wallet-team', 'wallet-reserve'];
  for (const name of walletNames) {
    const wPath = path.join(__dirname, '..', 'wallets', `${name}.json`);
    if (fs.existsSync(wPath)) pass(`${name}.json exists`);
    else fail(`${name}.json missing — run distribute-tokens.js`);
  }

  // ── 3. Distribution done ────────────────────────────
  console.log('');
  console.log('   ── DISTRIBUTION ──');
  const distPath = path.join(__dirname, '..', 'distribution-record.json');
  if (fs.existsSync(distPath)) {
    const dist = JSON.parse(fs.readFileSync(distPath, 'utf-8'));
    pass(`Distribution done on ${dist.distributedAt}`);
    dist.allocations.forEach(a => {
      console.log(`      ${a.label.padEnd(22)} → ${a.tokens.toLocaleString()} WARBIRD`);
    });
  } else {
    fail('Distribution not done — run distribute-tokens.js');
  }

  // ── 4. Vesting schedule ─────────────────────────────
  console.log('');
  console.log('   ── VESTING ──');
  const vestPath = path.join(__dirname, '..', 'vesting-schedule.json');
  if (fs.existsSync(vestPath)) pass('Vesting schedule set up');
  else warn('Vesting not set up — run: node scripts/vesting.js setup');

  // ── 5. Website checks ─────────────────────────────
  console.log('');
  console.log('   ── WEBSITE ──');
  const sitePath = path.join(__dirname, '..', 'site', 'index.html');
  if (fs.existsSync(sitePath)) {
    const html = fs.readFileSync(sitePath, 'utf-8');
    if (html.includes('discord.gg')) pass('Discord link present');
    else warn('Discord link missing');
    if (html.includes('t.me/warbirdmemecoin')) pass('Telegram link present');
    else warn('Telegram link missing');
    if (html.includes('x.com/Warbirdcoin')) pass('Twitter link present');
    else warn('Twitter link missing');
    if (html.includes('whitepaper.html')) pass('Whitepaper linked');
    else warn('Whitepaper not linked');
    if (html.includes('Content-Security-Policy')) pass('CSP security headers present');
    else warn('CSP headers missing');
  } else {
    fail('site/index.html not found');
  }

  // ── 6. Metadata ────────────────────────────────────
  console.log('');
  console.log('   ── METADATA ──');
  if (tokenInfo.symbol === 'WARBIRD') pass(`Symbol: ${tokenInfo.symbol}`);
  else warn(`Symbol: ${tokenInfo.symbol}`);
  if (tokenInfo.name === 'WarBird') pass(`Name: ${tokenInfo.name}`);
  else warn(`Name: ${tokenInfo.name}`);

  // ── 7. SOL balance for gas ─────────────────────────
  console.log('');
  console.log('   ── FUNDING ──');
  try {
    const payer = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(fs.readFileSync(mainWalletPath, 'utf-8')))
    );
    const balance = await connection.getBalance(payer.publicKey);
    const sol = balance / 1e9;
    if (sol >= 3) pass(`SOL balance: ${sol.toFixed(4)} SOL (enough for LP creation)`);
    else if (sol >= 0.1) warn(`SOL balance: ${sol.toFixed(4)} SOL (need ~3 SOL for LP creation)`);
    else fail(`SOL balance: ${sol.toFixed(4)} SOL (need SOL for transactions!)`);
  } catch (err) {
    fail(`Cannot check balance: ${err.message}`);
  }

  // ── Summary ────────────────────────────────────────
  console.log('');
  console.log('   ═══════════════════════════════════════════');
  const passes = CHECKS.filter(c => c.status === '✅').length;
  const fails = CHECKS.filter(c => c.status === '❌').length;
  const warns = CHECKS.filter(c => c.status === '⚠️').length;
  console.log(`   RESULTS: ${passes} passed, ${warns} warnings, ${fails} failed`);
  
  if (fails === 0 && warns === 0) {
    console.log('   🟢 ALL CLEAR — Ready to list!');
  } else if (fails === 0) {
    console.log('   🟡 MOSTLY READY — Address warnings before listing');
  } else {
    console.log('   🔴 NOT READY — Fix failures before listing');
  }
  console.log('');
  console.log('   LISTING ORDER:');
  console.log('   1. ✅ Create token (done)');
  console.log('   2. Distribute to allocation wallets');
  console.log('   3. Set up team vesting schedule');
  console.log('   4. Create LP on Raydium/Orca/Meteora');
  console.log('   5. Lock LP tokens');
  console.log('   6. Submit to Jupiter for routing');
  console.log('   7. Verify on DexScreener/Birdeye');
  console.log('   8. Announce on socials!');
  console.log('   ═══════════════════════════════════════════');
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
