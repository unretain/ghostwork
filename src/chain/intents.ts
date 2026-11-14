// Live prices from NEAR Intents (the 1Click API's public token list).
// Intents runs on NEAR mainnet only: on testnet it is used for prices, on mainnet also for
// paying from other chains (see the second half of this file).
import { useEffect, useState } from "react";
import { NEAR_RPC } from "./config";

const TOKENS_URL = "https://1click.chaindefuser.com/v0/tokens";
const MAX_AGE_MS = 60_000;

type Token = { assetId: string; price: number };
export type Rates = { nearUsd: number; solUsd: number };

let cached: { at: number; rates: Promise<Rates | null> } | null = null;

export function getRates(): Promise<Rates | null> {
  if (cached && Date.now() - cached.at < MAX_AGE_MS) return cached.rates;
  const rates = fetch(TOKENS_URL)
    .then((r) => (r.ok ? (r.json() as Promise<Token[]>) : Promise.reject()))
    .then((tokens) => {
      const usd = (id: string) => tokens.find((t) => t.assetId === id)?.price ?? 0;
      const nearUsd = usd("nep141:wrap.near");
      const solUsd = usd("nep141:sol.omft.near");
      return nearUsd > 0 && solUsd > 0 ? { nearUsd, solUsd } : null;
    })
    .catch(() => null);
  cached = { at: Date.now(), rates };
  return rates;
}

export function useRates() {
  const [rates, setRates] = useState<Rates | null>(null);
  useEffect(() => {
    let live = true;
    getRates().then((r) => live && setRates(r));
    return () => {
      live = false;
    };
  }, []);
  return rates;
}

/** "≈ $0.33 · 0.0044 SOL" for an amount in NEAR, or null while rates are unknown. */
export function worth(nearAmount: number, rates: Rates | null) {
  if (!rates || !Number.isFinite(nearAmount)) return null;
  const usd = nearAmount * rates.nearUsd;
  const sol = usd / rates.solUsd;
  return `≈ $${usd < 10 ? usd.toFixed(2) : usd.toFixed(0)} · ${sol.toPrecision(2)} SOL`;
}

// ---- paying from another chain (mainnet only) ----
// The 1Click API gives a deposit address on the chain the user pays from. Once the
// payment lands there, NEAR Intents swaps it and sends NEAR to the user's account.

const API = "https://1click.chaindefuser.com/v0";
const NEAR_ASSET = "nep141:wrap.near";
export const WNEAR_CONTRACT = "wrap.near";

/** What a top-up can be paid with. Asset ids come from the 1Click token list. */
export const PAY_OPTIONS = [
  { id: "nep141:sol.omft.near", label: "SOL", chain: "Solana" },
  { id: "nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near", label: "USDC", chain: "Solana" },
  { id: "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near", label: "USDC", chain: "Base" },
  { id: "nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near", label: "USDC", chain: "Arbitrum" },
  { id: "nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near", label: "USDC", chain: "Ethereum" },
  { id: "nep141:eth.omft.near", label: "ETH", chain: "Ethereum" },
  { id: "nep141:base.omft.near", label: "ETH", chain: "Base" },
  { id: "nep141:btc.omft.near", label: "BTC", chain: "Bitcoin" },
] as const;

export type TopUpQuote = {
  depositAddress: string;
  depositMemo?: string;
  /** Exact amount to send, already in whole units of the paying token. */
  amountInFormatted: string;
  amountInUsd: string;
  amountOutFormatted: string;
  timeEstimate: number;
  deadline: string;
};

export type TopUpStatus = "PENDING_DEPOSIT" | "KNOWN_DEPOSIT_TX" | "PROCESSING" | "SUCCESS" | "INCOMPLETE_DEPOSIT" | "REFUNDED" | "FAILED";

/**
 * Ask for a deposit address that turns a payment on another chain into `nearAmount` NEAR
 * for `recipient`. `refundTo` is the payer's own address on the paying chain; the payment
 * goes back there if the swap cannot be done.
 */
export async function requestTopUp(originAsset: string, nearAmount: string, recipient: string, refundTo: string): Promise<TopUpQuote> {
  const [whole, frac = ""] = nearAmount.trim().split(".");
  const yocto = BigInt(whole || "0") * 10n ** 24n + BigInt((frac + "0".repeat(24)).slice(0, 24));
  const res = await fetch(`${API}/quote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      dry: false,
      swapType: "EXACT_OUTPUT",
      slippageTolerance: 100, // 1%
      originAsset,
      depositType: "ORIGIN_CHAIN",
      destinationAsset: NEAR_ASSET,
      amount: yocto.toString(),
      refundTo,
      refundType: "ORIGIN_CHAIN",
      recipient,
      recipientType: "DESTINATION_CHAIN",
      deadline: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.quote?.depositAddress) {
    const message: string = json?.message ?? `NEAR Intents refused the request (${res.status})`;
    // the API states minimums in yoctoNEAR; show them in NEAR
    throw new Error(message.replace(/at least (\d{20,})/, (_, y: string) => `at least ${(Number(y) / 1e24).toFixed(2)} NEAR`));
  }
  return json.quote as TopUpQuote;
}

export async function topUpStatus(q: Pick<TopUpQuote, "depositAddress" | "depositMemo">): Promise<TopUpStatus | null> {
  const params = new URLSearchParams({ depositAddress: q.depositAddress, ...(q.depositMemo ? { depositMemo: q.depositMemo } : {}) });
  const res = await fetch(`${API}/status?${params}`).catch(() => null);
  if (!res?.ok) return null;
  return ((await res.json()) as { status?: TopUpStatus }).status ?? null;
}

/** Wrapped NEAR held by an account, in yocto. A top-up can arrive in this form. */
export async function wnearBalance(accountId: string): Promise<bigint> {
  const res = await fetch(NEAR_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "ghostwork",
      method: "query",
      params: {
        request_type: "call_function",
        finality: "optimistic",
        account_id: WNEAR_CONTRACT,
        method_name: "ft_balance_of",
        args_base64: btoa(JSON.stringify({ account_id: accountId })),
      },
    }),
  });
  const bytes: number[] | undefined = (await res.json())?.result?.result;
  return bytes ? BigInt(JSON.parse(new TextDecoder().decode(new Uint8Array(bytes)))) : 0n;
}
