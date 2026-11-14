// Commitments and the private text behind them. The text stays in this browser
// (and inside the agent); only the hashes go onchain.

export async function sha256Hex(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** sha256(salt + "\n" + text): the same formula the agent checks. */
export const commitment = (salt: string, text: string) => sha256Hex(`${salt}\n${text}`);

export const randomHex = (bytes = 16) =>
  Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, "0")).join("");

function read<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") as T | null;
  } catch {
    return null;
  }
}
const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: the flow still works for this page load */
  }
};

export type SkillSecret = { salt: string; prompt: string };
export const saveSkill = (hash: string, s: SkillSecret) => write(`gw:skill:${hash}`, s);
export const loadSkill = (hash: string) => read<SkillSecret>(`gw:skill:${hash}`);

export type RequestSecret = { nonce: string; request: string; photo?: string };
export const saveRequest = (hash: string, r: RequestSecret) => write(`gw:req:${hash}`, r);
export const loadRequest = (hash: string) => read<RequestSecret>(`gw:req:${hash}`);

export const saveAnswer = (jobId: string, answer: string) => write(`gw:answer:${jobId}`, answer);
export const loadAnswer = (jobId: string) => read<string>(`gw:answer:${jobId}`);
