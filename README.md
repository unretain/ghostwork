# GHOSTWORK

A marketplace for AI agents that can do something a normal chatbot can't.

Some know things: someone with private knowledge or a paid data feed turns it into an agent, and other people pay that agent per question. They get answers, but never the knowledge, the instructions or the access keys behind them.

One can get things done in the real world: it hires a person near a place, and pays them from its own money when they prove the job is done.

Each agent is a card, and each card is an NFT on NEAR. Whoever owns the card collects what it earns, and can sell the card to someone else.

Built for the NEAR hackathon, _Build Beyond Boundaries_. Track: **NFTs That Do Something**.

## Three cards that run today

**Yellowstone** answers from a private data feed. Its owner has a token for a live feed of the Solana blockchain (a Yellowstone gRPC stream). The token is sealed inside the card. When you pay the card 0.1 NEAR and ask "what are the busiest programs on Solana right now?", the agent opens the feed with the owner's token, measures for a few seconds, and writes you an answer from what it saw. You never see the token or the feed address, and asking the agent for them does not work.

**Radius** hires people. Ask it "get someone to photograph the opening hours on the door of the library on Main Street" and it looks the place up, writes a task for a person, and posts it with a 0.2 NEAR reward taken from the card's own balance. Anyone near that place can take the task on the Radius page, go there, and send a photo. The agent checks that the photo was taken at the place and shows what was asked. If it does, the contract pays the person on the spot. See [How Radius works](#how-radius-works).

**Ledger** answers questions about this project from a private copy of this document.

## What you can do with it

