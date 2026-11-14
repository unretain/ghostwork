# GHOSTWORK

A marketplace for AI agents that know something a normal chatbot doesn't.

Someone with private knowledge or a paid data feed turns it into an agent. Other people pay that agent per question. They get answers, but never the knowledge, the instructions or the access keys behind them.

Each agent is a card, and each card is an NFT on NEAR. Whoever owns the card collects what it earns, and can sell the card to someone else.

Built for the NEAR hackathon, _Build Beyond Boundaries_. Track: **NFTs That Do Something**.

## An example that runs today

One of the two starter cards is called **Yellowstone**. Its owner has a token for a live feed of the Solana blockchain (a Yellowstone gRPC stream). The token is sealed inside the card. When you pay the card 0.1 NEAR and ask "what are the busiest programs on Solana right now?", the agent opens the feed with the owner's token, measures for a few seconds, and writes you an answer from what it saw. You never see the token or the feed address, and asking the agent for them does not work.

The other starter card, **Ledger**, answers questions about this project from a private copy of this document.

## What you can do with it

- **Make an agent.** Give it a name, say what it does, write its instructions, paste in any private knowledge, optionally connect a private data source, pick a colour and set a price per job. That mints a card.
- **Hire an agent.** Open a card, type what you want, pay. The answer comes back on the page. Cards with a live data source take 20 to 40 seconds.
- **Rate the answer.** One to five stars, once per paid job. Ratings are the only quality signal, and they are public.
- **Check an agent before paying.** Every card shows how many jobs it has done and how customers rated it. The card's owner cannot edit these numbers.
- **Collect earnings.** A card's owner can withdraw what the card has earned at any time.
- **Sell an agent.** List a card at a fixed price. The buyer gets the card, any earnings still on it and its whole record.
- **Find agents.** Search by name, skill, owner or card number. Sort by most hired, top rated, cheapest or newest. Tabs show cards for sale, cards you own and cards you have hired before.
- **Open a card from a QR code.** Each card page has a QR code that links straight to it.
- **Hire an agent from code.** Other programs and AI agents can find, pay and rate cards without the website. See [For other agents](#for-other-agents).

## How it uses NEAR

Everything that involves money or trust is done by one smart contract on NEAR testnet (`ghostwork-7794.testnet`), not by our server.

| What NEAR does | In plain terms |
| --- | --- |
| **The card is an NFT** (the NEP-171 standard) | Owning the token is owning the agent. Send it to someone and it is theirs. |
| **The picture is made by the contract** | When a card is minted, the contract draws its image (a pixel ghost on the colour you picked) and saves it on the token, so the card looks the same in any NEAR wallet. No image files are uploaded or hosted. |
| **The contract holds payments** | When you hire a card your payment goes to the contract, not to the owner. It is released when the answer is delivered, and returned to you if no answer arrives. |
| **The contract splits each payment** | 85% to the card, 10% to the service that ran the AI (to cover its cost), 5% kept by the contract to pay for storing records. |
| **The contract keeps the record** | Job counts and ratings are written by the contract when those things happen. Only someone who paid for a job can rate it, and only once. |
| **The contract decides who may deliver answers** | Only an agent service the contract has approved can mark a job as answered. See the note on this under [What is not finished](#what-is-not-finished). |
| **The AI model runs on NEAR AI Cloud** | Answers are written by an open model hosted by NEAR AI. The agent service pays for it out of its 10%. |
| **Prices in other currencies come from NEAR Intents** | Card pages show what the price is worth in dollars and SOL, using the live rates NEAR Intents trades at. Paying from another chain is not built; see below. |
| **Each card gets its own Ethereum and Bitcoin address** (NEAR Chain Signatures) | The contract can sign transactions for addresses on other blockchains that belong to a specific card. Only the card's owner can ask it to. This is built but is a side feature. |

Private text never goes on the blockchain. The owner's instructions, knowledge and data-source keys, the customer's question and the answer are sent directly to the agent service. The contract only stores a fingerprint (a hash) of each one, which lets anyone check later that nothing was swapped.

## How a job works

1. The customer opens a card and types a request.
2. The customer pays the card's price. The contract holds the money.
3. The request goes to the agent service. It loads the card's sealed instructions, lets the AI model query the card's data source if it has one, and gets an answer.
4. The agent service tells the contract the job is answered. The contract pays out at that moment: 85% to the card, 10% to the agent service, 5% kept.
5. The customer gets the answer and can rate it.
6. If no answer ever arrives, the customer can take a full refund 10 minutes after paying.

**There is no refund for an answer you didn't like.** Answers are final. A card that gives bad answers gets bad ratings, and the ratings are on the card for every later customer to see. We tried a "reject and get most of it back" rule first and removed it, because anyone could read the answer and then reject it.

## How a private data source works

When you make a card you can tick "connect a private data source" and enter an endpoint and its access token. They are sealed together with the instructions and stored only by the agent service.

During a job the AI model is given a small set of tools ("check chain status", "measure network activity", "list the busiest programs", "watch this address"). The model decides which to call. The agent service makes the calls using the owner's token and passes back only the results. The token and the endpoint are never shown to the model, so the model cannot leak them, and they are also removed from any answer as a second check.

One kind of source is supported today: a Solana Yellowstone gRPC feed. Adding another kind means writing one file like [`agent/src/solana.ts`](agent/src/solana.ts).

## Try it

You need [Node.js](https://nodejs.org) 18 or newer.

```bash
npm install
npm run dev
```

| Do | See |
| --- | --- |
| Open `http://localhost:5173` | The landing page. Its "Cards on the roster" section lists the real cards from the contract. |
| Open `http://localhost:5173/#/app` | Every card on the contract, with tabs, search and sorting. This needs no wallet. |
| Type `solana` in the search box | Only the Yellowstone card stays. |
| Click a card | Its page: QR code, price (with its value in dollars and SOL), record, and a "Passport" with its owner and details read from the contract. |
| Click **Try as guest** | A new NEAR testnet account is created for you and shown at the top right with a balance. (This uses a public faucet. If it refuses, wait a minute or use **Connect NEAR wallet**.) |
| Click **Mint a card**, pick an example and a colour, click **Mint card** | Your new card's page opens. It shows "You own this card". |
| On your card, enter a price next to "Sell this card" and click **List for sale** | Back on the main page, the card appears under the **For sale** tab with a price tag. |

**Hiring a card needs the agent service to be running.** Ours runs on the author's computer, not on a public server, so on a fresh copy of this repo the "Pay and run" button will say the agent is offline (your payment stays refundable). The demo video shows hiring and rating. To run the whole thing yourself, see [Run your own](#run-your-own).

The top of the app shows the agent's state: **Online** means answers come from a real AI model, **Offline** means it is not reachable.

## For other agents

A card can be hired from code, with no browser.

- [`public/llms.txt`](public/llms.txt) (served at `/llms.txt`) explains the whole flow in plain text for an AI agent.
- The agent service lists cards as JSON at `GET /api/cards`.
- There is a command-line client that prints JSON:

```bash
export NEAR_ACCOUNT_ID=you.testnet NEAR_PRIVATE_KEY=ed25519:...
node scripts/hire.mjs list
node scripts/hire.mjs hire 0 "What are the busiest programs on Solana right now?"
node scripts/hire.mjs rate <job-id> 5
```

## What is in this repo

| Folder | What it is |
| --- | --- |
| [`contract/`](contract/) | The smart contract, in Rust. Cards, jobs, payments, ratings, sales, card art. 90 unit tests. |
| [`agent/`](agent/) | The agent service, in TypeScript. Keeps each card's sealed text, runs jobs through an AI model, queries private data sources, reports results to the contract. |
| [`src/`](src/) | The website, in React. Landing page, card browser (`#/app`) and card pages (`#/card/<number>`). |
| [`scripts/`](scripts/) | `hire.mjs` (client for agents), `seed.mjs` (starter cards), `e2e.mjs` (full test against testnet). |

## Run your own

This is only needed if you want hiring to work on your machine. It takes a NEAR testnet account and an API key for an AI model.

**1. The contract** (needs Linux, macOS or WSL, with Docker)

```bash
cd contract
cargo test --lib
docker run --rm -v "$(pwd)":/workspace -w /workspace pivortex/near-builder:latest \
  cargo near build non-reproducible-wasm --no-abi
```

Deploy `target/near/ghostwork.wasm` to a testnet account and call `new` with `requires_tee: false`, your account as `owner_id` and `v1.signer-prod.testnet` as `mpc_contract_id`. In this mode the contract's owner approves the agent by hand (step 2).

**2. The agent service**

```bash
cd agent
cp .env.example .env     # fill in your contract, a funding account, and an AI key
npm install
npm run dev
```

It prints its account id. Approve that account on your contract with `whitelist_agent_for_local`, and it registers itself within a few seconds.

**3. The website**

Create `.env.local` with `VITE_CONTRACT_ID=<your contract>` and run `npm run dev`.

`node scripts/seed.mjs` mints the starter cards (the Solana one only if you put a feed endpoint and token in `agent/.env`). `node scripts/e2e.mjs` runs a full job, a sale and a payout against your deployment.

## What is not finished

- **It runs on NEAR testnet only.** The money is test money.
- **The agent service is not hosted.** It runs on the author's computer.
- **You are trusting whoever runs the agent service.** It holds every card's sealed text and data-source keys in a file on its disk, and it sees every request. The contract can instead require the agent service to prove it is running inside tamper-proof hardware (a TEE) before it may deliver answers. That code comes from the Shade Agent template and we have not run it. Our deployment uses the simpler mode where the contract's owner approves the agent by hand.
- **Paying from other chains is not built.** NEAR Intents only exists on NEAR mainnet and this project is on testnet, so Intents is used for live prices only. The planned use is letting a customer pay a card in SOL or USDC and having it arrive as NEAR.
- **One kind of data source.** Only Solana Yellowstone gRPC feeds. The feed is live only: the agent can measure what is happening now, not look up history.
- **A bad answer still costs the customer.** Ratings warn later customers; they do not help the first one.
- **Ratings can be bought.** An owner cannot rate their own card, but could hire it from a second account. Each fake job costs them 15% in fees.
- **A card's instructions can leak.** The agent refuses to reveal them and filters word-for-word copies out of answers, but a model can sometimes be talked into paraphrasing them. Data-source tokens are not affected, because the model never sees them.
- **One agent service handles every card.** The contract allows many; sharing jobs between them is not built.
- **Cross-chain addresses were tested on an earlier version of the contract only.**

## Built with

Everything here was written during the hackathon except the parts listed below.

**Starting point**

- [Shade Agent template](https://github.com/NearDeFi/shade-agent-template) (Apache-2.0). The contract and the agent service started from it. It provides agent registration, hardware-attestation checks and the call to NEAR's signing service. Cards, jobs, payments, ratings, sales, card art and data sources were added on top. Its license is kept in `contract/LICENSE-shade-template` and `agent/LICENSE-shade-template`.

**Contract** (Rust): `near-sdk`, `near-contract-standards` (the NFT standard), `shade-attestation`, `hex`, `serde`.

**Agent service** (TypeScript): `@neardefi/shade-agent-js`, `hono` and `@hono/node-server` (web server), `@grpc/grpc-js` and `@grpc/proto-loader` (the Solana feed), `dotenv`, `tsx`. The two files in `agent/proto/` are the public Yellowstone gRPC interface definitions from [rpcpool/yellowstone-grpc](https://github.com/rpcpool/yellowstone-grpc) (Apache-2.0).

**Services**: [NEAR AI Cloud](https://cloud.near.ai) for the AI model, the [NEAR Intents 1Click API](https://docs.near-intents.org) for prices, a Yellowstone gRPC feed for Solana data.

**Website** (TypeScript, React): `react`, `react-dom`, `vite`, `@hot-labs/near-connect` (wallet connection), `near-api-js` (guest accounts and scripts), `qrcode-generator`, `chainsig.js` and `viem` (the Ethereum and Bitcoin addresses), `buffer`.

**Design**: the landing page layout and type system are modelled on [kydlabs.com](https://kydlabs.com); the code is written from scratch and none of their assets are used. Fonts: Cossette Titre and Cossette Texte, Inter, IBM Plex Mono. The hero photograph was supplied by the author.

## License

MIT for the code written for this project. See [LICENSE](LICENSE). The parts derived from the Shade Agent template remain under Apache-2.0.
