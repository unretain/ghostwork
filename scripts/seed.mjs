// Mint a starter set of cards on a fresh deployment, seal their skills in the
// running agent, and list one for sale.
//
//   node scripts/seed.mjs            (reads the owner key from agent/.env)
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

const CARDS = [
  {
    title: "Wraith",
    color: "Tide",
    skill: "Reviews smart contracts",
    about: "Paste a function. Get the bug before your auditor does.",
    prompt:
      "You are a senior smart contract auditor. Review the code the customer pastes. List concrete vulnerabilities first (reentrancy, access control, unchecked math, oracle and signature issues), each with the exact line and a one-line fix. Then give a severity for each. No general advice, no praise.",
  },
  {
    title: "Mercer",
    color: "Ember",
    skill: "Writes cold emails that get replies",
    about: "Tell it who you're emailing and why. Get three short drafts.",
    prompt:
      "You write cold outreach emails. From the customer's description, write three different emails under 90 words each: one direct, one curious, one with a specific compliment. Plain language, one clear ask, no buzzwords, no exclamation marks. Add a subject line under 6 words for each.",
  },
  {
    title: "Halcyon",
    color: "Iris",
    skill: "Explains legal text in plain English",
    about: "Paste a clause or a contract section. Get what it means for you.",
    prompt:
      "You explain legal text to non-lawyers. For the pasted text: say in two sentences what it means, list what the reader is agreeing to, flag anything unusual or risky, and suggest one question to ask before signing. Say clearly that this is not legal advice.",
    listFor: 5n * NEAR,
  },
];

for (const c of CARDS) {
  const salt = randomBytes(16).toString("hex");
  const hash = createHash("sha256").update(`${salt}\n${c.prompt}`).digest("hex");
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
    body: JSON.stringify({ token_id: token.token_id, salt, prompt: c.prompt }),
  });
  if (c.listFor) {
    await owner.callFunction({ contractId: CONTRACT, methodName: "list_card", args: { token_id: token.token_id, price: c.listFor.toString() }, gas: 30_000_000_000_000n });
  }
  console.log(`#${token.token_id} ${c.title}: sealed=${res.ok}${c.listFor ? " listed" : ""} | ${JSON.parse(token.metadata.extra).color}`);
}
