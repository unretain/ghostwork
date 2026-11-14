import "./env";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { ShadeClient } from "@neardefi/shade-agent-js";
import { counters, HttpError, runJob, sealSkill, view } from "./jobs";
import { llmInfo } from "./llm";
import { skillHashes } from "./store";

const agentContractId = process.env.AGENT_CONTRACT_ID;
const sponsorAccountId = process.env.SPONSOR_ACCOUNT_ID;
const sponsorPrivateKey = process.env.SPONSOR_PRIVATE_KEY;
if (!agentContractId || !sponsorAccountId || !sponsorPrivateKey) {
  throw new Error("Missing AGENT_CONTRACT_ID, SPONSOR_ACCOUNT_ID or SPONSOR_PRIVATE_KEY");
}

// Inside a TEE the agent's NEAR key is generated in memory and never leaves it.
// Locally, derivationPath keeps the account stable across restarts.
const agent = await ShadeClient.create({
  networkId: "testnet",
  agentContractId,
  sponsor: { accountId: sponsorAccountId, privateKey: sponsorPrivateKey },
  derivationPath: sponsorPrivateKey,
  // Must be >= 2 in local mode: with a single key, shade-agent-js 2.2.0 compares the
  // (deterministic) main key against an empty list of extra keys, `[].every()` is true,
  // and registration always fails with "disagree on derivation method".
  numKeys: 2,
});
console.log("Agent account ID:", agent.accountId());

const startedAt = Date.now();
let registered = false;

const app = new Hono();
app.use(cors());

app.get("/", (c) => c.json({ message: "GHOSTWORK agent is running" }));

// Public status: no instructions, no requests, no keys.
app.get("/api/status", (c) =>
  c.json({
    accountId: agent.accountId(),
    contractId: agentContractId,
    registered,
    startedAt,
    llm: llmInfo(),
    skills: skillHashes(),
    ...counters,
  }),
);

const handle = (fn: typeof runJob | typeof sealSkill) => async (c: import("hono").Context) => {
  try {
    if (!registered) throw new HttpError(503, "The agent is still registering with the contract");
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") throw new HttpError(400, "Send a JSON body");
    return c.json(await fn(agent, body));
  } catch (e) {
    if (e instanceof HttpError) return c.json({ error: e.message }, e.status);
    console.error(e);
    return c.json({ error: "Unexpected error" }, 500);
  }
};
// Plain JSON listing for other agents: the public facts about each card, read from the contract.
type ChainCard = {
  token_id: string;
  title: string | null;
  skill: string;
  about: string;
  price: string;
  jobs_done: string;
  rating_sum: string;
  rating_count: string;
  prompt_hash: string | null;
  listed_price: string | null;
  owner_id: string;
};
const yoctoToNear = (y: string) => Number(BigInt(y) / 10n ** 18n) / 1e6;
const publicCard = (c: ChainCard) => ({
  id: c.token_id,
  name: c.title,
  skill: c.skill,
  what_to_send: c.about,
  price_near: yoctoToNear(c.price),
  price_yocto: c.price,
  jobs_done: Number(c.jobs_done),
  rating: Number(c.rating_count) ? Number(c.rating_sum) / Number(c.rating_count) : null,
  ratings: Number(c.rating_count),
  can_be_hired: !!c.prompt_hash,
  owner: c.owner_id,
});
app.get("/api/cards", async (c) => {
  try {
    const cards = (await view<ChainCard[]>(agent, "get_cards", { from_index: "0", limit: 100 })) ?? [];
    return c.json({ contract: agentContractId, cards: cards.map(publicCard) });
  } catch {
    return c.json({ error: "Could not reach NEAR right now. Try again." }, 503);
  }
});
app.get("/api/cards/:id", async (c) => {
  try {
    const card = await view<ChainCard>(agent, "get_card", { token_id: c.req.param("id") });
    return card ? c.json(publicCard(card)) : c.json({ error: "Card not found" }, 404);
  } catch {
    return c.json({ error: "Could not reach NEAR right now. Try again." }, 503);
  }
});

app.post("/api/skill", handle(sealSkill));
app.post("/api/job", handle(runJob));

const port = Number(process.env.PORT || "3000");
serve({ fetch: app.fetch, port });
console.log(`Listening on :${port}`);

// 300 Tgas calls (registration) reserve ~0.3 NEAR of gas up front at testnet prices.
if ((await agent.balance()) < 0.6) {
  await agent.fund(1);
}

// Register with the contract: in TEE mode this submits the attestation quote,
// locally the account must be whitelisted first (`shade whitelist`).
for (;;) {
  try {
    const isWhitelisted = await agent.isWhitelisted();
    if (isWhitelisted === null || isWhitelisted) {
      if (await agent.register()) {
        registered = true;
        console.log("Agent registered");
        break;
      }
    }
  } catch (error) {
    console.error("Registration error:", (error as Error).message);
  }
  console.log("Waiting to be whitelisted:", agent.accountId());
  await new Promise((r) => setTimeout(r, 10_000));
}

// Attestations expire after 7 days; re-register every 6.
setInterval(
  async () => {
    try {
      if (await agent.register()) console.log("Agent re-registered");
    } catch (error) {
      console.error("Re-registration error:", (error as Error).message);
    }
  },
  6 * 24 * 60 * 60 * 1000,
);
