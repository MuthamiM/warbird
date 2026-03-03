/**
 * Revoke Freeze Authority on WARBIRD Token
 * 
 * This removes the freeze authority, making it impossible for anyone
 * to freeze token accounts. Required for DEX listing trust.
 * 
 * Usage: node scripts/revoke-freeze.js
 */

require('dotenv').config();
const {
  Connection,
  Keypair,
  clusterApiUrl,
  PublicKey,
} = require('@solana/web3.js');
const {
  setAuthority,
  AuthorityType,
  getMint,
} = require('@solana/spl-token');
const fs = require('fs');
const path = require('path');

const CLUSTER = process.env.SOLANA_CLUSTER || 'devnet';

async function main() {
  console.log('');
  console.log('🦅 ═══════════════════════════════════════════');
  console.log('   REVOKE FREEZE AUTHORITY');
  console.log(`   Cluster: ${CLUSTER}`);
  console.log('   ═══════════════════════════════════════════');
  console.log('');

  // Load wallet
  const walletPath = path.join(__dirname, '..', 'wallet.json');
  if (!fs.existsSync(walletPath)) {
    console.log('❌ wallet.json not found');
    process.exit(1);
  }
  const walletData = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
  const payer = Keypair.fromSecretKey(Uint8Array.from(walletData));
  console.log(`   Wallet: ${payer.publicKey.toBase58()}`);

  // Load token info
  const tokenInfoPath = path.join(__dirname, '..', 'token-info.json');
  if (!fs.existsSync(tokenInfoPath)) {
    console.log('❌ token-info.json not found');
    process.exit(1);
  }
  const tokenInfo = JSON.parse(fs.readFileSync(tokenInfoPath, 'utf-8'));
  const mint = new PublicKey(tokenInfo.mint);
  console.log(`   Token: ${mint.toBase58()}`);

  // Connect
  const endpoint = CLUSTER === 'mainnet-beta'
    ? clusterApiUrl('mainnet-beta')
    : clusterApiUrl('devnet');
  const connection = new Connection(endpoint, 'confirmed');

  // Check current freeze authority
  const mintInfo = await getMint(connection, mint);
  if (!mintInfo.freezeAuthority) {
    console.log('');
    console.log('   ✅ Freeze authority is already revoked!');
    console.log('   ═══════════════════════════════════════════');
    return;
  }

  console.log(`   Current freeze authority: ${mintInfo.freezeAuthority.toBase58()}`);
  console.log('');

  // Safety confirmation for mainnet
  if (CLUSTER === 'mainnet-beta') {
    const readline = require('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise(res => {
      rl.question('   ⚠️  MAINNET: This is IRREVERSIBLE. Type "REVOKE" to confirm: ', res);
    });
    rl.close();
    if (answer !== 'REVOKE') {
      console.log('   Cancelled.');
      return;
    }
  }

  console.log('   Revoking freeze authority...');

  // Revoke freeze authority (set to null)
  const tx = await setAuthority(
    connection,
    payer,         // payer
    mint,          // account (the mint)
    payer,         // current authority
    AuthorityType.FreezeAccount,
    null           // new authority (null = revoke)
  );

  console.log(`   ✅ Freeze authority REVOKED!`);
  console.log(`   Transaction: ${tx}`);
  console.log('');
  console.log('   No one can freeze token accounts anymore.');
  console.log('   ═══════════════════════════════════════════');
}

main().catch(err => {
  console.error('❌ Error:', err.message || err);
  process.exit(1);
});
