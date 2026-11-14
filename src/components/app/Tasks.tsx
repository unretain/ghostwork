// Radius: tasks that need a person. An agent (or anyone) posts a task at a place with
// a reward held by the contract. Someone nearby takes it, sends a photo as proof, and
// is paid the moment the proof is accepted.
import { useCallback, useEffect, useState } from "react";
import { getTaskProof, sendProof, type TaskProof } from "../../chain/agent";
import { CONTRACT_ID, NEAR_EXPLORER, NETWORK } from "../../chain/config";
import { getTasks, near, toYocto, type Task } from "../../chain/near";
import { call, useSession } from "../../chain/wallet";
import { ago, ConnectButtons, SessionBar, short, toast, useBusy } from "./shared";

type Spot = { lat: number; lon: number };

/** Ask the browser where we are. Rejects with a plain message if it won't say. */
function locate(): Promise<Spot> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("This browser can't share a location"));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => reject(new Error("Location is needed for this. Allow it in the browser and try again.")),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  });
}

function metresBetween(a: Spot, b: Spot) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}
const distance = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`);
const spotOf = (t: Task): Spot => ({ lat: t.lat_e6 / 1e6, lon: t.lon_e6 / 1e6 });
const mapUrl = (s: Spot) => `https://www.openstreetmap.org/?mlat=${s.lat}&mlon=${s.lon}#map=17/${s.lat}/${s.lon}`;

const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");

/** Shrink a photo to at most 1280 px on its long side and return it as JPEG bytes. */
async function shrink(file: File): Promise<Blob> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not read that photo"))), "image/jpeg", 0.82));
}

const dataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("Could not read that photo"));
    r.readAsDataURL(blob);
  });

type Proof = { task_id: string; lat: string; lon: string; taken_ms: string; photo: string };

/** The commitment the worker signs: the same formula the agent checks (agent/src/radius.ts). */
async function proofHash(p: Proof, photo: Blob) {
  const photoHash = hex(await crypto.subtle.digest("SHA-256", await photo.arrayBuffer()));
  const text = [p.task_id, p.lat, p.lon, p.taken_ms, photoHash].join("\n");
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

const STATUS: Record<Task["status"], string> = {
  Open: "Open",
  Claimed: "Someone is on it",
  Submitted: "Proof being checked",
  Paid: "Done and paid",
  Cancelled: "Withdrawn",
};

export function Tasks() {
  const session = useSession();
  const me = session?.accountId;
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [here, setHere] = useState<Spot | null>(null);
  const [posting, setPosting] = useState(false);
  const [tick, setTick] = useState(0);
  const { busy, run } = useBusy();

  const refresh = useCallback(async () => {
    try {
      setTasks(await getTasks());
    } catch {
      setTasks((t) => t ?? []);
    }
    setTick((n) => n + 1);
  }, []);
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15_000);
    return () => clearInterval(id);
  }, [refresh]);

  const sorted = [...(tasks ?? [])].sort((a, b) => {
    // tasks that can still be taken first, nearest first when we know where we are
    const open = (t: Task) => (t.status === "Open" ? 0 : t.status === "Claimed" || t.status === "Submitted" ? 1 : 2);
    if (open(a) !== open(b)) return open(a) - open(b);
    if (here && open(a) === 0) return metresBetween(here, spotOf(a)) - metresBetween(here, spotOf(b));
    return Number(b.task_id) - Number(a.task_id);
  });

  return (
    <main className="app">
      <div className="container">
        <header className="app__head">
          <div>
            <a className="back" href="#/app">
              ← All cards
            </a>
            <p className="eyebrow-prominent" style={{ marginTop: 14 }}>
              NEAR {NETWORK} ·{" "}
              <a href={`${NEAR_EXPLORER}/address/${CONTRACT_ID}`} target="_blank" rel="noopener noreferrer">
                {CONTRACT_ID}
              </a>
            </p>
            <h1 className="display-heading" style={{ marginTop: 12 }}>
              Radius
            </h1>
          </div>
          <SessionBar tick={tick} />
        </header>

        <section className="block tasks__intro">
          <p>
            Agents can't go places. People can. Here an agent, or anyone, posts a task at a location and locks the reward in the contract. Take a task near
            you, do it, and send a photo from the spot. If the photo checks out you are paid in NEAR straight away.
          </p>
          <div className="tasks__actions">
            <button
              className="kyd-button kyd-button--compact kyd-button--frame"
              disabled={!!busy}
              onClick={() => run("locate", async () => setHere(await locate()))}
            >
              {here ? "Location on: nearest first" : busy === "locate" ? "Finding you…" : "Show tasks near me"}
            </button>
            {session && (
              <button className="kyd-button kyd-button--compact kyd-button--frame" onClick={() => setPosting((v) => !v)}>
                {posting ? "Close" : "Post a task"}
              </button>
            )}
          </div>
        </section>

        {session && posting && (
          <PostForm
            here={here}
            onPosted={() => {
              setPosting(false);
              refresh();
            }}
          />
        )}

        {tasks === null ? (
          <p className="deck-empty">Loading tasks…</p>
        ) : sorted.length === 0 ? (
          <p className="deck-empty">No tasks yet. Post one, or hire the Radius card and ask it to get something done somewhere.</p>
        ) : (
          <div className="tasks">
            {sorted.map((t) => (
              <TaskRow key={t.task_id} task={t} me={me} here={here} onChange={refresh} />
            ))}
          </div>
        )}
        {!session && (
          <section className="welcome" style={{ marginTop: 24 }}>
            <h2 className="panel-title">Want to take a task?</h2>
            <p className="muted">You need a NEAR account to be paid.</p>
            <ConnectButtons />
          </section>
        )}
      </div>
    </main>
  );
}

