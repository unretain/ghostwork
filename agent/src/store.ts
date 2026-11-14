// What the agent keeps on disk. Inside the TEE this directory is an encrypted
// volume, so sealed skills survive restarts without ever leaving the enclave.
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

export const sha256Hex = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
/** Commitment stored onchain: sha256(salt + "\n" + text). The salt stops anyone guessing short texts. */
export const commitment = (salt: string, text: string) => sha256Hex(`${salt}\n${text}`);
