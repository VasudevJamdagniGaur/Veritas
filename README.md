# Veritas (MVP)

Veritas is a **Trust Layer for Social Media**:

- **Web app**: onboarding + dashboard (trust/bot scores, face verification, social link)
- **Chrome extension**: injects credibility badges + “Veritas Insight” into detected posts and calls the backend `/analyze`

## Folder structure

- `backend/` — Node.js + Express + MongoDB (Mongoose)
- `web/` — React (Vite) + Tailwind + Axios
- `extension/` — Chrome Extension (Manifest v3) + vanilla JS content script
- `contracts/` — Minimal Solidity contract + Hardhat

## Prerequisites

- Node.js 18+ (recommended 20+)
- MongoDB running locally **or** Docker Desktop (recommended)
- Chrome (for the extension)

## 1) Start MongoDB

### Option A: Docker (recommended)

From repo root:

```bash
docker compose up -d
```

### Option B: Local MongoDB

Make sure MongoDB is running on `mongodb://127.0.0.1:27017`.

## 2) Backend (API)

```bash
cd backend
npm install
npm run seed
npm run dev
```

Backend runs on `http://localhost:5000`.

### Environment

- Copy `backend/.env.example` to `backend/.env` (a default `backend/.env` is included for easy local demo)
- If you have an OpenAI key, set `OPENAI_API_KEY` for real analysis; otherwise it falls back to a realistic mock.

## 3) Web app

```bash
cd web
npm install
cp .env.example .env
npm run dev
```

Web app runs on `http://localhost:5173`.

### Web app pages

- `/login` — username login (wallet optional)
- `/verify` — webcam capture → marks `isHumanVerified=true`
- `/dashboard` — trust/bot scores, link social, recent analyzed posts
- `/instructions` — how to load extension + test

## 4) Chrome extension (Manifest v3)

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the repo’s `extension/` folder

### Test targets

- **Mock feed (fastest)**: open `http://localhost:5173/mock-feed.html`
- Or open X/Twitter/LinkedIn/Instagram (DOM varies; MVP uses robust-ish selectors)

The extension detects `article` / `[role="article"]` and injects a Veritas card under each post.

### Backend URL for extension

Edit `extension/config.js` if needed:

- default: `http://localhost:5000/api`

## One-command dev (root)

From repo root:

```bash
npm run install-all
npm run dev
```

This starts:

- backend (port 5000)
- web (port 5173)

## 5) Web3 (optional)

Minimal contract: `contracts/contracts/VeritasTrust.sol`

### Local chain

Terminal A:

```bash
cd contracts
npm install
npm run node
```

Terminal B:

```bash
cd contracts
npm run compile
npm run deploy:local
```

Then set in `backend/.env`:

- `CHAIN_ENABLED=true`
- `RPC_URL=http://127.0.0.1:8545`
- `VERITAS_CONTRACT_ADDRESS=<deployed address>`
- `SIGNER_PRIVATE_KEY=<a local hardhat account private key>`

When a user completes face verification, the backend will **optionally** write:

- `verifiedUsers[address] = true`
- `trustScore[address] = <trust score>`

## API routes (backend)

Base: `http://localhost:5050/api`

- `POST /auth/login`
- `POST /user/verify-face`
- `POST /user/link-social`
- `POST /analyze`
- `GET /user/:id`
- `GET /posts`

