import { useCallback, useEffect, useRef, useState } from "react";
import { agentStatus, deliverJob, deliverSkill, type AgentStatus } from "../../chain/agent";
import { cardUrl, CONTRACT_ID, MINT_GAS, NEAR_EXPLORER, NETWORK, SEPOLIA_EXPLORER } from "../../chain/config";
import { getCard, getContractInfo, getStats, near, toYocto, type Card, type ContractInfo, type Job, type Stats } from "../../chain/near";
import { useRates, worth } from "../../chain/intents";
import { call, useSession } from "../../chain/wallet";
import { commitment, loadAnswer, loadRequest, loadSkill, randomHex, saveAnswer, saveRequest, saveSkill } from "../../lib/vault";
import { AgentCard, faceOf } from "./AgentCard";
import { ago, ConnectButtons, SessionBar, short, toast, useBusy } from "./shared";

type Props = { card: Card; account: string | null; onChange: () => Promise<void> | void };

// ---------------------------------------------------------------- hire
function Stars({ onRate, disabled }: { onRate: (n: number) => void; disabled: boolean }) {
  const [hover, setHover] = useState(0);
  return (
    <span className="stars" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} disabled={disabled} className={n <= hover ? "on" : ""} onMouseEnter={() => setHover(n)} onClick={() => onRate(n)} aria-label={`${n} star${n > 1 ? "s" : ""}`}>
          ★
        </button>
      ))}
    </span>
  );
}

