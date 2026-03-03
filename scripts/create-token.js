/**
 * WARBIRD ($WARBIRD) Token Creator
 * Creates an SPL token on Solana with Metaplex metadata
 * 
 * Usage:
 *   node scripts/create-token.js
 * 
 * Set SOLANA_CLUSTER env to 'devnet' or 'mainnet-beta'
 */

require('dotenv').config();
const {
  Connection,
  Keypair,
  clusterApiUrl,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} = require('@solana/web3.js');
const {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  setAuthority,
  AuthorityType,
  TOKEN_PROGRAM_ID,
} = require('@solana/spl-token');

// Metaplex UMI v3 imports
const { createUmi } = require('@metaplex-foundation/umi-bundle-defaults');
const { createMetadataAccountV3 } = require('@metaplex-foundation/mpl-token-metadata');
const { publicKey: umiPublicKey, createSignerFromKeypair, signerIdentity } = require('@metaplex-foundation/umi');

const fs = require('fs');
const path = require('path');

// ── Config ──────────────────────────────────────────────
const CLUSTER = process.env.SOLANA_CLUSTER || 'devnet';
const WALLET_PATH = process.env.WALLET_PATH || './wallet.json';
const TOKEN_NAME = process.env.TOKEN_NAME || 'WarBird';
const TOKEN_SYMBOL = process.env.TOKEN_SYMBOL || 'WARBIRD';
const TOKEN_DECIMALS = parseInt(process.env.TOKEN_DECIMALS || '9');
const TOKEN_SUPPLY = parseInt(process.env.TOKEN_SUPPLY || '100000000');
const METADATA_URI = process.env.TOKEN_METADATA_URI || '';

