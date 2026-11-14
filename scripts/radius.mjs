#!/usr/bin/env node
// Radius client for agents and scripts: post a task for a person, or do one and get paid.
//
//   node scripts/radius.mjs tasks
//   node scripts/radius.mjs post "<title>" "<what to do and what the photo must show>" <lat> <lon> <reward-near> [radius-m]
//   node scripts/radius.mjs status <task-id>
//   node scripts/radius.mjs cancel <task-id>
//   node scripts/radius.mjs claim <task-id>
//   node scripts/radius.mjs prove <task-id> <photo.jpg> <lat> <lon>
//
// Needs a NEAR account (testnet by default, NEAR_NETWORK=mainnet for mainnet):
//   NEAR_ACCOUNT_ID=you.testnet  NEAR_PRIVATE_KEY=ed25519:...
// Optional: GHOSTWORK_CONTRACT, GHOSTWORK_AGENT_URL
import { Account } from "near-api-js";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const defaultContract = readFileSync(new URL("../src/chain/config.ts", import.meta.url), "utf8").match(/"(ghostwork-[a-z0-9]+\.testnet)"/)?.[1];
const CONTRACT = process.env.GHOSTWORK_CONTRACT || (process.env.NEAR_NETWORK === "mainnet" ? "ghostwork.unretain.near" : defaultContract);
const MAINNET = process.env.NEAR_NETWORK === "mainnet";
// the hosted agent for the chosen network; GHOSTWORK_AGENT_URL points at your own
const AGENT = (process.env.GHOSTWORK_AGENT_URL || (MAINNET ? "https://f7aa9451688b950f07d2d5a2de5981252d32cd92-3001.dstack-pha1-prod5.phala.network" : "https://f7aa9451688b950f07d2d5a2de5981252d32cd92-3000.dstack-pha1-prod5.phala.network")).replace(/\/$/, "");
const RPC = process.env.NEAR_RPC || (process.env.NEAR_NETWORK === "mainnet" ? "https://free.rpc.fastnear.com" : "https://test.rpc.fastnear.com");
const GAS = 30_000_000_000_000n;
const out = (value) => console.log(JSON.stringify(value, null, 2));
const fail = (message) => {
  console.error(JSON.stringify({ error: message }));
  process.exit(1);
};
const sha256 = (data) => createHash("sha256").update(data).digest("hex");

const account = () => {
  const { NEAR_ACCOUNT_ID, NEAR_PRIVATE_KEY } = process.env;
  if (!NEAR_ACCOUNT_ID || !NEAR_PRIVATE_KEY) fail("Set NEAR_ACCOUNT_ID and NEAR_PRIVATE_KEY");
  return new Account(NEAR_ACCOUNT_ID, RPC, NEAR_PRIVATE_KEY);
};
const send = (methodName, args, deposit = 0n) => account().callFunction({ contractId: CONTRACT, methodName, args, gas: GAS, deposit });
const getJson = async (path) => (await fetch(`${AGENT}${path}`)).json();

const [command, ...args] = process.argv.slice(2);
try {
  if (command === "tasks") {
    out(await getJson("/api/tasks"));
  } else if (command === "status") {
    const { tasks = [] } = await getJson("/api/tasks");
    const task = tasks.find((t) => t.id === args[0]);
    if (!task) fail("No such task");
    const proof = task.status === "Paid" ? await getJson(`/api/tasks/${task.id}/proof`) : null;
    // the photo is long; say it exists instead of printing it
    out({ ...task, proof_check: proof?.verdict ? { approved: proof.approved, verdict: proof.verdict, has_photo: !!proof.photo } : null });
  } else if (command === "post") {
    const [title, details, lat, lon, reward, radius = "150"] = args;
    if (!title || !details || ![lat, lon, reward].every((v) => Number.isFinite(Number(v)))) {
      fail('Usage: post "<title>" "<details>" <lat> <lon> <reward-near> [radius-m]');
    }
    const yocto = (BigInt(Math.round(Number(reward) * 1e6)) * 10n ** 24n) / 1_000_000n;
    const id = await send(
      "post_task",
      { title, details, lat_e6: Math.round(Number(lat) * 1e6), lon_e6: Math.round(Number(lon) * 1e6), radius_m: Math.round(Number(radius)) },
      yocto,
    );
    out({ task_id: String(id), reward_near: Number(reward), note: "The reward is held by the contract until a proof is accepted." });
  } else if (command === "claim" || command === "cancel") {
    if (!args[0]) fail(`Usage: ${command} <task-id>`);
    await send(command === "claim" ? "claim_task" : "cancel_task", { task_id: args[0] });
    out({ task_id: args[0], [command === "claim" ? "claimed" : "cancelled"]: true });
  } else if (command === "prove") {
    const [taskId, file, lat, lon] = args;
    if (!taskId || !file || ![lat, lon].every((v) => Number.isFinite(Number(v)))) fail("Usage: prove <task-id> <photo.jpg> <lat> <lon>");
    const photo = readFileSync(file);
    const kind = file.toLowerCase().endsWith(".png") ? "png" : file.toLowerCase().endsWith(".webp") ? "webp" : "jpeg";
    const proof = { task_id: taskId, lat: Number(lat).toFixed(6), lon: Number(lon).toFixed(6), taken_ms: String(Date.now()) };
    // 1. sign the commitment onchain   2. hand the proof to the agent, which checks it and settles
    const proof_hash = sha256([proof.task_id, proof.lat, proof.lon, proof.taken_ms, sha256(photo)].join("\n"));
    await send("submit_proof", { task_id: taskId, proof_hash });
    const res = await fetch(`${AGENT}/api/proof`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...proof, photo: `data:image/${kind};base64,${photo.toString("base64")}` }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) fail(`${body.error ?? res.status} (the proof is signed onchain as ${proof_hash})`);
    out({ ...body, proof_hash });
  } else {
    fail("Commands: tasks | post | status | cancel | claim | prove");
  }
} catch (e) {
  fail(String(e?.message ?? e).slice(0, 400));
}
