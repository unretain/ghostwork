// "Add funds": pay from another chain and receive NEAR, through NEAR Intents.
// Works on mainnet only, because NEAR Intents does not exist on testnet.
import { useEffect, useState } from "react";
import { NETWORK } from "../../chain/config";
import { PAY_OPTIONS, requestTopUp, topUpStatus, WNEAR_CONTRACT, wnearBalance, type TopUpQuote, type TopUpStatus } from "../../chain/intents";
import { near } from "../../chain/near";
import { call } from "../../chain/wallet";
import { QrCode } from "./AgentCard";

const STATUS_TEXT: Record<TopUpStatus, string> = {
  PENDING_DEPOSIT: "Waiting for your payment…",
  KNOWN_DEPOSIT_TX: "Payment seen. Waiting for it to confirm…",
  PROCESSING: "Payment received. Swapping to NEAR…",
  SUCCESS: "Done. The NEAR was sent to your account.",
  INCOMPLETE_DEPOSIT: "Less than the quoted amount arrived. Send the rest, or wait for the refund.",
  REFUNDED: "The swap could not be done. Your payment was sent back to your refund address.",
  FAILED: "The swap failed. Your payment goes back to your refund address.",
};
const FINISHED: TopUpStatus[] = ["SUCCESS", "REFUNDED", "FAILED"];

export function TopUp({ accountId, onClose, onArrived }: { accountId: string; onClose: () => void; onArrived: () => void }) {
  const [asset, setAsset] = useState<string>(PAY_OPTIONS[0].id);
  const [amount, setAmount] = useState("1");
  const [refundTo, setRefundTo] = useState("");
  const [quote, setQuote] = useState<TopUpQuote | null>(null);
  const [status, setStatus] = useState<TopUpStatus | null>(null);
  const [wrapped, setWrapped] = useState(0n);
  const [busy, setBusy] = useState<"quote" | "unwrap" | null>(null);
  const [error, setError] = useState("");

  const option = PAY_OPTIONS.find((o) => o.id === asset)!;
  const mainnet = NETWORK === "mainnet";

  // a top-up can arrive as wrapped NEAR; show it so it can be unwrapped
  useEffect(() => {
    if (!mainnet) return;
    wnearBalance(accountId)
      .then(setWrapped)
      .catch(() => {});
  }, [accountId, mainnet, status]);

  // follow the payment until it finishes
  useEffect(() => {
    if (!quote || (status && FINISHED.includes(status))) return;
    const id = setInterval(async () => {
      const next = await topUpStatus(quote);
      if (!next) return;
      setStatus(next);
      if (next === "SUCCESS") onArrived();
    }, 5000);
    return () => clearInterval(id);
  }, [quote, status, onArrived]);

  const attempt = async (what: "quote" | "unwrap", fn: () => Promise<void>) => {
    setBusy(what);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message || "Something went wrong");
    } finally {
      setBusy(null);
    }
  };

  const getAddress = () =>
    attempt("quote", async () => {
      setStatus(null);
      setQuote(await requestTopUp(asset, amount, accountId, refundTo.trim()));
    });

  const unwrap = () =>
    attempt("unwrap", async () => {
      await call("near_withdraw", { amount: wrapped.toString() }, { contractId: WNEAR_CONTRACT, deposit: "1" });
      setWrapped(0n);
      onArrived();
    });

  return (
    <div className="topup" role="dialog" aria-label="Add funds">
      <div className="topup__head">
        <strong>Add funds from another chain</strong>
        <button className="topup__close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      {!mainnet ? (
        <p className="muted">
          Paying from another chain uses NEAR Intents, which only exists on NEAR mainnet. This site is running on testnet, where NEAR is free: use a
          guest account or a testnet faucet instead.
        </p>
      ) : quote ? (
        <>
          <p className="muted">
            Send exactly this amount of {option.label} on {option.chain} to the address below. About {Math.max(1, Math.round(quote.timeEstimate / 60))}{" "}
            minute after it confirms, {quote.amountOutFormatted} NEAR is sent to {accountId}.
          </p>
          <div className="topup__pay">
            <QrCode value={quote.depositAddress} />
            <div className="topup__rows">
              <span className="topup__k">Amount</span>
              <code className="topup__v">
                {quote.amountInFormatted} {option.label}
              </code>
              <span className="topup__k">Address ({option.chain})</span>
              <code className="topup__v">{quote.depositAddress}</code>
              {quote.depositMemo && (
                <>
                  <span className="topup__k">Memo (required)</span>
                  <code className="topup__v">{quote.depositMemo}</code>
                </>
              )}
            </div>
          </div>
          <div className="topup__actions">
            <button className="kyd-button kyd-button--compact kyd-button--frame" onClick={() => navigator.clipboard?.writeText(quote.depositAddress)}>
              Copy address
            </button>
            <button className="kyd-button kyd-button--compact kyd-button--frame" onClick={() => navigator.clipboard?.writeText(quote.amountInFormatted)}>
              Copy amount
            </button>
            <button className="kyd-button kyd-button--compact kyd-button--frame" onClick={() => (setQuote(null), setStatus(null))}>
              Start over
            </button>
          </div>
          <p className="topup__status">{STATUS_TEXT[status ?? "PENDING_DEPOSIT"]}</p>
          <p className="muted">
            This address is for one payment and stops working at {new Date(quote.deadline).toLocaleString()}. Anything sent beyond the amount is
            returned to your refund address.
          </p>
        </>
      ) : (
        <>
          <p className="muted">
            Pay with a token on another chain and get NEAR in {accountId}. The swap is done by NEAR Intents; its rate and fee are included in the
            amount you are shown next.
          </p>
          <label className="topup__label">
            Pay with
            <select className="field" value={asset} onChange={(e) => setAsset(e.target.value)}>
              {PAY_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label} on {o.chain}
                </option>
              ))}
            </select>
          </label>
          <label className="topup__label">
            NEAR to receive
            <input className="field" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} />
          </label>
          <label className="topup__label">
            Your {option.chain} address (refunds go here)
            <input className="field" placeholder={`The ${option.chain} address you are paying from`} value={refundTo} onChange={(e) => setRefundTo(e.target.value)} />
          </label>
          <button
            className="kyd-button kyd-button--compact kyd-button--cool"
            disabled={busy !== null || !(Number(amount) > 0) || refundTo.trim().length < 20}
            onClick={getAddress}
          >
            {busy === "quote" ? "Asking NEAR Intents…" : "Get payment address"}
          </button>
        </>
      )}

      {mainnet && wrapped > 0n && (
        <div className="topup__wrapped">
          <span className="muted">
            Your account holds {near(wrapped, 3)} wrapped NEAR (wNEAR). It has to be unwrapped before it can pay for jobs.
          </span>
          <button className="kyd-button kyd-button--compact kyd-button--frame" disabled={busy !== null} onClick={unwrap}>
            {busy === "unwrap" ? "Unwrapping…" : "Unwrap"}
          </button>
        </div>
      )}
      {error && <p className="topup__error">{error}</p>}
    </div>
  );
}
