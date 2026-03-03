/**
 * WARBIRD Team Token Vesting Script
 * 
 * Implements a time-locked vesting schedule for team tokens.
 * Releases tokens monthly over 12 months with a 6-month cliff.
 * 
 * HOW IT WORKS:
 *   - Team allocation: 15M WARBIRD
 *   - Cliff: 6 months (no tokens released before this)
 *   - Vesting: 12 months total (monthly releases after cliff)
 *   - Monthly release: 15M / 12 = 1.25M WARBIRD per month
 * 
 * Usage:
 *   node scripts/vesting.js status    — Check vesting schedule status
 *   node scripts/vesting.js release   — Release available vested tokens
 *   node scripts/vesting.js setup     — Create initial vesting schedule
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
const VESTING_FILE = path.join(__dirname, '..', 'vesting-schedule.json');

const VESTING_CONFIG = {
  totalTokens: 15_000_000,
  cliffMonths: 6,
  vestingMonths: 12,
  beneficiary: 'team', // wallet name in wallets/ folder
};

function getDefaultSchedule(startDate) {
  const start = new Date(startDate);
  const monthly = VESTING_CONFIG.totalTokens / VESTING_CONFIG.vestingMonths;
  const schedule = [];

  for (let i = 1; i <= VESTING_CONFIG.vestingMonths; i++) {
    const releaseDate = new Date(start);
    releaseDate.setMonth(start.getMonth() + VESTING_CONFIG.cliffMonths + i);
    
    schedule.push({
      month: i,
      tokens: Math.floor(monthly),
      releaseDate: releaseDate.toISOString().split('T')[0],
      released: false,
      releasedAt: null,
      signature: null,
    });
  }

  // Adjust last month to account for rounding
  const allocated = schedule.reduce((s, m) => s + m.tokens, 0);
  schedule[schedule.length - 1].tokens += VESTING_CONFIG.totalTokens - allocated;

  return schedule;
}

async function showStatus() {
  if (!fs.existsSync(VESTING_FILE)) {
    console.log('❌ No vesting schedule found. Run: node scripts/vesting.js setup');
    return;
  }

  const vesting = JSON.parse(fs.readFileSync(VESTING_FILE, 'utf-8'));
  const now = new Date();

  console.log('');
  console.log('🦅 WARBIRD TEAM VESTING STATUS');
  console.log('═══════════════════════════════════════════');
  console.log(`   Start Date: ${vesting.startDate}`);
  console.log(`   Cliff:      ${VESTING_CONFIG.cliffMonths} months`);
  console.log(`   Total:      ${VESTING_CONFIG.totalTokens.toLocaleString()} WARBIRD`);
  console.log('');
  console.log('   Month  | Tokens          | Release Date | Status');
  console.log('   -------|-----------------|--------------|--------');

  let totalReleased = 0;
  let totalAvailable = 0;

  vesting.schedule.forEach(m => {
    const date = new Date(m.releaseDate);
    const available = date <= now;
    const status = m.released ? '✅ Released' : (available ? '🟡 Available' : '🔒 Locked');
    console.log(`   ${String(m.month).padStart(5)}  | ${m.tokens.toLocaleString().padStart(15)} | ${m.releaseDate}   | ${status}`);
    
    if (m.released) totalReleased += m.tokens;
    if (available && !m.released) totalAvailable += m.tokens;
  });

  console.log('');
  console.log(`   Released:  ${totalReleased.toLocaleString()} WARBIRD`);
  console.log(`   Available: ${totalAvailable.toLocaleString()} WARBIRD (can release now)`);
  console.log(`   Locked:    ${(VESTING_CONFIG.totalTokens - totalReleased - totalAvailable).toLocaleString()} WARBIRD`);
  console.log('═══════════════════════════════════════════');
}

async function setup() {
  if (fs.existsSync(VESTING_FILE)) {
    console.log('⚠️  Vesting schedule already exists. Delete vesting-schedule.json to re-create.');
    return;
  }

  const startDate = new Date().toISOString().split('T')[0];
  const schedule = getDefaultSchedule(startDate);

  const vesting = {
    token: 'WARBIRD',
    totalTokens: VESTING_CONFIG.totalTokens,
    cliffMonths: VESTING_CONFIG.cliffMonths,
    vestingMonths: VESTING_CONFIG.vestingMonths,
    startDate,
    beneficiary: VESTING_CONFIG.beneficiary,
    schedule,
  };

  fs.writeFileSync(VESTING_FILE, JSON.stringify(vesting, null, 2));
  console.log('');
  console.log('✅ Vesting schedule created!');
  console.log(`   Start: ${startDate}`);
  console.log(`   Cliff ends: month ${VESTING_CONFIG.cliffMonths}`);
  console.log(`   First release: ${schedule[0].releaseDate}`);
  console.log(`   Last release: ${schedule[schedule.length - 1].releaseDate}`);
  console.log(`   Monthly: ~${Math.floor(VESTING_CONFIG.totalTokens / VESTING_CONFIG.vestingMonths).toLocaleString()} WARBIRD`);
  console.log('');
  console.log('   Run "node scripts/vesting.js status" to view the schedule.');
}

async function release() {
  if (!fs.existsSync(VESTING_FILE)) {
    console.error('❌ No vesting schedule. Run: node scripts/vesting.js setup');
    process.exit(1);
  }

  const vesting = JSON.parse(fs.readFileSync(VESTING_FILE, 'utf-8'));
  const now = new Date();

  // Find available releases
  const available = vesting.schedule.filter(m => !m.released && new Date(m.releaseDate) <= now);

  if (available.length === 0) {
    console.log('ℹ️  No tokens available to release right now.');
    await showStatus();
    return;
  }

  // Load wallets
  const tokenInfoPath = path.join(__dirname, '..', 'token-info.json');
  const tokenInfo = JSON.parse(fs.readFileSync(tokenInfoPath, 'utf-8'));
  const mint = new PublicKey(tokenInfo.mint);

  const teamWalletPath = path.join(__dirname, '..', 'wallets', 'wallet-team.json');
  if (!fs.existsSync(teamWalletPath)) {
    console.error('❌ Team wallet not found. Run distribute-tokens.js first.');
    process.exit(1);
  }

  const teamWallet = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(teamWalletPath, 'utf-8')))
  );
  const mainWalletPath = process.env.WALLET_PATH || './wallet.json';
  const payer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(mainWalletPath, 'utf-8')))
  );

  const endpoint = CLUSTER === 'mainnet-beta' ? clusterApiUrl('mainnet-beta') : clusterApiUrl('devnet');
  const connection = new Connection(endpoint, 'confirmed');

  // Get team token account (source) and main wallet token account (destination)
  const srcAta = await getOrCreateAssociatedTokenAccount(connection, payer, mint, teamWallet.publicKey);
  const destAta = await getOrCreateAssociatedTokenAccount(connection, payer, mint, payer.publicKey);

  console.log('');
  console.log(`🦅 Releasing ${available.length} vested month(s)...`);

  for (const month of available) {
    const amount = BigInt(month.tokens) * BigInt(10 ** TOKEN_DECIMALS);
    try {
      console.log(`   Month ${month.month}: ${month.tokens.toLocaleString()} WARBIRD...`);
      const sig = await transfer(connection, payer, srcAta.address, destAta.address, teamWallet, amount);
      
      month.released = true;
      month.releasedAt = new Date().toISOString();
      month.signature = sig;
      console.log(`   ✅ Released: ${sig}`);
    } catch (err) {
      console.error(`   ❌ Failed month ${month.month}: ${err.message}`);
    }

    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Save updated schedule
  fs.writeFileSync(VESTING_FILE, JSON.stringify(vesting, null, 2));
  console.log('');
  console.log('✅ Vesting schedule updated');
  await showStatus();
}

// ── CLI ─────────────────────────────────────────────────
const command = process.argv[2] || 'status';

switch (command) {
  case 'setup':  setup().catch(console.error); break;
  case 'status': showStatus().catch(console.error); break;
  case 'release': release().catch(console.error); break;
  default:
    console.log('Usage: node scripts/vesting.js [setup|status|release]');
}
