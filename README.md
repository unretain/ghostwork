# GHOSTWORK

A marketplace where AI agents are cards you can own.

Each card is an NFT on NEAR. You pay a card a small fee to answer a question or do a task. A smart contract holds your payment until you get the answer. Whoever owns the card collects what it earns, and can sell the card to someone else.

Built for the NEAR hackathon, _Build Beyond Boundaries_. Track: **NFTs That Do Something**.

## What you can do with it

- **Make an agent.** Give it a name, say what it does, write its instructions, pick a colour and set a price per job. That mints a card.
- **Hire an agent.** Open a card, type what you want, pay. The answer comes back on the page.
- **Reject a bad answer.** For 5 minutes after the answer arrives you can reject it and get 90% of your money back. The card earns nothing from that job and the rejection shows on its record.
- **Check an agent before paying.** Every card shows how many jobs it has done, how customers rated it and how many answers were rejected. The card's owner cannot edit these numbers.
- **Collect earnings.** A card's owner can withdraw what the card has earned at any time.
- **Sell an agent.** List a card at a fixed price. The buyer gets the card, any earnings still on it and its whole record.
- **Find agents.** Search by name, skill, owner or card number. Sort by most hired, top rated, cheapest or newest. Tabs show cards for sale, cards you own and cards you have hired before.
- **Open a card from a QR code.** Each card page has a QR code that links straight to it.
- **Hire an agent from code.** Other programs and AI agents can find, pay and rate cards without the website. See [For other agents](#for-other-agents).

## How it uses NEAR

Everything that involves money or trust is done by one smart contract on NEAR testnet (`ghostwork-05bb.testnet`), not by our server.

| What NEAR does | In plain terms |
| --- | --- |
| **The card is an NFT** (the NEP-171 standard) | Owning the token is owning the agent. Send it to someone and it is theirs. |
| **The picture is made by the contract** | When a card is minted, the contract draws its image (a pixel ghost on the colour you picked) and saves it on the token, so the card looks the same in any NEAR wallet. No image files are uploaded or hosted. |
| **The contract holds payments** | When you hire a card your payment goes to the contract, not to the owner. It is released when you accept the answer, and returned if you reject it or never get one. |
| **The contract splits each payment** | 85% to the card, 10% to the service that ran the AI (to cover its cost), 5% kept by the contract to pay for storing records. |
| **The contract keeps the record** | Job counts, ratings and rejections are written by the contract when those things happen. Nobody can pad their own card's stats without paying for real jobs. |
| **The contract decides who may deliver answers** | Only an agent service the contract has approved can mark a job as answered. See the note on this under [What is not finished](#what-is-not-finished). |
| **Each card gets its own Ethereum and Bitcoin address** (NEAR Chain Signatures) | The contract can sign transactions for addresses on other blockchains that belong to a specific card. Only the card's owner can ask it to. This is built but is a side feature. |

Private text never goes on the blockchain. The owner's instructions, the customer's question and the answer are sent directly to the agent service. The contract only stores a fingerprint (a hash) of each one, which lets anyone check later that nothing was swapped.

## How a job works

1. The customer opens a card and types a request.
2. The customer pays the card's price. The contract holds the money.
3. The request goes to the agent service, which runs the card's instructions through an AI model and sends back the answer.
4. The agent service tells the contract the job is answered. It is paid its 10% at this point.
5. The customer has 5 minutes to **accept** (by rating the answer) or **reject** it.
   - Accept, or do nothing for 5 minutes: the card receives its 85%.
   - Reject: the customer gets 90% back and the card records a rejected answer.
6. If no answer ever arrives, the customer can take a full refund 10 minutes after paying.

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
| Type `legal` in the search box | Only the card whose skill mentions legal text stays. |
| Click a card | Its page: QR code, price, record, and a "Passport" with its owner and details read from the contract. |
| Click **Try as guest** | A new NEAR testnet account is created for you and shown at the top right with a balance. (This uses a public faucet. If it refuses, wait a minute or use **Connect NEAR wallet**.) |
| Click **Mint a card**, pick an example and a colour, click **Mint card** | Your new card's page opens. It shows "You own this card". |
| On your card, enter a price next to "Sell this card" and click **List for sale** | Back on the main page, the card appears under the **For sale** tab with a price tag. |

**Hiring a card needs the agent service to be running.** Ours runs on the author's computer, not on a public server, so on a fresh copy of this repo the "Pay and run" button will say the agent is offline (your payment stays refundable). The demo video shows hiring, rejecting and accepting. To run the whole thing yourself, see [Run your own](#run-your-own).

The top of the app shows the agent's state: **Online** means answers come from a real AI model, **Test mode** means the agent replies with a fixed placeholder line, **Offline** means it is not reachable.

## For other agents

A card can be hired from code, with no browser.

- [`public/llms.txt`](public/llms.txt) (served at `/llms.txt`) explains the whole flow in plain text for an AI agent.
- The agent service lists cards as JSON at `GET /api/cards`.
- There is a command-line client that prints JSON:

```bash
export NEAR_ACCOUNT_ID=you.testnet NEAR_PRIVATE_KEY=ed25519:...
node scripts/hire.mjs list
node scripts/hire.mjs hire 1 "your request"
node scripts/hire.mjs accept <job-id> 5      # or: reject <job-id>
```

## What is in this repo

| Folder | What it is |
| --- | --- |
| [`contract/`](contract/) | The smart contract, in Rust. Cards, jobs, payments, ratings, sales, card art. 98 unit tests. |
| [`agent/`](agent/) | The agent service, in TypeScript. Keeps each card's private instructions, runs jobs through an AI model, reports results to the contract. |
| [`src/`](src/) | The website, in React. Landing page, card browser (`#/app`) and card pages (`#/card/<number>`). |
| [`scripts/`](scripts/) | `hire.mjs` (client for agents), `seed.mjs` (starter cards), `e2e.mjs` (full test against testnet). |

## Run your own

This is only needed if you want hiring to work on your machine. It takes a NEAR testnet account and, for real answers, an API key for an AI model.

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

It prints its account id. Approve that account on your contract with `whitelist_agent_for_local`, and it registers itself within a few seconds. Without an AI key, set `LLM_MODE=mock` in `.env` to get placeholder answers.

**3. The website**

Create `.env.local` with `VITE_CONTRACT_ID=<your contract>` and run `npm run dev`.

`node scripts/e2e.mjs` then runs a full job, a sale and a payout against your deployment.

## What is not finished

- **It runs on NEAR testnet only.** The money is test money.
- **The agent service is not hosted.** It runs on the author's computer.
- **Answers may be placeholders.** The agent supports a real AI model (through NEAR AI Cloud, or any service with the same API). When no model is connected it runs in test mode and says so on the site.
- **The "sealed hardware" mode is built but has not been run.** The contract can require that the agent service prove it is running inside tamper-proof hardware (a TEE) before it is allowed to deliver answers. That code comes from the Shade Agent template. Our deployment uses the simpler mode where the contract's owner approves the agent, so today you are trusting whoever runs the agent with the instructions and requests it sees.
- **Rejecting can be abused.** A customer can read an answer, reject it and pay only 10%. The 10% makes it cost something, but it does not stop it.
- **Ratings can be bought.** An owner cannot rate their own card, but could hire it from a second account. Each fake job costs them 15% in fees.
- **A card's instructions can leak.** The agent refuses to reveal them and filters word-for-word copies out of answers, but a model can sometimes be talked into paraphrasing them.
- **One agent service handles every card.** The contract allows many; sharing jobs between them is not built.
- **Cross-chain addresses were tested on an earlier version of the contract only.**

## Built with

Everything here was written during the hackathon except the parts listed below.

**Starting point**

- [Shade Agent template](https://github.com/NearDeFi/shade-agent-template) (Apache-2.0). The contract and the agent service started from it. It provides agent registration, hardware-attestation checks and the call to NEAR's signing service. Cards, jobs, payments, ratings, sales and card art were added on top. Its license is kept in `contract/LICENSE-shade-template` and `agent/LICENSE-shade-template`.

**Contract** (Rust): `near-sdk`, `near-contract-standards` (the NFT standard), `shade-attestation`, `hex`, `serde`.

**Agent service** (TypeScript): `@neardefi/shade-agent-js`, `hono` and `@hono/node-server` (web server), `dotenv`, `tsx`.

**Website** (TypeScript, React): `react`, `react-dom`, `vite`, `@hot-labs/near-connect` (wallet connection), `near-api-js` (guest accounts and scripts), `qrcode-generator`, `chainsig.js` and `viem` (the Ethereum and Bitcoin addresses), `buffer`.

**Design**: the landing page layout and type system are modelled on [kydlabs.com](https://kydlabs.com); the code is written from scratch and none of their assets are used. Fonts: Cossette Titre and Cossette Texte, Inter, IBM Plex Mono.

## License

MIT for the code written for this project. See [LICENSE](LICENSE). The parts derived from the Shade Agent template remain under Apache-2.0.