function PostForm({ here, onPosted }: { here: Spot | null; onPosted: () => void }) {
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [lat, setLat] = useState(here ? here.lat.toFixed(6) : "");
  const [lon, setLon] = useState(here ? here.lon.toFixed(6) : "");
  const [radius, setRadius] = useState("150");
  const [reward, setReward] = useState("0.1");
  const { busy, run } = useBusy();

  const submit = () =>
    run("post", async () => {
      const yocto = toYocto(reward);
      const la = Number(lat);
      const lo = Number(lon);
      if (!title.trim() || !details.trim()) throw new Error("Give the task a title and say what the photo must show");
      if (!lat || !lon || !Number.isFinite(la) || !Number.isFinite(lo)) throw new Error("Enter the place as latitude and longitude, or use your location");
      if (!yocto) throw new Error("Enter a reward in NEAR");
      await call(
        "post_task",
        { title: title.trim(), details: details.trim(), lat_e6: Math.round(la * 1e6), lon_e6: Math.round(lo * 1e6), radius_m: Math.round(Number(radius) || 150) },
        { deposit: yocto },
      );
      toast("ok", "Task posted. The reward is held by the contract.");
      onPosted();
    });

  return (
    <section className="block tasks__form">
      <h2 className="panel-title">Post a task</h2>
      <label className="lbl">
        Title
        <input className="field" maxLength={80} placeholder="Photo of the opening hours sign" value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="lbl">
        What to do, and what the photo must show
        <textarea
          className="field field--area"
          rows={3}
          maxLength={500}
          placeholder="Stand at the front door and photograph the sign with the opening hours so every line can be read."
          value={details}
          onChange={(e) => setDetails(e.target.value)}
        />
      </label>
      <div className="tasks__grid">
        <label className="lbl">
          Latitude
          <input className="field" inputMode="decimal" placeholder="41.878100" value={lat} onChange={(e) => setLat(e.target.value)} />
        </label>
        <label className="lbl">
          Longitude
          <input className="field" inputMode="decimal" placeholder="-87.629800" value={lon} onChange={(e) => setLon(e.target.value)} />
        </label>
        <label className="lbl">
          Within (metres)
          <input className="field" inputMode="numeric" value={radius} onChange={(e) => setRadius(e.target.value)} />
        </label>
        <label className="lbl">
          Reward (NEAR)
          <input className="field" inputMode="decimal" value={reward} onChange={(e) => setReward(e.target.value)} />
        </label>
      </div>
      <div className="tasks__actions">
        <button
          className="mini-btn"
          disabled={!!busy}
          onClick={() =>
            run("locate", async () => {
              const s = await locate();
              setLat(s.lat.toFixed(6));
              setLon(s.lon.toFixed(6));
            })
          }
        >
          Use where I am now
        </button>
        <button className="kyd-button kyd-button--hero kyd-button--cool" disabled={!!busy} onClick={submit}>
          {busy === "post" ? "Posting…" : `Lock ${reward || "0"} NEAR and post`}
        </button>
      </div>
      <p className="muted">The worker receives 95% of the reward; 5% stays in the contract to pay for storing the record. You can withdraw a task nobody has taken.</p>
    </section>
  );
}

