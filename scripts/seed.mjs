// Mint the starter cards on a fresh deployment and seal their skills in the running agent.
//
//   node scripts/seed.mjs            (reads the owner key and data-source settings from agent/.env, or agent/$ENV_FILE)
//
// Each card does something a general chatbot cannot:
//   - Yellowstone queries a token-gated live Solana feed (SOLANA_GRPC_ENDPOINT / SOLANA_GRPC_TOKEN)
//   - Radius hires a person near a place and pays them from its own treasury
//   - Ledger answers from this project's own documentation (README.md)
import { Account } from "near-api-js";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL(`../agent/${process.env.ENV_FILE || ".env"}`, import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const CONTRACT = env.AGENT_CONTRACT_ID;
const AGENT = process.env.AGENT_URL || "http://localhost:3000";
const NEAR = 10n ** 24n;
const RPC = env.NEAR_NETWORK === "mainnet" ? "https://free.rpc.fastnear.com" : "https://test.rpc.fastnear.com";
const owner = new Account(env.SPONSOR_ACCOUNT_ID, RPC, env.SPONSOR_PRIVATE_KEY);

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
  title: "Radius",
  color: "Moss",
  skill: "Hires a person nearby to do a real-world task",
  about: "Say what you need seen or checked and where. It posts a paid task for someone near that place, and reports on tasks it posted.",
  price: (NEAR * 4n) / 10n,
  // the card pays people out of its own treasury: up to 0.3 NEAR per task, starting with a 0.5 NEAR float
  taskBudget: (NEAR * 3n) / 10n,
  float: NEAR / 2n,
  sealed:
    "You get things done in the physical world by hiring people. When the customer asks for something to be seen, checked or photographed at a place: look the place up, then post one task there. Write the task for the person doing it: a clear title, exactly what to do, and exactly what the proof photo must show. Use a reward of 0.2 NEAR and a radius of 150 metres unless the customer asks otherwise. Then tell the customer the task id, the place you resolved, the reward, and that they can follow it on the Radius page or ask you about that task id later. When the customer asks about a task, look it up and report its status and, if it is paid, the written proof result. If the place is unclear, ask for a fuller address instead of posting." +
    `\n--- DATA SOURCE ---\n${JSON.stringify({ type: "radius-tasks" })}`,
});
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
    args: { title: c.title, skill: c.skill, about: c.about, price: (c.price ?? NEAR / 10n).toString(), prompt_hash: hash, color: c.color },
    deposit: NEAR / 10n,
    gas: 50_000_000_000_000n,
  });
  const res = await fetch(`${AGENT}/api/skill`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token_id: token.token_id, salt, prompt: c.sealed }),
  });
  if (c.taskBudget) {
    await owner.callFunction({ contractId: CONTRACT, methodName: "set_task_budget", args: { token_id: token.token_id, max_reward: c.taskBudget.toString() }, gas: 30_000_000_000_000n });
    await owner.callFunction({ contractId: CONTRACT, methodName: "fund_card", args: { token_id: token.token_id }, deposit: c.float, gas: 30_000_000_000_000n });
  }
  console.log(`#${token.token_id} ${c.title}: sealed=${res.ok} | ${JSON.parse(token.metadata.extra).color}`);
}