function HirePanel({ card, account, onChange, stats }: Props & { stats: Stats | null }) {
  const [request, setRequest] = useState("");
  const [phase, setPhase] = useState<"idle" | "paying" | "working">("idle");
  const { busy, run } = useBusy();
  const resumed = useRef(new Set<string>());
  const isOwner = account === card.owner_id;

  const finish = useCallback(
    async (jobId: string, nonce: string, text: string) => {
      setPhase("working");
      try {
        const { result } = await deliverJob(jobId, nonce, text);
        saveAnswer(jobId, result);
        setRequest("");
      } finally {
        setPhase("idle");
        await onChange();
      }
    },
    [onChange],
  );

  const hire = () =>
    run("hire", async () => {
      const text = request.trim();
      const nonce = randomHex();
      const hash = await commitment(nonce, text);
      saveRequest(hash, { nonce, request: text });
      setPhase("paying");
      let jobId: string | null = null;
      try {
        jobId = (await call<string>("hire", { token_id: card.token_id, request_hash: hash }, { deposit: card.price })).result;
        if (jobId === null) {
          // wallets that don't return results: find the job by its hash
          const fresh = await getCard(card.token_id);
          jobId = fresh?.recent_jobs.find((j) => j.request_hash === hash)?.job_id ?? null;
        }
      } catch (e) {
        setPhase("idle");
        throw e;
      }
      if (jobId === null) {
        setPhase("idle");
        throw new Error("Paid, but couldn't find the job yet. Reload this page to pick it up.");
      }
      resumed.current.add(jobId);
      await finish(String(jobId), nonce, text);
    });

  // My jobs on this card, newest first.
  const myJobs = account ? card.recent_jobs.filter((j) => j.customer === account) : [];

  // Pick up a paid job that never got its answer (page reload, wallet redirect).
  useEffect(() => {
    if (phase !== "idle") return;
    for (const j of myJobs) {
      const secret = j.status === "Open" ? loadRequest(j.request_hash) : null;
      if (!secret || resumed.current.has(j.job_id)) continue;
      resumed.current.add(j.job_id);
      finish(j.job_id, secret.nonce, secret.request).catch((e) => toast("err", (e as Error).message));
      break;
    }
  });

  const refundAfter = Number(stats?.refund_after_ms ?? 600_000);
  const priceWorth = worth(Number(near(card.price)), useRates());

  return (
    <section className="block hire">
      <h2 className="panel-title">Hire {card.title ?? "this agent"}</h2>
      {!card.prompt_hash ? (
        <p className="muted">This card has no skill sealed yet, so it can't take jobs.</p>
      ) : (
        <>
          <p className="muted">{card.about || card.skill}</p>
          <textarea
            className="field field--area"
            rows={5}
            maxLength={4000}
            placeholder="Type or paste what you want it to work on…"
            value={request}
            disabled={phase !== "idle"}
            onChange={(e) => setRequest(e.target.value)}
          />
          {priceWorth && (
            <p className="muted hire__worth">
              One job costs {near(card.price)} NEAR, {priceWorth} at live NEAR Intents rates.
            </p>
          )}
          {account ? (
            <div className="hire__go">
              <button className="kyd-button kyd-button--hero kyd-button--cool" disabled={phase !== "idle" || !!busy || request.trim().length < 2} onClick={hire}>
                {phase === "paying" ? "Paying…" : phase === "working" ? `${card.title ?? "Agent"} is working…` : `Pay ${near(card.price)} NEAR and run`}
              </button>
              <span className="muted">
                Your request goes to the agent privately; only its hash is stored onchain. If no answer comes, you can refund after{" "}
                {Math.round(refundAfter / 60000)} minutes. Answers are final, so check the card's ratings first.
              </span>
            </div>
          ) : (
            <div className="hire__go">
              <ConnectButtons compact />
              {NETWORK === "testnet" && <span className="muted">Guests get a free testnet account, so trying it costs nothing.</span>}
            </div>
          )}
        </>
      )}

      {myJobs.length > 0 && (
        <div className="answers">
          {myJobs.map((j) => {
            const answer = loadAnswer(j.job_id);
            const canRefund = j.status === "Open" && Date.now() - Number(j.created_ms) > refundAfter;
            return (
              <article className="answer" key={j.job_id}>
                <header>
                  <span className="mono">Job #{j.job_id}</span>
                  <span className="muted">
                    {near(j.paid)} NEAR · {ago(j.created_ms)}
                  </span>
                </header>
                {j.status === "Done" ? (
                  <>
                    <p className="answer__text">{answer ?? "Completed. The answer was delivered to the browser that paid for it."}</p>
                    <footer>
                      {j.rating ? (
                        <span className="muted">You rated it {"★".repeat(j.rating)}</span>
                      ) : isOwner ? (
                        <span className="muted">Owners can't rate their own card.</span>
                      ) : (
                        <>
                          <span className="muted">Rate this answer:</span>
                          <Stars
                            disabled={!!busy}
                            onRate={(n) =>
                              run("rate", async () => {
                                await call("rate_job", { job_id: j.job_id, stars: n });
                                await onChange();
                              })
                            }
                          />
                        </>
                      )}
                    </footer>
                  </>
                ) : (
                  <footer>
                    <span className="muted">{phase === "working" ? "Working…" : "Waiting for the agent."}</span>
                    {canRefund && (
                      <button
                        className="mini-btn"
                        disabled={!!busy}
                        onClick={() =>
                          run("refund", async () => {
                            await call("refund_job", { job_id: j.job_id });
                            toast("ok", "Refunded");
                            await onChange();
                          })
                        }
                      >
                        Refund {near(j.paid)} NEAR
                      </button>
                    )}
                  </footer>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- buy
function BuyPanel({ card, account, onChange }: Props) {
  const { busy, run } = useBusy();
  if (!card.listed_price) return null;
  return (
    <section className="block buy">
      <div>
        <h2 className="panel-title">This card is for sale</h2>
        <p className="muted">
          You get the NFT and everything on it: {near(card.balance)} NEAR of unclaimed earnings, its record of {card.jobs_done} jobs, its rating and its
          sealed skill. The skill keeps working, but stays sealed, even from you.
        </p>
      </div>
      {account ? (
        <button
          className="kyd-button kyd-button--hero kyd-button--cool"
          disabled={!!busy}
          onClick={() =>
            run("buy", async () => {
              const { txHash } = await call("buy_card", { token_id: card.token_id }, { deposit: card.listed_price!, gas: MINT_GAS });
              toast("ok", `You own ${card.title ?? "this card"} now`, txHash && `${NEAR_EXPLORER}/txns/${txHash}`);
              await onChange();
            })
          }
        >
          {busy ? "Buying…" : `Buy for ${near(card.listed_price)} NEAR`}
        </button>
      ) : (
        <ConnectButtons compact />
      )}
    </section>
  );
}

// ---------------------------------------------------------------- owner
type EvmModule = typeof import("../../chain/evm");

function Wallets({ card, onChange }: { card: Card; onChange: Props["onChange"] }) {
  const [evm, setEvm] = useState<EvmModule | null>(null);
  const [eth, setEth] = useState<`0x${string}` | null>(null);
  const [btc, setBtc] = useState<string | null>(null);
  const [bal, setBal] = useState<string | null>(null);
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("0.001");
  const { busy, run } = useBusy();

  const open = () =>
    run("wallets", async () => {
      const m = await import("../../chain/evm");
      setEvm(m);
      const address = await m.ethAddress(card.token_id);
      setEth(address);
      m.btcAddress(card.token_id).then(setBtc).catch(() => {});
      m.ethBalance(address)
        .then((b) => setBal((Number(b) / 1e18).toFixed(5)))
        .catch(() => {});
    });

  if (!evm || !eth) {
    return (
      <div className="kv">
        <span>
          Cross-chain wallets <span className="muted">(Ethereum and Bitcoin addresses this card controls)</span>
        </span>
        <button className="mini-btn" disabled={!!busy} onClick={open}>
          {busy ? "Deriving…" : "Show"}
        </button>
      </div>
    );
  }
  return (
    <>
      <div className="kv">
        <span>Ethereum · Sepolia</span>
        <span className="mono">
          <a href={`${SEPOLIA_EXPLORER}/address/${eth}`} target="_blank" rel="noopener noreferrer">
            {short(eth)}
          </a>{" "}
          · {bal ?? "…"} ETH
        </span>
      </div>
      <div className="kv">
        <span>Bitcoin · testnet4</span>
        <span className="mono">{btc ? short(btc, 8) : "…"}</span>
      </div>
      <div className="inline-form">
        <input className="field" placeholder="0x… send ETH to" value={to} onChange={(e) => setTo(e.target.value)} />
        <input className="field field--sm" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount in ETH" />
        <button
          className="kyd-button kyd-button--compact kyd-button--line"
          disabled={!!busy || !/^0x[0-9a-fA-F]{40}$/.test(to)}
          onClick={() =>
            run("send", async () => {
              const hash = await evm.ownerSend(card.token_id, to as `0x${string}`, amount);
              toast("ok", "Signed by NEAR Chain Signatures and sent on Sepolia", `${SEPOLIA_EXPLORER}/tx/${hash}`);
              await onChange();
            })
          }
        >
          {busy === "send" ? "Signing…" : "Send"}
        </button>
      </div>
    </>
  );
}

function OwnerPanel({ card, onChange, agent }: Props & { agent: AgentStatus | null | undefined }) {
  const [price, setPrice] = useState(near(card.price));
  const [prompt, setPrompt] = useState("");
  const [resealing, setResealing] = useState(false);
  const [receiver, setReceiver] = useState("");
  const [ask, setAsk] = useState(card.listed_price ? near(card.listed_price) : "5");
  const [budget, setBudget] = useState(near(card.task_budget));
  const [topUp, setTopUp] = useState("0.5");
  const { busy, run } = useBusy();

  const held = !!card.prompt_hash && agent?.skills[card.token_id] === card.prompt_hash;
  const local = card.prompt_hash ? loadSkill(card.prompt_hash) : null;

  const seal = () =>
    run("seal", async () => {
      const text = prompt.trim();
      const salt = randomHex();
      const hash = await commitment(salt, text);
      saveSkill(hash, { salt, prompt: text });
      await call("update_card", { token_id: card.token_id, prompt_hash: hash });
      await deliverSkill(card.token_id, salt, text);
      setPrompt("");
      setResealing(false);
      toast("ok", "New skill sealed");
      await onChange();
    });

  return (
    <section className="block owner">
      <h2 className="panel-title">You own this card</h2>

      <div className="claim">
        <div>
          <div className="claim__amount">{near(card.balance)} NEAR</div>
          <div className="muted">unclaimed earnings held by the card</div>
        </div>
        <button
          className="kyd-button kyd-button--hero kyd-button--cool"
          disabled={!!busy || BigInt(card.balance) === 0n}
          onClick={() =>
            run("claim", async () => {
              const { txHash } = await call("claim", { token_id: card.token_id });
              toast("ok", `Claimed ${near(card.balance)} NEAR`, txHash && `${NEAR_EXPLORER}/txns/${txHash}`);
              await onChange();
            })
          }
        >
          {busy === "claim" ? "Claiming…" : "Claim"}
        </button>
      </div>

      <div className="kv">
        <span>
          Hiring people <span className="muted">(Radius: the most this card may pay a person per task, from the earnings above)</span>
        </span>
        <span className="inline-form">
          <input className="field field--sm" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} aria-label="Most per task in NEAR" />
          <button
            className="mini-btn"
            disabled={!!busy || toYocto(budget) === null || toYocto(budget) === card.task_budget}
            onClick={() =>
              run("budget", async () => {
                await call("set_task_budget", { token_id: card.token_id, max_reward: toYocto(budget) });
                toast("ok", Number(budget) > 0 ? `This card may pay up to ${budget} NEAR per task` : "This card can no longer pay for tasks");
                await onChange();
              })
            }
          >
            Set limit
          </button>
        </span>
      </div>
      <div className="kv">
        <span>
          Add NEAR to the card <span className="muted">(a float, so it can pay for tasks before it has earned anything)</span>
        </span>
        <span className="inline-form">
          <input className="field field--sm" inputMode="decimal" value={topUp} onChange={(e) => setTopUp(e.target.value)} aria-label="NEAR to add" />
          <button
            className="mini-btn"
            disabled={!!busy || !toYocto(topUp) || toYocto(topUp) === "0"}
            onClick={() =>
              run("fund", async () => {
                await call("fund_card", { token_id: card.token_id }, { deposit: toYocto(topUp)! });
                toast("ok", `Added ${topUp} NEAR to the card`);
                await onChange();
              })
            }
          >
            Add
          </button>
        </span>
      </div>

      <div className="kv">
        <span>
          <span className={`dot ${held ? "dot--ok" : "dot--warn"}`} />
          {held ? "The agent holds this card's sealed skill" : agent ? "The agent doesn't have this card's skill" : "Agent offline"}
        </span>
        <span className="inline-form">
          {!held && local && agent && (
            <button
              className="mini-btn"
              disabled={!!busy}
              onClick={() =>
                run("deliver", async () => {
                  await deliverSkill(card.token_id, local.salt, local.prompt);
                  await onChange();
                })
              }
            >
              Deliver it
            </button>
          )}
          <button className="mini-btn" onClick={() => setResealing((v) => !v)}>
            {resealing ? "Cancel" : "Seal a new skill"}
          </button>
        </span>
      </div>
      {resealing && (
        <div className="reseal">
          <textarea className="field field--area" rows={5} maxLength={8000} placeholder="New private instructions…" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
          <button className="kyd-button kyd-button--compact kyd-button--cool" disabled={!!busy || prompt.trim().length < 20} onClick={seal}>
            {busy === "seal" ? "Sealing…" : "Seal"}
          </button>
        </div>
      )}

      <div className="kv">
        <span>Price per job</span>
        <span className="inline-form">
          <input className="field field--sm" value={price} onChange={(e) => setPrice(e.target.value)} aria-label="Price in NEAR" />
          <button
            className="mini-btn"
            disabled={!!busy || !toYocto(price) || toYocto(price) === card.price}
            onClick={() =>
              run("price", async () => {
                await call("update_card", { token_id: card.token_id, price: toYocto(price) });
                toast("ok", "Price updated");
                await onChange();
              })
            }
          >
            Set
          </button>
        </span>
      </div>

      <div className="kv">
        <span>
          {card.listed_price ? `For sale at ${near(card.listed_price)} NEAR` : "Sell this card"}{" "}
          <span className="muted">(the buyer gets its earnings, record and skill)</span>
        </span>
        <span className="inline-form">
          {card.listed_price ? (
            <button
              className="mini-btn"
              disabled={!!busy}
              onClick={() =>
                run("unlist", async () => {
                  await call("unlist_card", { token_id: card.token_id });
                  await onChange();
                })
              }
            >
              Take off the market
            </button>
          ) : (
            <>
              <input className="field field--sm" value={ask} onChange={(e) => setAsk(e.target.value)} aria-label="Asking price in NEAR" />
              <button
                className="mini-btn"
                disabled={!!busy || !toYocto(ask) || toYocto(ask) === "0"}
                onClick={() =>
                  run("list", async () => {
                    await call("list_card", { token_id: card.token_id, price: toYocto(ask) });
                    toast("ok", "Listed on the market");
                    await onChange();
                  })
                }
              >
                List for sale
              </button>
            </>
          )}
        </span>
      </div>

      <Wallets card={card} onChange={onChange} />

      <div className="kv">
        <span>
          Transfer card <span className="muted">(earnings, record and sealed skill go with it)</span>
        </span>
        <span className="inline-form">
          <input className="field" placeholder={NETWORK === "testnet" ? "receiver.testnet" : "receiver.near"} value={receiver} onChange={(e) => setReceiver(e.target.value)} />
          <button
            className="mini-btn"
            disabled={!!busy || !receiver.trim()}
            onClick={() =>
              run("transfer", async () => {
                await call("nft_transfer", { receiver_id: receiver.trim(), token_id: card.token_id }, { deposit: "1" });
                toast("ok", `Transferred to ${receiver.trim()}`);
                setReceiver("");
                await onChange();
              })
            }
          >
            {busy === "transfer" ? "Sending…" : "Transfer"}
          </button>
        </span>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- passport
function Passport({ card, info, agent }: { card: Card; info: ContractInfo | null; agent: AgentStatus | null | undefined }) {
  const row = (k: string, v: React.ReactNode) => (
    <div className="kv">
      <span>{k}</span>
      <span className="mono">{v}</span>
    </div>
  );
  return (
    <section className="block">
      <h2 className="panel-title">Passport</h2>
      <div className="kv">
        <span>
          <span className={`dot ${info?.requires_tee ? "dot--ok" : "dot--warn"}`} />
          {info === null
            ? "Checking the contract…"
            : info.requires_tee
              ? "Jobs can only be settled by an agent attested to run in an Intel TDX enclave"
              : "Development mode: the agent is approved by the contract owner, not by TEE attestation"}
        </span>
      </div>
      {row(
        "Owner",
        <a href={`${NEAR_EXPLORER}/address/${card.owner_id}`} target="_blank" rel="noopener noreferrer">
          {short(card.owner_id, 14)}
        </a>,
      )}
      {row("Token", `${CONTRACT_ID} #${card.token_id}`)}
      {row("Minted", new Date(Number(card.minted_at_ms)).toLocaleString())}
      {row("Colour", card.traits.color)}
      {row(
        "Art",
        card.media ? (
          <a href={card.media} target="_blank" rel="noopener noreferrer">
            SVG stored in the NFT metadata
          </a>
        ) : (
          "none"
        ),
      )}
      {row("Skill commitment", card.prompt_hash ? short(card.prompt_hash, 10) : "none")}
      {row("Model", agent?.llm.mode === "live" ? agent.llm.model : "—")}
      {row("Lifetime earnings", `${near(card.earned)} NEAR over ${card.jobs_done} jobs`)}
      {BigInt(card.task_budget) > 0n &&
        row(
          "Hires people",
          <a href="#/tasks">
            up to {near(card.task_budget)} NEAR per task, {near(card.balance)} NEAR in its treasury
          </a>,
        )}
    </section>
  );
}

function Receipts({ jobs }: { jobs: Job[] }) {
  if (!jobs.length) return null;
  return (
    <section className="block">
      <h2 className="panel-title">Job receipts (onchain)</h2>
      <ul className="receipts">
        {jobs.map((j) => (
          <li key={j.job_id}>
            <span className="mono">#{j.job_id}</span>
            <span className={j.status === "Done" ? "up" : "muted"}>{j.status}</span>
            <span>{near(j.paid)} NEAR</span>
            <span className="muted">{j.rating ? "★".repeat(j.rating) : ""}</span>
            <span className="mono muted" title="sha256 of the answer">
              {j.result_hash ? short(j.result_hash, 6) : ""}
            </span>
            <span className="muted">{ago(j.created_ms)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------- page
export function CardPage({ tokenId }: { tokenId: string }) {
  const session = useSession();
  const [card, setCard] = useState<Card | null | undefined>(undefined);
  const [info, setInfo] = useState<ContractInfo | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [agent, setAgent] = useState<AgentStatus | null | undefined>(undefined);
  const [tick, setTick] = useState(0);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    agentStatus().then(setAgent);
    setTick((t) => t + 1);
    try {
      setCard(await getCard(tokenId));
    } catch (e) {
      toast("err", (e as Error).message);
    }
  }, [tokenId]);

  useEffect(() => {
    setCard(undefined);
    refresh();
    getContractInfo().then(setInfo).catch(() => {});
    getStats().then(setStats).catch(() => {});
    const t = setInterval(refresh, 12_000);
    return () => clearInterval(t);
  }, [refresh]);

  const account = session?.accountId ?? null;
  const url = cardUrl(tokenId);

  return (
    <main className="app">
      <div className="container">
        <header className="app__head app__head--card">
          <a className="back" href="#/app">
            ← All cards
          </a>
          <SessionBar tick={tick} />
        </header>

        {card === undefined ? (
          <p className="muted deck-empty">Reading card #{tokenId} from {NETWORK}…</p>
        ) : card === null ? (
          <p className="muted deck-empty">There is no card #{tokenId} on this contract.</p>
        ) : (
          <div className="cardpage">
            <aside className="cardpage__side">
              <AgentCard face={faceOf(card)} qr={url} big />
              <button
                className="mini-btn cardpage__copy"
                onClick={() => {
                  navigator.clipboard.writeText(url);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? "Link copied" : "Copy card link"}
              </button>
              <p className="muted cardpage__hint">Scan the code to open this card on a phone and hire it.</p>
            </aside>
            <div className="cardpage__main">
              {account !== card.owner_id && <BuyPanel card={card} account={account} onChange={refresh} />}
              <HirePanel card={card} account={account} onChange={refresh} stats={stats} />
              {account === card.owner_id && <OwnerPanel card={card} account={account} onChange={refresh} agent={agent} />}
              <Passport card={card} info={info} agent={agent} />
              <Receipts jobs={card.recent_jobs} />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