function TaskRow({ task: t, me, here, onChange }: { task: Task; me: string | undefined; here: Spot | null; onChange: () => void }) {
  const { busy, run } = useBusy();
  const [proof, setProof] = useState<TaskProof | null>(null);
  const [verdict, setVerdict] = useState<string | null>(null);
  // a proof that was signed onchain but has not reached the agent yet
  const [unsent, setUnsent] = useState<Proof | null>(null);
  const spot = spotOf(t);
  const mine = !!me && t.worker === me;
  const posted = !!me && t.poster === me;

  useEffect(() => {
    if (t.status !== "Paid") return;
    let live = true;
    getTaskProof(t.task_id).then((p) => live && setProof(p));
    return () => {
      live = false;
    };
  }, [t.status, t.task_id]);

  const deliver = async (p: Proof) => {
    const res = await sendProof(p);
    setUnsent(null);
    setVerdict(res.verdict);
    toast(res.approved ? "ok" : "err", res.approved ? `Proof accepted. ${near(t.reward)} NEAR reward paid.` : "Proof turned down. You can try again.");
    onChange();
  };

  const onPhoto = (file: File | undefined) => {
    if (!file) return;
    run("proof", async () => {
      const [photo, at] = await Promise.all([shrink(file), locate()]);
      const p: Proof = { task_id: t.task_id, lat: at.lat.toFixed(6), lon: at.lon.toFixed(6), taken_ms: String(Date.now()), photo: await dataUrl(photo) };
      // sign the commitment first, then hand the proof itself to the agent
      await call("submit_proof", { task_id: t.task_id, proof_hash: await proofHash(p, photo) });
      setUnsent(p);
      await deliver(p);
    });
  };

  return (
    <article className="answer task" data-status={t.status}>
      <header>
        <b className="task__title">{t.title}</b>
        <span className="task__reward">{near(t.reward)} NEAR</span>
      </header>
      <p className="answer__text">{t.details}</p>
      <div className="task__meta">
        <span className={`task__status task__status--${t.status.toLowerCase()}`}>{STATUS[t.status]}</span>
        <a href={mapUrl(spot)} target="_blank" rel="noopener noreferrer">
          {spot.lat.toFixed(5)}, {spot.lon.toFixed(5)}
        </a>
        <span>within {distance(t.radius_m)}</span>
        {here && <span>{distance(metresBetween(here, spot))} from you</span>}
        <span>
          posted {ago(t.created_ms)} by{" "}
          {t.card !== null ? <a href={`#/card/${t.card}`}>agent card #{t.card}</a> : <span className="mono">{short(t.poster, 8)}</span>}
        </span>
        {t.worker && <span className="mono">worker {short(t.worker, 8)}</span>}
      </div>

      {(verdict || proof) && <p className="task__verdict">{verdict ?? proof?.verdict}</p>}
      {t.status === "Paid" && proof?.photo && <img className="task__photo" src={proof.photo} alt={`Proof photo for: ${t.title}`} />}
      {t.status === "Paid" && t.proof_hash && (
        <p className="muted mono task__hash">
          proof {short(t.proof_hash, 10)}
          {t.verdict_hash ? ` · check ${short(t.verdict_hash, 10)}` : " · accepted by the poster"}
        </p>
      )}

      <footer>
        {t.status === "Open" && me && !posted && (
          <button className="mini-btn" disabled={!!busy} onClick={() => run("claim", async () => (await call("claim_task", { task_id: t.task_id }), onChange()))}>
            {busy === "claim" ? "Taking…" : "Take this task"}
          </button>
        )}
        {t.status === "Claimed" && mine && (
          <label className={`mini-btn task__upload${busy ? " task__upload--busy" : ""}`}>
            {busy === "proof" ? "Checking your proof…" : t.rejections ? "Take another photo" : "Take the proof photo"}
            <input type="file" accept="image/*" capture="environment" disabled={!!busy} onChange={(e) => (onPhoto(e.target.files?.[0]), (e.target.value = ""))} />
          </label>
        )}
        {t.status === "Claimed" && mine && <span className="muted">Take it at the spot: your location is read when you add the photo.</span>}
        {t.status === "Submitted" && mine && unsent && (
          <button className="mini-btn" disabled={!!busy} onClick={() => run("proof", () => deliver(unsent))}>
            {busy === "proof" ? "Checking your proof…" : "Send the proof again"}
          </button>
        )}
        {t.status === "Submitted" && posted && (
          <button className="mini-btn" disabled={!!busy} onClick={() => run("approve", async () => (await call("approve_task", { task_id: t.task_id }), onChange()))}>
            Accept the proof myself
          </button>
        )}
        {t.status === "Open" && posted && (
          <button className="mini-btn" disabled={!!busy} onClick={() => run("cancel", async () => (await call("cancel_task", { task_id: t.task_id }), onChange()))}>
            Withdraw and take the reward back
          </button>
        )}
        {t.status === "Open" && !me && <span className="muted">Connect to take it.</span>}
      </footer>
    </article>
  );
}
