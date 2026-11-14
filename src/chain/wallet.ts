// Two ways to sign: a real NEAR wallet (near-connect), or a guest account created
// on the spot through the testnet faucet with its key kept in this browser.
// Guests let anyone try the app in one click, with no extension.
import { NearConnector } from "@hot-labs/near-connect";
import { Account, KeyPair } from "near-api-js";
import { useEffect, useState } from "react";
import { CALL_GAS, CONTRACT_ID, FAUCET_URL, NEAR_RPC, NETWORK } from "./config";

export type Session = { kind: "wallet" | "guest"; accountId: string };

const GUEST_KEY = "gw:guest";
const GUEST_ACTIVE = "gw:guest:active";
type StoredGuest = { accountId: string; key: string };

const connector = new NearConnector({ network: NETWORK });
const listeners = new Set<(s: Session | null) => void>();
let session: Session | null = null;
let guest: Account | null = null;

function set(next: Session | null) {
  session = next;
  listeners.forEach((l) => l(next));
}

function loadGuest(): StoredGuest | null {
  try {
    return JSON.parse(localStorage.getItem(GUEST_KEY) ?? "null");
  } catch {
    return null;
  }
}

function activateGuest(g: StoredGuest) {
  guest = new Account(g.accountId, NEAR_RPC, g.key as `ed25519:${string}`);
  localStorage.setItem(GUEST_ACTIVE, "1");
  set({ kind: "guest", accountId: g.accountId });
}

// restore whichever session was active
{
  const g = loadGuest();
  if (g && localStorage.getItem(GUEST_ACTIVE)) activateGuest(g);
}
connector.on("wallet:signIn", (e) => {
  const id = e.accounts[0]?.accountId;
  if (id) {
    localStorage.removeItem(GUEST_ACTIVE);
    guest = null;
    set({ kind: "wallet", accountId: id });
  }
});
connector.on("wallet:signOut", () => session?.kind === "wallet" && set(null));
connector
  .getConnectedWallet()
  .then(({ accounts }) => !session && accounts[0] && set({ kind: "wallet", accountId: accounts[0].accountId }))
  .catch(() => {});

export function useSession() {
  const [s, setS] = useState<Session | null>(session);
  useEffect(() => {
    listeners.add(setS);
    setS(session);
    return () => {
      listeners.delete(setS);
    };
  }, []);
  return s;
}

export const connectWallet = () => connector.connect();

/** Create (or resume) a throwaway testnet account funded by the faucet. */
export async function startGuest() {
  const existing = loadGuest();
  if (existing) return activateGuest(existing);
  const key = KeyPair.fromRandom("ed25519");
  const suffix = Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => b.toString(16).padStart(2, "0")).join("");
  const accountId = `gw-guest-${suffix}.testnet`;
  const res = await fetch(FAUCET_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newAccountId: accountId, newAccountPublicKey: key.getPublicKey().toString() }),
  });
  if (!res.ok) throw new Error(`The testnet faucet refused (${res.status}). Try again in a minute, or connect a wallet.`);
  const stored = { accountId, key: key.toString() };
  localStorage.setItem(GUEST_KEY, JSON.stringify(stored));
  activateGuest(stored);
}

export async function signOut() {
  if (session?.kind === "guest") {
    // keep the key so the same guest (and its cards) can be resumed
    localStorage.removeItem(GUEST_ACTIVE);
    guest = null;
    set(null);
  } else {
    await connector.disconnect();
    set(null);
  }
}

type Outcome = {
  status?: { SuccessValue?: string; Failure?: unknown } | string;
  transaction?: { hash?: string };
  transaction_outcome?: { id?: string };
};

function failureMessage(failure: unknown): string {
  const text = JSON.stringify(failure);
  const m = text.match(/Smart contract panicked: ([^"\\]+)/) ?? text.match(/"ExecutionError":"([^"]+)"/);
  return m ? m[1] : `Transaction failed: ${text.slice(0, 200)}`;
}

function decode<T>(outcome: Outcome): T | null {
  const status = outcome?.status;
  if (!status || typeof status === "string") return null;
  if (status.Failure) throw new Error(failureMessage(status.Failure));
  if (!status.SuccessValue) return null;
  const text = new TextDecoder().decode(Uint8Array.from(atob(status.SuccessValue), (c) => c.charCodeAt(0)));
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

/** Call a method on the GHOSTWORK contract as the current session. */
export async function call<T = unknown>(
  methodName: string,
  args: Record<string, unknown>,
  { gas = CALL_GAS, deposit = "0" }: { gas?: string; deposit?: string } = {},
): Promise<{ result: T | null; txHash: string | undefined }> {
  if (!session) throw new Error("Connect a wallet or start as a guest first");
  let outcome: Outcome;
  try {
    if (session.kind === "guest" && guest) {
      outcome = (await guest.callFunctionRaw({
        contractId: CONTRACT_ID,
        methodName,
        args,
        gas: BigInt(gas),
        deposit: BigInt(deposit),
      })) as unknown as Outcome;
    } else {
      const wallet = await connector.wallet();
      outcome = (await wallet.signAndSendTransaction({
        receiverId: CONTRACT_ID,
        actions: [{ type: "FunctionCall", params: { methodName, args, gas, deposit } }],
      })) as unknown as Outcome;
    }
  } catch (e) {
    // the SDK throws on contract panics; surface the contract's own message
    throw new Error(failureMessage((e as Error).message ?? e));
  }
  return {
    result: decode<T>(outcome),
    txHash: outcome?.transaction?.hash ?? outcome?.transaction_outcome?.id,
  };
}
