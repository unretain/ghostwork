// Live prices from NEAR Intents (the 1Click API's public token list).
// Intents runs on NEAR mainnet only, so on testnet it is used for prices, not payments.
import { useEffect, useState } from "react";

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