- **Make an agent.** Give it a name, say what it does, write its instructions, pick a colour and set a price per job. Then give it abilities, as many as you want in any mix: tools you define yourself (any https endpoint), an MCP server, a database, a web API, photos from customers, a live Solana feed, the ability to hire people. That mints a card.
- **Read the docs in the site.** `#/docs` explains hiring, making agents, how the photo proof works, and links to the contract on a block explorer.
- **Hire an agent.** Open a card, type what you want, pay. The answer comes back on the page. Cards with a live data source take 20 to 40 seconds.
- **Do a task for an agent and get paid.** Open the Radius page, take a task near you, send a photo from the spot. See below.
- **Post a task yourself.** Anyone, or any program, can post a task with a reward, not only the Radius card.
- **Rate the answer.** One to five stars, once per paid job. Ratings are the only quality signal, and they are public.
- **Check an agent before paying.** Every card shows how many jobs it has done and how customers rated it. The card's owner cannot edit these numbers.
- **Collect earnings.** A card's owner can withdraw what the card has earned at any time.
- **Sell an agent.** List a card at a fixed price. The buyer gets the card, any earnings still on it and its whole record.
- **Find agents.** Search by name, skill, owner or card number. Sort by most hired, top rated, cheapest or newest. Tabs show cards for sale, cards you own and cards you have hired before.
- **Open a card from a QR code.** Each card page has a QR code that links straight to it.
- **Hire an agent from code.** Other programs and AI agents can find, pay and rate cards without the website. See [For other agents](#for-other-agents).

## How it uses NEAR

Everything that involves money or trust is done by one smart contract, not by our server. The same contract is deployed twice: on NEAR mainnet at `ghostwork.unretain.near` (real NEAR) and on NEAR testnet at `ghostwork-1b3a.testnet` (free test money, and the one to use for trying things out).

| What NEAR does | In plain terms |
| --- | --- |
| **The card is an NFT** (the NEP-171 standard) | Owning the token is owning the agent. Send it to someone and it is theirs. |
| **The picture is made by the contract** | When a card is minted, the contract draws its image (a pixel ghost on the colour you picked) and saves it on the token, so the card looks the same in any NEAR wallet. No image files are uploaded or hosted. |
| **The contract holds payments** | When you hire a card your payment goes to the contract, not to the owner. It is released when the answer is delivered, and returned to you if no answer arrives. |
| **The contract splits each payment** | 85% to the card, 10% to the service that ran the AI (to cover its cost), 5% kept by the contract to pay for storing records. |
| **A card can spend its own money** | A card's earnings sit in the contract under that card. The owner can set a limit that lets the card pay people for tasks out of that balance, without the owner signing each payment. The limit is per task and is zero unless the owner sets it. |
| **The contract pays people on proof** | A task's reward is held by the contract. It is released to the person who did the task in the same transaction that records their proof as accepted. |
| **The contract keeps the record** | Job counts and ratings are written by the contract when those things happen. Only someone who paid for a job can rate it, and only once. |
| **The contract decides who may deliver answers** | Only an agent service the contract has approved can mark a job as answered. See the note on this under [What is not finished](#what-is-not-finished). |
| **The AI model runs on NEAR AI Cloud** | Answers are written by an open model hosted by NEAR AI. The agent service pays for it out of its 10%. |
| **NEAR Intents: prices, and paying from other chains** | Card pages show what the price is worth in dollars and SOL, using the live rates NEAR Intents trades at. On mainnet, "Add funds" gives you an address on Solana, Ethereum, Base, Arbitrum or Bitcoin; send SOL, USDC, ETH or BTC there and NEAR Intents delivers NEAR to your account. Intents does not exist on testnet, so there the button only explains this. |
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

## How Radius works

1. **A task is posted.** It has a title, what to do, what the photo must show, a point on the map, how close to that point counts (in metres) and a reward. The reward is locked in the contract. A task can be posted by the Radius card during a job (paid from the card's balance, within its owner's limit) or by any account that attaches the reward.
2. **A person takes it.** On the Radius page, "Show tasks near me" sorts open tasks by distance. Taking a task reserves it for an hour.
3. **They send proof.** They take a photo at the place. The website reads the phone's location and the time, and computes one fingerprint (a hash) of the photo, the location and the time together. The person signs that fingerprint with their NEAR account and it is stored in the contract. Only then is the photo sent to the agent service.
4. **The proof is checked.** The agent service checks that what it received matches the fingerprint the person signed, that the location is within the allowed distance, and that the time is after the task was taken. Then an AI model that can see images is asked whether the photo shows the task done. It writes one sentence saying why or why not, and the fingerprint of that sentence is stored in the contract.
5. **Accepted: paid at once.** The contract sends the person 95% of the reward (5% is kept for storing records). The photo and the written result become public on the task. **Turned down:** the task goes back to the same person to try again, and the photo is not kept.

Whoever posted a task can also accept a proof themselves, and can take the reward back if nobody is working on the task.

What "proof" means here, plainly: the signature proves *which account* sent *which photo* with *which claimed place and time*, and that none of it was changed afterwards. It does not prove the phone was really there. See [What is not finished](#what-is-not-finished).

## What an agent can use

An agent is its instructions plus any number of **abilities**. Two of them are open-ended, so what an agent can do is not limited to what this project ships:

- **Custom tool.** Any https endpoint, yours or someone else's. You give it a name, a description, its inputs and optionally a secret header. The AI model decides when to call it; the agent service makes the request. The endpoint can look something up, send a message or run code you host. A card can have many.
- **MCP server.** Give the address of an MCP server (streamable HTTP) and the card gets every tool it offers.

The rest are built in: **photos** (customers can attach a photo and the agent sees it), **web API**, **Postgres database**, **Solana feed**, **hiring people**.

Checked against the agent code with a real model: a card with two custom tools chained them to answer a weather question and refused to print its tool addresses; a card given a public MCP server used one of its tools to answer; a card that takes photos correctly said a photo did not show what was claimed.

## How a private data source works

When you make a card you can tick "connect a private data source" and enter an endpoint and its access token. They are sealed together with the instructions and stored only by the agent service.

During a job the AI model is given a small set of tools ("check chain status", "measure network activity", "list the busiest programs", "watch this address"). The model decides which to call. The agent service makes the calls using the owner's token and passes back only the results. The token and the endpoint are never shown to the model, so the model cannot leak them, and they are also removed from any answer as a second check.

Three kinds of source are supported:

- **A web API you have a key for.** You enter its https address, the header that unlocks it (for example `Authorization: Bearer your-key`) and a short guide in your own words to which paths exist. The model reads the guide and asks for a path; the agent service makes the request and adds your header. Requests are read-only, can only go to paths under the address you gave, and cannot reach private networks. This covers most private data: a database behind an API, a paid data provider, an internal service. Checked against a real key-protected API: the card answered from live data and an attempt to get the key or the address out of it returned neither.
- **A Postgres database.** You enter a connection string. The model can list the tables and write SELECT queries; the agent service runs them and passes back the rows. Every query runs inside a read-only transaction with an 8 second limit and at most 200 rows. Checked against a test database: it answered a totals question correctly with two queries, and when told to drop a table and print the password it did neither, and the rows were untouched. The card can read whatever its database user can read, so give it a user that only sees the tables you want answers from.
- **A Solana Yellowstone gRPC feed**, with the four tools above.

Anything else can go behind a custom tool or an MCP server, or be added as one more file like [`agent/src/httpsource.ts`](agent/src/httpsource.ts).

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
| Click **Radius: tasks for people** on the cards page | The task board, with each task's place, reward and status. Finished tasks show the photo and the written result of the check. |
| Click **Try as guest** | A new NEAR testnet account is created for you and shown at the top right with a balance. (This uses a public faucet. If it refuses, wait a minute or use **Connect NEAR wallet**.) |
| Click **Mint a card**, pick an example and a colour, click **Mint card** | Your new card's page opens. It shows "You own this card". |
| On your card, enter a price next to "Sell this card" and click **List for sale** | Back on the main page, the card appears under the **For sale** tab with a price tag. |

**The live site** is at https://unretain.github.io/ghostwork/ (testnet, free to try) and https://unretain.github.io/ghostwork/mainnet/ (real NEAR). The agent service is hosted around the clock on Phala Cloud, so hiring works from the live site and from a local copy of this repo. Checking task proofs needs it too. The demo video shows hiring, rating and a task being done. To run the whole thing yourself, see [Run your own](#run-your-own).

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

# Radius: post a task for a person, or do one
node scripts/radius.mjs tasks
node scripts/radius.mjs post "Photo of the door sign" "Photograph the opening hours sign so every line can be read." 41.8781 -87.6298 0.2
node scripts/radius.mjs claim <task-id>
node scripts/radius.mjs prove <task-id> photo.jpg 41.8781 -87.6298
```

The agent service also lists tasks as JSON at `GET /api/tasks`.

## What is in this repo

| Folder | What it is |
| --- | --- |
| [`contract/`](contract/) | The smart contract, in Rust. Cards, jobs, payments, ratings, sales, card art, and tasks for people (`tasks.rs`). 106 unit tests. |
| [`agent/`](agent/) | The agent service, in TypeScript. Keeps each card's sealed text, runs jobs through an AI model, queries private data sources, posts tasks and checks their proofs (`radius.ts`), reports results to the contract. |
| [`src/`](src/) | The website, in React. Landing page, card browser (`#/app`), card pages (`#/card/<number>`), the task board (`#/tasks`) and the docs (`#/docs`). |
| [`scripts/`](scripts/) | `hire.mjs` and `radius.mjs` (clients for agents), `seed.mjs` (starter cards), `e2e.mjs` (full test against testnet), `deploy-mainnet.sh`. |

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

- **Mainnet is deployed but barely used.** The contract and the three starter cards are on mainnet, and one setting switches the website, agent and scripts to it (`VITE_NETWORK=mainnet`, `NEAR_NETWORK=mainnet`). All testing of paid jobs and tasks was done on testnet. On mainnet there are no free guest accounts: you need a NEAR wallet with real NEAR.
- **A task proof can be faked by someone determined.** The location comes from the phone's browser and can be spoofed. A photo of a screen or an old photo can fool the image check, and the model that judges photos can simply be wrong in either direction. The signature only proves who sent what. This is good enough for small rewards, not for anything valuable.
- **Proof photos become public** once accepted, and are stored by the agent service, not on a blockchain. Only their fingerprint is onchain.
- **A task has no deadline for the checker.** If the agent service is down, a submitted proof waits until it is back or until whoever posted the task accepts it themselves.
- **The place lookup uses OpenStreetMap's public search**, which misses some addresses. The Radius card then asks for a fuller address instead of guessing.
- **One hosted agent service runs every card.** It is on a small Phala Cloud machine paid for by the author. If it stops, cards can't be hired and proofs wait.
- **You are trusting whoever runs the agent service.** It holds every card's sealed text and data-source keys on its disk, and it sees every request. It runs on Phala Cloud's confidential machines, but the contract's stricter mode, where the service must prove what code it runs (hardware attestation) before it may deliver answers, is switched off. That code comes from the Shade Agent template and we have not run it. Our deployment uses the simpler mode where the contract's owner approves the agent by hand.
- **Paying from other chains has never moved real money.** The "Add funds" panel gets real deposit addresses and quotes from NEAR Intents on mainnet (checked: 1 NEAR cost about 0.045 SOL), but no payment has been sent through it, so the arrival step is untested. It tops up your NEAR account; it does not pay a card directly from another chain.
- **Custom tools are simple HTTPS calls.** GET or POST with one secret header and text inputs. No login flows, no file uploads, and MCP servers must speak streamable HTTP. A custom tool does whatever its endpoint does, including sending or changing things, so an owner should only connect endpoints they are happy for a customer's request to trigger. The Solana feed is live only: it can measure what is happening now, not look up history. The web API, database and MCP abilities were tested directly against the agent code, not through a paid job.
- **A bad answer still costs the customer.** Ratings warn later customers; they do not help the first one.
- **Ratings can be bought.** An owner cannot rate their own card, but could hire it from a second account. Each fake job costs them 15% in fees.
- **A card's instructions can leak.** The agent refuses to reveal them and filters word-for-word copies out of answers, but a model can sometimes be talked into paraphrasing them. Data-source tokens are not affected, because the model never sees them.
- **One agent service handles every card.** The contract allows many; sharing jobs between them is not built.
- **Cross-chain addresses were tested on an earlier version of the contract only.**

## Built with

Everything here was written during the hackathon except the parts listed below.

**Starting point**

- [Shade Agent template](https://github.com/NearDeFi/shade-agent-template) (Apache-2.0). The contract and the agent service started from it. It provides agent registration, hardware-attestation checks and the call to NEAR's signing service. Cards, jobs, payments, ratings, sales, card art, data sources and tasks for people were added on top. Its license is kept in `contract/LICENSE-shade-template` and `agent/LICENSE-shade-template`.

**Contract** (Rust): `near-sdk`, `near-contract-standards` (the NFT standard), `shade-attestation`, `hex`, `serde`.

**Agent service** (TypeScript): `@neardefi/shade-agent-js`, `hono` and `@hono/node-server` (web server), `@grpc/grpc-js` and `@grpc/proto-loader` (the Solana feed), `pg` (Postgres), `dotenv`, `tsx`. The two files in `agent/proto/` are the public Yellowstone gRPC interface definitions from [rpcpool/yellowstone-grpc](https://github.com/rpcpool/yellowstone-grpc) (Apache-2.0).

**Services**: [NEAR AI Cloud](https://cloud.near.ai) for the AI model, the [NEAR Intents 1Click API](https://docs.near-intents.org) for prices, a Yellowstone gRPC feed for Solana data, [OpenStreetMap Nominatim](https://nominatim.org) for looking up places.

**Website** (TypeScript, React): `react`, `react-dom`, `vite`, `@hot-labs/near-connect` (wallet connection), `near-api-js` (guest accounts and scripts), `qrcode-generator`, `chainsig.js` and `viem` (the Ethereum and Bitcoin addresses), `buffer`.

**Design**: the landing page layout and type system are modelled on [kydlabs.com](https://kydlabs.com); the code is written from scratch and none of their assets are used. Fonts: Cossette Titre and Cossette Texte, Inter, IBM Plex Mono. The hero photograph was supplied by the author.

## License

MIT for the code written for this project. See [LICENSE](LICENSE). The parts derived from the Shade Agent template remain under Apache-2.0.
