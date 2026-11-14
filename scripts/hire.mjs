#!/usr/bin/env node
// GHOSTWORK client for agents and scripts: find a card, pay it, get the answer,
// then accept or reject it.
//
//   node scripts/hire.mjs list
//   node scripts/hire.mjs hire <card-id> "<request>"
//   node scripts/hire.mjs accept <job-id> [stars 1-5]
//   node scripts/hire.mjs reject <job-id>          (within 5 minutes: 90% back)
//
// Needs a NEAR testnet account with a little NEAR:
//   NEAR_ACCOUNT_ID=you.testnet  NEAR_PRIVATE_KEY=ed25519:...
// Optional: GHOSTWORK_CONTRACT, GHOSTWORK_AGENT_URL
import { Account } from "near-api-js";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

const defaultContract = readFileSync(new URL("../src/chain/config.ts", import.meta.url), "utf8").match(/VITE_CONTRACT_ID \?\? "([^"]+)"/)?.[1];
const CONTRACT = process.env.GHOSTWORK_CONTRACT || defaultContract;
const AGENT = (process.env.GHOSTWORK_AGENT_URL || "http://localhost:3000").replace(/\/$/, "");
const RPC = "https://test.rpc.fastnear.com";
const GAS = 30_000_000_000_000n;
const out = (value) => console.log(JSON.stringify(value, null, 2));
const fail = (message) => {
  console.error(JSON.stringify({ error: message }));
  process.exit(1);
};

const account = () => {
  const { NEAR_ACCOUNT_ID, NEAR_PRIVATE_KEY } = process.env;
  if (!NEAR_ACCOUNT_ID || !NEAR_PRIVATE_KEY) fail("Set NEAR_ACCOUNT_ID and NEAR_PRIVATE_KEY to pay for jobs");
  return new Account(NEAR_ACCOUNT_ID, RPC, NEAR_PRIVATE_KEY);
};

const [command, ...args] = process.argv.slice(2);
try {
  if (command === "list") {
    const res = await fetch(`${AGENT}/api/cards`);
    out(await res.json());
  } else if (command === "hire") {
    const [cardId, ...words] = args;
    const request = words.join(" ");
    if (!cardId || !request) fail('Usage: hire <card-id> "<request>"');
    const card = await (await fetch(`${AGENT}/api/cards/${cardId}`)).json();
    if (card.error) fail(card.error);
    if (!card.can_be_hired) fail("This card has no skill sealed yet");

    // Only a salted hash of the request goes onchain; the text goes to the agent.
    const nonce = randomBytes(16).toString("hex");
    const requestHash = createHash("sha256").update(`${nonce}\n${request}`).digest("hex");
    const jobId = await account().callFunction({
      contractId: CONTRACT,
      methodName: "hire",
      args: { token_id: cardId, request_hash: requestHash },
      deposit: BigInt(card.price_yocto),
      gas: GAS,
    });
    const res = await fetch(`${AGENT}/api/job`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: jobId, nonce, request }),
    });
    const body = await res.json();
    if (!res.ok) fail(`${body.error} (job ${jobId} is still open: refundable 10 minutes after hiring)`);
    out({
      job_id: jobId,
      card: card.name,
      paid_near: card.price_near,
      answer: body.result,
      next: `Accept with "accept ${jobId} <stars>" or, within 5 minutes, "reject ${jobId}" for 90% back. No action counts as accepted.`,
    });
  } else if (command === "accept") {
    const [jobId, stars = "5"] = args;
    if (!jobId) fail("Usage: accept <job-id> [stars 1-5]");
    await account().callFunction({ contractId: CONTRACT, methodName: "rate_job", args: { job_id: jobId, stars: Number(stars) }, gas: GAS });
    out({ job_id: jobId, accepted: true, stars: Number(stars) });
  } else if (command === "reject") {
    const [jobId] = args;
    if (!jobId) fail("Usage: reject <job-id>");
    await account().callFunction({ contractId: CONTRACT, methodName: "reject_job", args: { job_id: jobId }, gas: GAS });
    out({ job_id: jobId, rejected: true, refunded: "90% of the payment" });
  } else {
    fail("Commands: list | hire <card-id> \"<request>\" | accept <job-id> [stars] | reject <job-id>");
  }
} catch (e) {
  const text = String(e?.message ?? e);
  fail(text.match(/Smart contract panicked: ([^"\\]+)/)?.[1] ?? text.slice(0, 300));
}