async function main() {
  console.log('');
  console.log('🦅 ═══════════════════════════════════════════');
  console.log('   $WARBIRD TOKEN CREATOR');
  console.log('   ═══════════════════════════════════════════');
  console.log(`   Cluster:  ${CLUSTER}`);
  console.log(`   Name:     ${TOKEN_NAME}`);
  console.log(`   Symbol:   ${TOKEN_SYMBOL}`);
  console.log(`   Decimals: ${TOKEN_DECIMALS}`);
  console.log(`   Supply:   ${TOKEN_SUPPLY.toLocaleString()}`);
  console.log('═══════════════════════════════════════════════');
  console.log('');

  // ── 1. Load wallet ─────────────────────────────────────
  if (!fs.existsSync(WALLET_PATH)) {
    console.error(`❌ Wallet file not found at: ${WALLET_PATH}`);
    console.log('');
    console.log('Generate one with:');
    console.log('  solana-keygen new --outfile ./wallet.json');
    console.log('');
    console.log('Then fund it:');
    if (CLUSTER === 'devnet') {
      console.log('  solana airdrop 2 --keypair ./wallet.json --url devnet');
    } else {
      console.log('  Transfer SOL to the wallet address for mainnet deployment');
    }
    process.exit(1);
  }

  const walletSecret = JSON.parse(fs.readFileSync(WALLET_PATH, 'utf-8'));
  const payer = Keypair.fromSecretKey(Uint8Array.from(walletSecret));
  console.log(`✅ Wallet loaded: ${payer.publicKey.toBase58()}`);

  // ── 2. Connect to cluster ─────────────────────────────
  const endpoint = CLUSTER === 'mainnet-beta'
    ? clusterApiUrl('mainnet-beta')
    : clusterApiUrl('devnet');
  const connection = new Connection(endpoint, 'confirmed');

  const balance = await connection.getBalance(payer.publicKey);
  console.log(`✅ Balance: ${(balance / 1e9).toFixed(4)} SOL`);

  if (balance < 0.05 * 1e9) {
    console.error('❌ Insufficient SOL balance. Need at least 0.05 SOL.');
    if (CLUSTER === 'devnet') {
      console.log('Run: node scripts/airdrop.js');
    } else {
      console.log('Send SOL to your wallet: ' + payer.publicKey.toBase58());
    }
    process.exit(1);
  }

  // Safety confirmation for mainnet
  if (CLUSTER === 'mainnet-beta') {
    const readline = require('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise(resolve => {
      console.log('');
      console.log('⚠️  WARNING: You are deploying on MAINNET');
      console.log('   This will cost real SOL (~0.05 SOL)');
      console.log('   This action is IRREVERSIBLE');
      rl.question('\n   Type "DEPLOY" to confirm: ', resolve);
    });
    rl.close();
    if (answer.trim() !== 'DEPLOY') {
      console.log('❌ Deployment cancelled.');
      process.exit(0);
    }
    console.log('');
  }

  // ── 3. Create the SPL token mint ──────────────────────
  console.log('\n⏳ Creating token mint...');
  const mintKeypair = Keypair.generate();
  const mint = await createMint(
    connection,
    payer,
    payer.publicKey,   // mint authority
    payer.publicKey,   // freeze authority (set to null later if desired)
    TOKEN_DECIMALS,
    mintKeypair,
  );
  console.log(`✅ Token Mint: ${mint.toBase58()}`);

  // Save mint address to file
  const mintInfo = {
    mint: mint.toBase58(),
    cluster: CLUSTER,
    name: TOKEN_NAME,
    symbol: TOKEN_SYMBOL,
    decimals: TOKEN_DECIMALS,
    supply: TOKEN_SUPPLY,
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(__dirname, '..', 'token-info.json'),
    JSON.stringify(mintInfo, null, 2)
  );

  // ── 4. Create associated token account & mint supply ──
  console.log('⏳ Creating token account & minting supply...');
  const tokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mint,
    payer.publicKey,
  );
  console.log(`✅ Token Account: ${tokenAccount.address.toBase58()}`);

  const totalSupplyRaw = BigInt(TOKEN_SUPPLY) * BigInt(10 ** TOKEN_DECIMALS);
  await mintTo(
    connection,
    payer,
    mint,
    tokenAccount.address,
    payer,
    totalSupplyRaw,
  );
  console.log(`✅ Minted ${TOKEN_SUPPLY.toLocaleString()} ${TOKEN_SYMBOL}`);

  // ── 5. Add Metaplex metadata using UMI v3 ────────────
  console.log('⏳ Adding on-chain metadata...');
  try {
    const endpoint2 = CLUSTER === 'mainnet-beta'
      ? clusterApiUrl('mainnet-beta')
      : clusterApiUrl('devnet');
    const umi = createUmi(endpoint2);

    // Convert wallet keypair to UMI signer
    const umiKeypair = umi.eddsa.createKeypairFromSecretKey(payer.secretKey);
    const umiSigner = createSignerFromKeypair(umi, umiKeypair);
    umi.use(signerIdentity(umiSigner));

    const mintPubkey = umiPublicKey(mint.toBase58());

    const txResult = await createMetadataAccountV3(umi, {
      mint: mintPubkey,
      mintAuthority: umiSigner,
      payer: umiSigner,
      updateAuthority: umiKeypair.publicKey,
      data: {
        name: TOKEN_NAME,
        symbol: TOKEN_SYMBOL,
        uri: METADATA_URI || '',
        sellerFeeBasisPoints: 0,
        creators: null,
        collection: null,
        uses: null,
      },
      isMutable: true,
      collectionDetails: null,
    }).sendAndConfirm(umi);

    console.log(`✅ Metadata added! Sig: ${Buffer.from(txResult.signature).toString('base64').substring(0,44)}...`);
  } catch (err) {
    console.warn(`⚠️  Metadata creation failed (non-critical): ${err.message}`);
    console.log('   You can add metadata later using the update-metadata script.');
  }

  // ── 6. Revoke mint authority (makes supply fixed) ─────
  console.log('⏳ Revoking mint authority (fixed supply)...');
  await setAuthority(
    connection,
    payer,
    mint,
    payer,
    AuthorityType.MintTokens,
    null, // revoke
  );
  console.log('✅ Mint authority revoked — supply is now FIXED at 100M');

  // ── Done ──────────────────────────────────────────────
  console.log('');
  console.log('🦅 ═══════════════════════════════════════════');
  console.log('   $WARBIRD TOKEN CREATED SUCCESSFULLY!');
  console.log('   ═══════════════════════════════════════════');
  console.log(`   Mint:    ${mint.toBase58()}`);
  console.log(`   Supply:  ${TOKEN_SUPPLY.toLocaleString()} ${TOKEN_SYMBOL}`);
  console.log(`   Cluster: ${CLUSTER}`);
  console.log(`   Owner:   ${payer.publicKey.toBase58()}`);
  console.log('');
  if (CLUSTER === 'devnet') {
    console.log(`   Explorer: https://explorer.solana.com/address/${mint.toBase58()}?cluster=devnet`);
  } else {
    console.log(`   Explorer: https://explorer.solana.com/address/${mint.toBase58()}`);
    console.log(`   Birdeye:  https://birdeye.so/token/${mint.toBase58()}`);
  }
  console.log('');
  console.log('   Next steps:');
  console.log('   1. Upload metadata: npm run upload-metadata');
  console.log('   2. Add liquidity on Raydium / Orca');
  console.log('   3. Launch your site: npm run dev');
  console.log('═══════════════════════════════════════════════');
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
