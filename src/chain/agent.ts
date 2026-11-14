// Talking to the TEE agent. Private text (instructions, requests, answers) goes
// here over HTTPS and never onto the chain.
import { AGENT_URL } from "./config";

export type AgentStatus = {
  accountId: string;
  contractId: string;
  registered: boolean;
  llm: { mode: "live" | "off"; model: string };
  /** token id -> hash of the instructions the agent currently holds */
  skills: Record<string, string>;
  /** token id -> the kinds of ability the card has, e.g. ["tool", "photos"] */
  abilities?: Record<string, string[]>;
  jobsCompleted: number;
};

export async function agentStatus(): Promise<AgentStatus | null> {
  try {
    const res = await fetch(`${AGENT_URL}/api/status`, { signal: AbortSignal.timeout(6000) });
    return res.ok ? ((await res.json()) as AgentStatus) : null;
  } catch {
    return null;
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${AGENT_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("The agent is offline. Your payment is safe: it can be refunded 10 minutes after hiring.");
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Agent error (${res.status})`);
  return json as T;
}

export const deliverSkill = (tokenId: string, salt: string, prompt: string) =>
  post<{ sealed: boolean }>("/api/skill", { token_id: tokenId, salt, prompt });

export const deliverJob = (jobId: string, nonce: string, request: string, photo?: string) =>
  post<{ result: string; result_hash: string }>("/api/job", { job_id: jobId, nonce, request, ...(photo ? { photo } : {}) });

// ---- Radius: task proofs ----

export type TaskProof = { approved: boolean; verdict: string; photo: string | null; taken_ms: number };

/** Hand a proof to the agent after its commitment was signed onchain. Returns the result of the check. */
export async function sendProof(proof: { task_id: string; lat: string; lon: string; taken_ms: string; photo: string }) {
  let res: Response;
  try {
    res = await fetch(`${AGENT_URL}/api/proof`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(proof) });
  } catch {
    throw new Error("The agent that checks proofs is offline. Your proof is signed onchain: send it again when the agent is back.");
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Agent error (${res.status})`);
  return json as { approved: boolean; verdict: string };
}

/** The accepted proof of a finished task (photo and written result), if the agent has it. */
export async function getTaskProof(taskId: string): Promise<TaskProof | null> {
  try {
    const res = await fetch(`${AGENT_URL}/api/tasks/${taskId}/proof`, { signal: AbortSignal.timeout(8000) });
    return res.ok ? ((await res.json()) as TaskProof) : null;
  } catch {
    return null;
  }
}
