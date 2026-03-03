/**
 * Generate a Solana wallet keypair (no Solana CLI needed)
 * Saves to ./wallet.json
 */

const { Keypair } = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');

const WALLET_PATH = path.join(__dirname, '..', 'wallet.json');

if (fs.existsSync(WALLET_PATH)) {
  const existing = JSON.parse(fs.readFileSync(WALLET_PATH, 'utf-8'));
  const kp = Keypair.fromSecretKey(Uint8Array.from(existing));
  console.log('');
  console.log('⚠️  Wallet already exists!');
  console.log(`   Address: ${kp.publicKey.toBase58()}`);
  console.log(`   File:    ${WALLET_PATH}`);
  console.log('');
  console.log('   Delete wallet.json first if you want to generate a new one.');
  process.exit(0);
}

const keypair = Keypair.generate();
const secretArray = Array.from(keypair.secretKey);

fs.writeFileSync(WALLET_PATH, JSON.stringify(secretArray));

console.log('');
console.log('🦅 ═══════════════════════════════════════════');
console.log('   WALLET GENERATED');
console.log('═══════════════════════════════════════════════');
console.log(`   Address: ${keypair.publicKey.toBase58()}`);
console.log(`   Saved:   ${WALLET_PATH}`);
console.log('');
console.log('   ⚠️  BACK UP wallet.json — losing it means losing your tokens!');
console.log('');
console.log('   Next step: Fund this wallet');
console.log('     npm run airdrop          (devnet — free test SOL)');
console.log('     Or send real SOL for mainnet deployment');
console.log('═══════════════════════════════════════════════');
