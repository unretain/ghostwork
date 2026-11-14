// Create a funded test account as a sub-account of the owner and print it as JSON
// ({ accountId, key }), for browser tests when the public faucet is rate-limited.
import { Account, KeyPair } from "near-api-js";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../agent/.env", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const owner = new Account(env.SPONSOR_ACCOUNT_ID, "https://test.rpc.fastnear.com", env.SPONSOR_PRIVATE_KEY);
const key = KeyPair.fromRandom("ed25519");
const accountId = `t${randomBytes(4).toString("hex")}.${env.SPONSOR_ACCOUNT_ID}`;
await owner.createSubAccount({ accountOrPrefix: accountId, publicKey: key.getPublicKey(), nearToTransfer: 3n * 10n ** 24n });
console.log(JSON.stringify({ accountId, key: key.toString() }));
