/**
 * Upload WARBIRD token metadata to Arweave via Irys
 * This creates the off-chain metadata JSON that wallets & explorers read
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Keypair } = require('@solana/web3.js');
const { createUmi } = require('@metaplex-foundation/umi-bundle-defaults');
const { irysUploader } = require('@metaplex-foundation/umi-uploader-irys');
const { createGenericFile } = require('@metaplex-foundation/umi');

const CLUSTER = process.env.SOLANA_CLUSTER || 'devnet';
const WALLET_PATH = process.env.WALLET_PATH || './wallet.json';

async function main() {
  console.log('');
  console.log('🦅 WARBIRD Metadata Uploader');
  console.log('════════════════════════════');

  // Load wallet
  const walletSecret = JSON.parse(fs.readFileSync(WALLET_PATH, 'utf-8'));

  // Read metadata template
  const metadataPath = path.join(__dirname, '..', 'metadata', 'token-metadata.json');
  if (!fs.existsSync(metadataPath)) {
    console.error('❌ metadata/token-metadata.json not found');
    process.exit(1);
  }

  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
  console.log('📄 Metadata loaded:', JSON.stringify(metadata, null, 2));

  // Setup Umi with Irys uploader
  const endpoint = CLUSTER === 'mainnet-beta'
    ? 'https://api.mainnet-beta.solana.com'
    : 'https://api.devnet.solana.com';

  const umi = createUmi(endpoint).use(irysUploader());

  // Upload metadata JSON
  console.log('\n⏳ Uploading metadata to Arweave...');

  const metadataJson = JSON.stringify(metadata);
  const metadataFile = createGenericFile(
    Buffer.from(metadataJson),
    'metadata.json',
    { contentType: 'application/json' }
  );

  const [metadataUri] = await umi.uploader.upload([metadataFile]);
  console.log(`✅ Metadata URI: ${metadataUri}`);

  // Save the URI
  const envPath = path.join(__dirname, '..', '.env');
  let envContent = fs.readFileSync(envPath, 'utf-8');
  envContent = envContent.replace(
    /TOKEN_METADATA_URI=.*/,
    `TOKEN_METADATA_URI=${metadataUri}`
  );
  fs.writeFileSync(envPath, envContent);
  console.log('✅ .env updated with metadata URI');

  console.log('');
  console.log('Next: If token already exists, update its on-chain metadata.');
  console.log('Otherwise, create-token will use this URI automatically.');
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
