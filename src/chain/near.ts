// Read-only contract views over JSON-RPC, plus the shapes the contract returns.
// No wallet or SDK needed, so the landing page can use this too.
import { CONTRACT_ID, NEAR_RPC } from "./config";

export type Job = {
  job_id: string;
  token_id: string;
  customer: string;
  request_hash: string;
  paid: string;
  /** Open: paid, waiting. Delivered: answered, under review. Done: accepted, card paid. Rejected: refunded. */
  status: "Open" | "Delivered" | "Done" | "Rejected";
  created_ms: string;
  completed_ms: string | null;
  result_hash: string | null;
  rating: number | null;
  worker: string | null;
};

/** Stored on the NFT at mint: the card's background colour (one of PALETTE). */
export type Traits = { color: string };

/** The contract's palette (art.rs). Name -> the colour used for the card's accents. */
export const PALETTE: Record<string, string> = {
  Ember: "#e8634a",
  Sun: "#eeb04f",
  Moss: "#5fae7a",
  Tide: "#4f97d8",
  Iris: "#9a76de",
  Bone: "#a39d93",
};

export type Card = {
  token_id: string;
  owner_id: string;
  title: string | null;
  skill: string;
  about: string;
  prompt_hash: string | null;
  price: string;
  balance: string;
  earned: string;
  jobs_done: string;
  /** answers customers rejected and were refunded for */
  rejected: string;
  rating_sum: string;
  rating_count: string;
  path: string;
  signatures: string;
  minted_at_ms: string;
  /** asking price in yoctoNEAR while the card is for sale */
  listed_price: string | null;
  /** the card art (SVG data URI) stored in the NFT metadata */
  media: string | null;
  traits: Traits;
  recent_jobs: Job[];
};

export type Stats = {
  cards: string;
  jobs_completed: string;
  volume: string;
  min_price: string;
  operator_bps: number;
  protocol_bps: number;
  refund_after_ms: string;
  review_window_ms: string;
};

export type ContractInfo = { requires_tee: boolean; owner_id: string; mpc_contract_id: string };

async function rpc<T>(method: string, params: unknown): Promise<T> {
  const res = await fetch(NEAR_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "ghostwork", method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.data ?? json.error.message);
  return json.result as T;
}

const b64 = (s: string) => btoa(unescape(encodeURIComponent(s)));

export async function view<T>(method: string, args: Record<string, unknown> = {}): Promise<T> {
  const result = await rpc<{ result?: number[]; error?: string }>("query", {
    request_type: "call_function",
    finality: "optimistic",
    account_id: CONTRACT_ID,
    method_name: method,
    args_base64: b64(JSON.stringify(args)),
  });
  if (result.error || !result.result) throw new Error(result.error ?? "Empty response");
  return JSON.parse(new TextDecoder().decode(new Uint8Array(result.result))) as T;
}

export const getCard = (tokenId: string) => view<Card | null>("get_card", { token_id: tokenId });
export const getCards = () => view<Card[]>("get_cards", { from_index: "0", limit: 100 });
export const getStats = () => view<Stats>("get_stats");

/** The art the next card would get, rendered by the contract. `null` = the colour chance would pick. */
export const previewArt = (color: string | null) => view<[string, Traits]>("preview_art", { color });
export const getContractInfo = () => view<ContractInfo>("get_contract_info");

export async function getBalance(accountId: string): Promise<bigint> {
  const acc = await rpc<{ amount: string }>("query", {
    request_type: "view_account",
    finality: "optimistic",
    account_id: accountId,
  });
  return BigInt(acc.amount);
}

// ---- NEAR amounts ----
const YOCTO = 10n ** 24n;

/** yoctoNEAR -> "0.085" (trimmed, up to `dp` decimals) */
export function near(yocto: string | bigint, dp = 3): string {
  const v = BigInt(yocto);
  const scale = 10n ** BigInt(dp);
  const scaled = (v * scale + YOCTO / 2n) / YOCTO;
  const whole = scaled / scale;
  const frac = (scaled % scale).toString().padStart(dp, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

/** "0.1" -> yoctoNEAR string; returns null if it isn't a number */
export function toYocto(amount: string): string | null {
  const m = amount.trim().match(/^(\d+)(?:\.(\d{1,24}))?$/);
  if (!m) return null;
  return (BigInt(m[1]) * YOCTO + BigInt((m[2] ?? "").padEnd(24, "0"))).toString();
}

export const rating = (c: Pick<Card, "rating_sum" | "rating_count">) =>
  Number(c.rating_count) ? Number(c.rating_sum) / Number(c.rating_count) : null;
