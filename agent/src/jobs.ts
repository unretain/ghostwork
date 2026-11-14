// Sealing skills and doing paid jobs.
//
// Nothing private is ever written to the chain. The contract holds sha256
// commitments; the texts are sent here and only accepted when they match:
//   prompt_hash  = sha256(salt  + "\n" + instructions)   set by the card owner
//   request_hash = sha256(nonce + "\n" + request)        set by the customer when paying
//   result_hash  = sha256(answer)                        posted by this agent
import type { ShadeClient } from "@neardefi/shade-agent-js";
import { LlmError, runSkill } from "./llm";
import { commitment, getResult, getSkill, putResult, putSkill, sha256Hex, type Result } from "./store";

// instructions plus any private knowledge the owner seals with them
const MAX_PROMPT = 60_000;
// matches REVIEW_WINDOW_MS in the contract
const REVIEW_WINDOW_MS = 5 * 60 * 1000;
const MAX_REQUEST = 4000;

export class HttpError extends Error {
  constructor(
    public status: 400 | 403 | 404 | 409 | 410 | 500 | 502 | 503,
    message: string,
  ) {
    super(message);
  }
}

type CardView = { token_id: string; title: string | null; skill: string; prompt_hash: string | null };
type JobView = { job_id: string; token_id: string; request_hash: string; status: "Open" | "Delivered" | "Done" | "Rejected" };

// The contract returns null for a missing card or job; the SDK type does not allow for that.
async function view<T>(agent: ShadeClient, methodName: string, args: Record<string, unknown>) {
  return (await agent.view({ methodName, args })) as unknown as T | null;
}

export const counters = { jobsCompleted: 0, skillsSealed: 0 };

const str = (v: unknown, name: string, max: number) => {
  if (typeof v !== "string" || !v.length) throw new HttpError(400, `${name} is required`);
  if (v.length > max) throw new HttpError(400, `${name} is too long (max ${max} characters)`);
  return v;
};

/** The owner delivers the private instructions. Accepted only if they match the onchain commitment. */
export async function sealSkill(agent: ShadeClient, body: Record<string, unknown>) {
  const tokenId = str(body.token_id, "token_id", 32);
  const salt = str(body.salt, "salt", 128);
  const prompt = str(body.prompt, "prompt", MAX_PROMPT);

  const card = await view<CardView>(agent, "get_card", { token_id: tokenId });
  if (!card) throw new HttpError(404, "Card not found");
  const hash = commitment(salt, prompt);
  if (hash !== card.prompt_hash) {
    throw new HttpError(403, "These instructions don't match the hash sealed on the card");
  }
  if (getSkill(tokenId)?.hash !== hash) {
    putSkill(tokenId, { hash, salt, prompt });
    counters.skillsSealed++;
  }
  return { token_id: tokenId, sealed: true };
}

const inFlight = new Map<string, Promise<Result>>();

/** The customer delivers the request for a job they paid for. Returns the answer. */
export async function runJob(agent: ShadeClient, body: Record<string, unknown>) {
  const jobId = str(body.job_id, "job_id", 24);
  const nonce = str(body.nonce, "nonce", 128);
  const request = str(body.request, "request", MAX_REQUEST);
  const requestHash = commitment(nonce, request);

  // Same request again (a retry or a dropped connection): return the stored answer.
  const cached = getResult(jobId);
  if (cached) {
    if (cached.requestHash !== requestHash) throw new HttpError(403, "Request doesn't match this job");
    return { job_id: jobId, result: cached.result, result_hash: cached.resultHash };
  }

  let pending = inFlight.get(jobId);
  if (!pending) {
    pending = work(agent, jobId, requestHash, request).finally(() => inFlight.delete(jobId));
    inFlight.set(jobId, pending);
  }
  const done = await pending;
  if (done.requestHash !== requestHash) throw new HttpError(403, "Request doesn't match this job");
  return { job_id: jobId, result: done.result, result_hash: done.resultHash };
}

async function work(agent: ShadeClient, jobId: string, requestHash: string, request: string): Promise<Result> {
  const job = await view<JobView>(agent, "get_job", { job_id: jobId });
  if (!job) throw new HttpError(404, "Job not found (it may have been refunded)");
  if (job.request_hash !== requestHash) throw new HttpError(403, "Request doesn't match the hash paid for");
  if (job.status !== "Open") throw new HttpError(410, "This job was already completed");

  const card = await view<CardView>(agent, "get_card", { token_id: job.token_id });
  const skill = getSkill(job.token_id);
  if (!card || !skill || skill.hash !== card.prompt_hash) {
    throw new HttpError(409, "This card's skill hasn't been delivered to the agent yet. Its owner needs to seal it again.");
  }

  let answer: string;
  try {
    answer = await runSkill(card, skill.prompt, request);
  } catch (e) {
    // The job stays open onchain, so the customer can refund after 10 minutes.
    if (e instanceof LlmError) throw new HttpError(502, e.message);
    throw new HttpError(502, "The model failed to answer");
  }

  // Settle first, then hand over the answer: the card is paid for every answer that leaves the enclave.
  const resultHash = sha256Hex(answer);
  // The network sometimes drops or expires a transaction, so try a few times. If an
  // attempt reports failure but the job shows this answer as delivered, it did land.
  let recorded = false;
  for (let attempt = 1; attempt <= 3 && !recorded; attempt++) {
    try {
      await agent.call({
        methodName: "complete_job",
        args: { job_id: jobId, result_hash: resultHash },
        gas: BigInt("30000000000000"),
      });
      recorded = true;
    } catch (e) {
      console.error(`complete_job ${jobId} attempt ${attempt} failed:`, (e as Error).message);
      const now = await view<JobView & { result_hash: string | null }>(agent, "get_job", { job_id: jobId }).catch(() => null);
      if (now?.status === "Delivered" && now.result_hash === resultHash) recorded = true;
      else if (attempt < 3) await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  if (!recorded) {
    throw new HttpError(500, "Could not record the job onchain. Your payment is still in escrow: send the request again, or refund it 10 minutes after hiring.");
  }
  const result = { requestHash, result: answer, resultHash };
  putResult(jobId, result);
  // Once the customer's review window has passed, release the escrow to the card.
  // Fails harmlessly if the customer already accepted or rejected the answer.
  setTimeout(() => {
    agent
      .call({ methodName: "settle_job", args: { job_id: jobId }, gas: BigInt("30000000000000") })
      .then(() => console.log(`job ${jobId} settled`))
      .catch(() => {});
  }, REVIEW_WINDOW_MS + 20_000).unref();
  counters.jobsCompleted++;
  console.log(`job ${jobId} (card ${job.token_id}) completed`);
  return result;
}
