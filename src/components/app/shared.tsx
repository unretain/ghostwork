import { useEffect, useState } from "react";
import { GUESTS_AVAILABLE, NETWORK } from "../../chain/config";
import { getBalance, near } from "../../chain/near";
import { connectWallet, signOut, startGuest, useSession } from "../../chain/wallet";
import { TopUp } from "./TopUp";

// ---- toasts ----
export type Toast = { kind: "ok" | "err"; text: string; href?: string };
let pushToast: (t: Toast | null) => void = () => {};
export const toast = (kind: Toast["kind"], text: string, href?: string) => pushToast({ kind, text: text.slice(0, 240), href });

export function Toaster() {
  const [t, setT] = useState<Toast | null>(null);
  useEffect(() => {
    pushToast = setT;
    return () => {
      pushToast = () => {};
    };
  }, []);
  useEffect(() => {
    if (!t) return;
    const id = setTimeout(() => setT(null), t.kind === "err" ? 9000 : 5000);
    return () => clearTimeout(id);
  }, [t]);
  if (!t) return null;
  return (
    <div className={`toast toast--${t.kind}`} role="status" onClick={() => setT(null)}>
      {t.text}
      {t.href && (
        <a href={t.href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
          View
        </a>
      )}
    </div>
  );
}

/** Run an async action with a busy label and error toast. */
export function useBusy() {
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      toast("err", (e as Error).message || "Something went wrong");
    } finally {
      setBusy(null);
    }
  };
  return { busy, run };
}

export const short = (s: string, n = 6) => (s.length > 2 * n + 1 ? `${s.slice(0, n)}…${s.slice(-n)}` : s);

export function ago(ms: string | number) {
  const s = Math.max(0, Math.round((Date.now() - Number(ms)) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ---- session ----
export function ConnectButtons({ compact = false }: { compact?: boolean }) {
  const { busy, run } = useBusy();
  const size = compact ? "kyd-button--compact" : "kyd-button--hero";
  return (
    <div className="connect">
      {GUESTS_AVAILABLE && (
        <button className={`kyd-button ${size} kyd-button--cool`} disabled={!!busy} onClick={() => run("guest", startGuest)}>
          {busy === "guest" ? "Creating account…" : "Try as guest"}
        </button>
      )}
      <button
        className={`kyd-button ${size} ${GUESTS_AVAILABLE ? "kyd-button--line" : "kyd-button--cool"}`}
        disabled={!!busy}
        onClick={() => run("wallet", async () => void (await connectWallet()))}
      >
        Connect NEAR wallet
      </button>
    </div>
  );
}

export function SessionBar({ tick }: { tick?: unknown }) {
  const session = useSession();
  const [balance, setBalance] = useState<bigint | null>(null);
  const [adding, setAdding] = useState(false);
  const [arrived, setArrived] = useState(0);
  useEffect(() => {
    setBalance(null);
    if (!session) return;
    let live = true;
    getBalance(session.accountId)
      .then((b) => live && setBalance(b))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [session, tick, arrived]);

  if (!session) return <ConnectButtons />;
  return (
    <div className="session">
      <div>
        <div className="session__id">
          {session.kind === "guest" && <span className="session__tag">Guest</span>}
          {session.accountId}
        </div>
        <div className="session__bal">{balance === null ? "…" : `${near(balance, 2)} NEAR${NETWORK === "testnet" ? " (testnet)" : ""}`}</div>
      </div>
      <button className="kyd-button kyd-button--compact kyd-button--frame" onClick={() => setAdding((v) => !v)}>
        Add funds
      </button>
      <button className="kyd-button kyd-button--compact kyd-button--frame" onClick={() => signOut()}>
        Disconnect
      </button>
      {adding && <TopUp accountId={session.accountId} onClose={() => setAdding(false)} onArrived={() => setArrived((n) => n + 1)} />}
    </div>
  );
}
