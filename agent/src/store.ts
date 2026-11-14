// What the agent keeps on disk: sealed skills, recent answers and accepted task proofs.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIR = process.env.DATA_DIR || "./data";
mkdirSync(DIR, { recursive: true });

export type Skill = { hash: string; salt: string; prompt: string };
export type Result = { requestHash: string; result: string; resultHash: string };

function load<T>(name: string, fallback: T): T {
  const file = join(DIR, name);
  if (!existsSync(file)) return fallback;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function save(name: string, value: unknown) {
  const file = join(DIR, name);
  writeFileSync(`${file}.tmp`, JSON.stringify(value));
  renameSync(`${file}.tmp`, file);
}

const skills = load<Record<string, Skill>>("skills.json", {});
const results = load<Record<string, Result>>("results.json", {});
const MAX_RESULTS = 500;

export const getSkill = (tokenId: string): Skill | undefined => skills[tokenId];
export const skillHashes = () => Object.fromEntries(Object.entries(skills).map(([id, s]) => [id, s.hash]));
export function putSkill(tokenId: string, skill: Skill) {
  skills[tokenId] = skill;
  save("skills.json", skills);
}

export const getResult = (jobId: string): Result | undefined => results[jobId];
export function putResult(jobId: string, result: Result) {
  results[jobId] = result;
  const ids = Object.keys(results);
  for (const id of ids.slice(0, Math.max(0, ids.length - MAX_RESULTS))) delete results[id];
  save("results.json", results);
}

/** The outcome of checking one task proof. The photo is kept only when it was accepted. */
export type ProofRecord = {
  proofHash: string;
  approved: boolean;
  verdict: string;
  verdictHash: string;
  lat: number;
  lon: number;
  takenMs: number;
  photo: string | null;
};
mkdirSync(join(DIR, "proofs"), { recursive: true });
const proofFile = (taskId: string) => join("proofs", `${taskId.replace(/\D/g, "")}.json`);
export const getProof = (taskId: string) => load<ProofRecord | null>(proofFile(taskId), null);
export const putProof = (taskId: string, record: ProofRecord) => save(proofFile(taskId), record);

export const sha256Hex = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
/** Commitment stored onchain: sha256(salt + "\n" + text). The salt stops anyone guessing short texts. */
export const commitment = (salt: string, text: string) => sha256Hex(`${salt}\n${text}`);
