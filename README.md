# 🦅 $WARBIRD — Meme Coin on Solana

A meme token deployed on Solana with fixed 100M supply, revoked mint authority, and a slick landing page.

---

## 📁 Project Structure

```
pixelgemini/
├── scripts/
│   ├── create-token.js      # Creates SPL token + metadata on-chain
│   └── upload-metadata.js   # Uploads metadata JSON to Arweave
├── metadata/
│   └── token-metadata.json  # Off-chain token metadata (name, image, etc.)
├── site/
│   └── index.html           # Landing page website
├── .env                     # Config (cluster, wallet path, supply)
├── .env.example             # Config template
├── package.json
└── README.md
```

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** v18+ — [nodejs.org](https://nodejs.org)
- **Solana CLI** — [docs.solana.com/cli/install](https://docs.solana.com/cli/install-solana-cli-tools)

### 1. Install Dependencies

```bash
npm install
```

### 2. Create a Wallet

```bash
solana-keygen new --outfile ./wallet.json
```

### 3. Fund the Wallet (Devnet)

```bash
solana airdrop 2 --keypair ./wallet.json --url devnet
```

For **mainnet**, transfer real SOL to the wallet address shown by:
```bash
solana-keygen pubkey ./wallet.json
```

### 4. Configure

Edit `.env` and set:
- `SOLANA_CLUSTER=devnet` (or `mainnet-beta` for production)
- `WALLET_PATH=./wallet.json`

### 5. Deploy Token (Devnet)

```bash
npm run create-token:devnet
```

This will:
- ✅ Create the SPL token mint
- ✅ Mint 100,000,000 $WARBIRD to your wallet
- ✅ Add on-chain Metaplex metadata
- ✅ Revoke mint authority (fixed supply forever)
- ✅ Save mint address to `token-info.json`

### 6. Deploy Token (Mainnet)

```bash
npm run create-token:mainnet
```

> ⚠️ **Mainnet costs real SOL** (~0.05 SOL for deployment)

---

## 🌐 Landing Page

```bash
npm run dev
```

Opens at `http://localhost:3000`. The page auto-loads the contract address from `token-info.json` after deployment.

---

## 📋 After Deployment Checklist

1. **Add token logo** — Update `metadata/token-metadata.json` with image URL, then run `npm run upload-metadata`
2. **Add liquidity** — Go to [Raydium](https://raydium.io) or [Orca](https://orca.so) and create a SOL/WARBIRD pool
3. **Burn LP tokens** — Send LP tokens to a burn address for community trust
4. **Submit to aggregators**:
   - [Jupiter](https://station.jup.ag/docs/token-list)
   - [Birdeye](https://birdeye.so)
   - [DexScreener](https://dexscreener.com)
   - [CoinGecko](https://www.coingecko.com/en/methodology)
5. **Create socials** — Twitter/X, Telegram group, Discord
6. **Update site links** — Edit `site/index.html` with real social/DEX URLs

---

## 🔧 Configuration (.env)

| Variable | Description | Default |
|---|---|---|
| `SOLANA_CLUSTER` | `devnet` or `mainnet-beta` | `devnet` |
| `WALLET_PATH` | Path to keypair JSON | `./wallet.json` |
| `TOKEN_NAME` | Display name | `WarBird` |
| `TOKEN_SYMBOL` | Ticker symbol | `WARBIRD` |
| `TOKEN_DECIMALS` | Decimal places | `9` |
| `TOKEN_SUPPLY` | Total supply (whole tokens) | `100000000` |
| `TOKEN_METADATA_URI` | Arweave metadata URI | (auto-set) |

---

## ⚠️ Disclaimer

$WARBIRD is a meme coin created for entertainment purposes. It has no intrinsic value and no expectation of financial return. This is not financial advice. Always do your own research (DYOR) before investing in any cryptocurrency.

---

## License

MIT
