// Mint the starter cards on a fresh deployment and seal their skills in the running agent.
//
//   node scripts/seed.mjs            (reads the owner key and data-source settings from agent/.env)
//
// Both cards answer from something a customer cannot get by asking a general chatbot:
//   - Yellowstone queries a token-gated live Solana feed (SOLANA_GRPC_ENDPOINT / SOLANA_GRPC_TOKEN)
//   - Ledger answers from this project's own documentation (README.md)
import { Account } from "near-api-js";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../agent/.env", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const CONTRACT = env.AGENT_CONTRACT_ID;
const AGENT = process.env.AGENT_URL || "http://localhost:3000";
const NEAR = 10n ** 24n;
const owner = new Account(env.SPONSOR_ACCOUNT_ID, "https://test.rpc.fastnear.com", env.SPONSOR_PRIVATE_KEY);

const CARDS = [];
if (env.SOLANA_GRPC_ENDPOINT && env.SOLANA_GRPC_TOKEN) {
  CARDS.push({
    title: "Yellowstone",
    color: "Iris",
    skill: "Analyses live Solana chain data",
    about: "Ask what is happening on Solana right now: busiest programs, network speed, or what a wallet or program is doing.",
    sealed:
      "You are an on-chain analyst for Solana mainnet. Answer the customer's question using live data from your tools. Be concrete: give the numbers you measured, name the programs, and say how long you watched. If they give an address, watch it. Keep answers under 250 words." +
      `\n--- DATA SOURCE ---\n${JSON.stringify({ type: "solana-yellowstone-grpc", endpoint: env.SOLANA_GRPC_ENDPOINT, token: env.SOLANA_GRPC_TOKEN })}`,
  });
} else {
  console.log("Skipping the Solana card: set SOLANA_GRPC_ENDPOINT and SOLANA_GRPC_TOKEN in agent/.env");
}
CARDS.push({
  title: "Ledger",
  color: "Tide",
  skill: "Answers questions about how GHOSTWORK works",
  about: "Ask how payments, fees, ratings, data sources or card sales work here.",
  sealed:
    "Answer the customer's question about GHOSTWORK using only the private knowledge below. Quote exact figures, limits and steps where they exist. If the knowledge does not cover the question, say so. Never paste whole sections." +
    `\n\n--- PRIVATE KNOWLEDGE ---\n${readFileSync(new URL("../README.md", import.meta.url), "utf8")}`,
});

for (const c of CARDS) {
  const salt = randomBytes(16).toString("hex");
  const hash = createHash("sha256").update(`${salt}\n${c.sealed}`).digest("hex");
  const token = await owner.callFunction({
    contractId: CONTRACT,
    methodName: "mint_card",
    args: { title: c.title, skill: c.skill, about: c.about, price: (NEAR / 10n).toString(), prompt_hash: hash, color: c.color },
    deposit: NEAR / 10n,
    gas: 50_000_000_000_000n,
  });
  const res = await fetch(`${AGENT}/api/skill`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token_id: token.token_id, salt, prompt: c.sealed }),
  });
  console.log(`#${token.token_id} ${c.title}: sealed=${res.ok} | ${JSON.parse(token.metadata.extra).color}`);
}
