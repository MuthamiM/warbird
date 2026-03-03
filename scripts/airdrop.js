/**
 * Airdrop SOL on devnet (no Solana CLI needed)
 * Requests 2 SOL from the devnet faucet
 */

require('dotenv').config();
const { Connection, Keypair, clusterApiUrl, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');

const WALLET_PATH = process.env.WALLET_PATH || path.join(__dirname, '..', 'wallet.json');

async function main() {
  if (!fs.existsSync(WALLET_PATH)) {
    console.error('❌ No wallet found. Run first: npm run generate-wallet');
    process.exit(1);
  }

  const secret = JSON.parse(fs.readFileSync(WALLET_PATH, 'utf-8'));
  const wallet = Keypair.fromSecretKey(Uint8Array.from(secret));

  console.log('');
  console.log('🦅 Requesting devnet airdrop...');
  console.log(`   Wallet: ${wallet.publicKey.toBase58()}`);

  const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');

  // Check current balance
  const balanceBefore = await connection.getBalance(wallet.publicKey);
  console.log(`   Current balance: ${(balanceBefore / LAMPORTS_PER_SOL).toFixed(4)} SOL`);

  // Request airdrop (max 2 SOL per request on devnet)
  try {
    console.log('   Requesting 2 SOL...');
    const sig = await connection.requestAirdrop(wallet.publicKey, 2 * LAMPORTS_PER_SOL);
    
    console.log('   ⏳ Confirming transaction...');
    await connection.confirmTransaction(sig, 'confirmed');

    const balanceAfter = await connection.getBalance(wallet.publicKey);
    console.log('');
    console.log(`   ✅ Airdrop successful!`);
    console.log(`   Balance: ${(balanceAfter / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
    console.log('');
    console.log('   Next step: npm run create-token');
  } catch (err) {
    console.error('');
    console.error(`   ❌ Airdrop failed: ${err.message}`);
    console.log('');
    console.log('   Devnet faucet may be rate-limited. Try again in a minute,');
    console.log('   or use: https://faucet.solana.com');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
