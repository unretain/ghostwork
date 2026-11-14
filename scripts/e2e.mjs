// End-to-end check against testnet and a running agent:
// guest account -> mint card -> seal skill -> hire -> answer -> rate -> claim.
//
//   node scripts/e2e.mjs            (reads the owner key from agent/.env)
import { Account, KeyPair } from "near-api-js";
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
const RPC = "https://test.rpc.fastnear.com";
const NEAR = 10n ** 24n;
const commitment = (salt, text) => createHash("sha256").update(`${salt}\n${text}`).digest("hex");
const step = (s) => console.log(`\n== ${s}`);
const post = async (path, body) => {
  const res = await fetch(AGENT + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
};

const owner = new Account(env.SPONSOR_ACCOUNT_ID, RPC, env.SPONSOR_PRIVATE_KEY);
const view = (methodName, args = {}) => owner.provider.callFunction({ contractId: CONTRACT, method: methodName, args });

step("create a customer account");
// A sub-account funded by the owner, so the test doesn't depend on the public faucet's rate limit.
const key = KeyPair.fromRandom("ed25519");
const guestId = `c${randomBytes(4).toString("hex")}.${env.SPONSOR_ACCOUNT_ID}`;
await owner.createSubAccount({ accountOrPrefix: guestId, publicKey: key.getPublicKey(), nearToTransfer: 2n * NEAR });
const customer = new Account(guestId, RPC, key.toString());
console.log(guestId, "balance", Number((await customer.getBalance()) / (NEAR / 1000n)) / 1000, "NEAR");

step("owner mints a card with a sealed skill");
const salt = randomBytes(16).toString("hex");
const prompt = "You are a ruthless smart contract reviewer. Secret checklist: reentrancy, unchecked math, access control.";
const token = await owner.callFunction({
  contractId: CONTRACT,
  methodName: "mint_card",
  args: { title: "Wraith", skill: "Reviews smart contracts", about: "Paste a function. Get the bug before your auditor does.", price: (NEAR / 10n).toString(), prompt_hash: commitment(salt, prompt) },
  deposit: NEAR / 10n,
  gas: 50_000_000_000_000n,
});
const tokenId = token.token_id;
console.log("minted card", tokenId);

step("agent rejects wrong instructions, accepts the right ones");
console.log("wrong:", JSON.stringify(await post("/api/skill", { token_id: tokenId, salt, prompt: prompt + "!" })));
console.log("right:", JSON.stringify(await post("/api/skill", { token_id: tokenId, salt, prompt })));

step("customer pays to hire the card");
const nonce = randomBytes(16).toString("hex");
const request = "function withdraw() { msg.sender.call{value: bal[msg.sender]}(''); bal[msg.sender] = 0; }";
const jobId = await customer.callFunction({
  contractId: CONTRACT,
  methodName: "hire",
  args: { token_id: tokenId, request_hash: commitment(nonce, request) },
  deposit: NEAR / 10n,
  gas: 30_000_000_000_000n,
});
console.log("job", jobId, "| escrowed, card balance:", (await view("get_card", { token_id: tokenId })).balance);

step("agent does the job");
console.log("wrong request:", JSON.stringify(await post("/api/job", { job_id: jobId, nonce, request: "something else" })));
const answer = await post("/api/job", { job_id: jobId, nonce, request });
console.log(answer.status, answer.body.result ?? answer.body.error);
const again = await post("/api/job", { job_id: jobId, nonce, request });
console.log("retry returns the same answer:", again.body.result === answer.body.result);

step("onchain result");
let card = await view("get_card", { token_id: tokenId });
const job = await view("get_job", { job_id: jobId });
console.log({ status: job.status, result_hash_matches: job.result_hash === createHash("sha256").update(answer.body.result ?? "").digest("hex"), worker: job.worker });
console.log("card paid:", { balance: card.balance, jobs_done: card.jobs_done });

step("customer rates, owner claims");
await customer.callFunction({ contractId: CONTRACT, methodName: "rate_job", args: { job_id: jobId, stars: 5 }, gas: 30_000_000_000_000n });
const before = await owner.getBalance();
await owner.callFunction({ contractId: CONTRACT, methodName: "claim", args: { token_id: tokenId }, gas: 30_000_000_000_000n });
card = await view("get_card", { token_id: tokenId });
console.log({ rating: `${card.rating_sum}/${card.rating_count}`, balance_after_claim: card.balance, owner_gained_near: Number((await owner.getBalance()) - before) / 1e24 });
console.log("stats:", JSON.stringify(await view("get_stats")));

step("owner lists the card, the customer buys it");
await owner.callFunction({ contractId: CONTRACT, methodName: "list_card", args: { token_id: tokenId, price: (NEAR / 2n).toString() }, gas: 30_000_000_000_000n });
await customer.callFunction({ contractId: CONTRACT, methodName: "buy_card", args: { token_id: tokenId }, deposit: NEAR / 2n, gas: 50_000_000_000_000n });
const sold = await view("get_card", { token_id: tokenId });
console.log({ new_owner: sold.owner_id, listed_price: sold.listed_price, record_kept: sold.jobs_done === "1" && sold.prompt_hash === card.prompt_hash });

const ok = job.status === "Done" && card.jobs_done === "1" && card.balance === "0" && card.rating_count === "1" && sold.owner_id === guestId && sold.listed_price === null;
console.log(ok ? "\nE2E PASSED" : "\nE2E FAILED");
process.exit(ok ? 0 : 1);
