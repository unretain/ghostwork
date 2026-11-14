// Record a walkthrough of the real site: a browser clicks through it while every
// frame is saved, with a visible cursor and captions drawn into the page.
//
//   SITE=http://localhost:5175 GUEST=<file with {accountId,key}> node video/record-site.cjs <out-dir>
//
// Writes <out-dir>/frames/*.jpg and <out-dir>/meta.json (when each frame was shown,
// when clicks and captions happened, and which waits to fast-forward). Turn that into
// a video with video/assemble-site.cjs. Needs Playwright (set PLAYWRIGHT to its folder).
const fs = require("fs");
const path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT || "playwright");

const SITE = (process.env.SITE || "http://localhost:5173").replace(/\/$/, "");
const out = process.argv[2];
if (!out) throw new Error("Give an output folder");
fs.rmSync(path.join(out, "frames"), { recursive: true, force: true });
fs.mkdirSync(path.join(out, "frames"), { recursive: true });
const guest = process.env.GUEST ? JSON.parse(fs.readFileSync(process.env.GUEST, "utf8")) : null;

// Runs inside the page before anything else: a cursor that follows the mouse, a ring on
// each click, and a caption bar. None of it belongs to the site.
function overlay() {
  const ready = () => {
    if (document.getElementById("film-cursor")) return;
    const style = document.createElement("style");
    style.textContent = `
      #film-cursor { position: fixed; left: 0; top: 0; z-index: 2147483647; width: 30px; height: 30px; pointer-events: none; transform: translate(-200px, -200px); filter: drop-shadow(0 3px 6px rgba(0,0,0,.45)); }
      .film-ring { position: fixed; z-index: 2147483646; width: 16px; height: 16px; margin: -8px 0 0 -8px; border-radius: 50%; border: 3px solid #fff; pointer-events: none; animation: film-ring .5s ease-out forwards; }
      @keyframes film-ring { from { transform: scale(.6); opacity: .95; } to { transform: scale(3.6); opacity: 0; } }
      #film-cap { position: fixed; left: 50%; bottom: 44px; z-index: 2147483645; max-width: 1100px; padding: 15px 26px; border-radius: 24px; pointer-events: none;
        font: 600 23px/1.3 -apple-system, "SF Pro Text", "Inter", system-ui, sans-serif; letter-spacing: -0.015em; color: #111113; text-align: center; white-space: nowrap;
        background: rgba(250, 250, 252, 0.9); -webkit-backdrop-filter: blur(28px) saturate(180%); backdrop-filter: blur(28px) saturate(180%);
        box-shadow: 0 0 0 1px rgba(0,0,0,.06), 0 18px 50px rgba(0,0,0,.55);
        opacity: 0; transform: translate(-50%, 18px) scale(.94); transition: opacity .28s ease, transform .42s cubic-bezier(.2, 1.3, .3, 1); }
      #film-cap.on { opacity: 1; transform: translate(-50%, 0) scale(1); }`;
    document.documentElement.appendChild(style);
    const cur = document.createElement("div");
    cur.id = "film-cursor";
    cur.innerHTML = '<svg viewBox="0 0 24 24" width="30" height="30"><path d="M5 2.5v17l4.6-4.3 2.9 6.6 2.7-1.2-2.9-6.5H19z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    const cap = document.createElement("div");
    cap.id = "film-cap";
    document.documentElement.append(cur, cap);
    addEventListener("mousemove", (e) => (cur.style.transform = `translate(${e.clientX - 5}px, ${e.clientY - 3}px)`), true);
    addEventListener("mousedown", (e) => {
      const r = document.createElement("div");
      r.className = "film-ring";
      r.style.left = `${e.clientX}px`;
      r.style.top = `${e.clientY}px`;
      document.documentElement.appendChild(r);
      setTimeout(() => r.remove(), 600);
    }, true);
    window.__cap = (text) => {
      cap.classList.remove("on");
      if (!text) return;
      setTimeout(() => ((cap.textContent = text), cap.classList.add("on")), 240);
    };
  };
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", ready);
  else ready();
}

(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.2 });
  await context.addInitScript(overlay);
  if (guest) {
    await context.addInitScript(([g]) => {
      localStorage.setItem("gw:guest", g);
      localStorage.setItem("gw:guest:active", "1");
    }, [JSON.stringify(guest)]);
  }
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  const meta = { frames: [], events: [], fast: [] };
  let t0 = 0, n = 0;
  const now = () => (Date.now() - t0) / 1000;
  const mark = (kind) => meta.events.push({ t: now(), kind });

  await page.goto(SITE + "/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  // every time the picture changes, the browser hands over a frame
  const cdp = await context.newCDPSession(page);
  cdp.on("Page.screencastFrame", ({ data, sessionId }) => {
    const file = `f_${String(n++).padStart(6, "0")}.jpg`;
    fs.writeFileSync(path.join(out, "frames", file), Buffer.from(data, "base64"));
    meta.frames.push({ t: now(), file });
    cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  t0 = Date.now();
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, everyNthFrame: 1 });

  // ---- how the "person" behaves ----
  let mx = 800, my = 450;
  const pause = (ms) => page.waitForTimeout(ms);
  async function glide(x, y, ms = 650) {
    const steps = Math.max(12, Math.round(ms / 14)), sx = mx, sy = my;
    for (let i = 1; i <= steps; i++) {
      const k = i / steps, e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      await page.mouse.move(sx + (x - sx) * e, sy + (y - sy) * e);
      await pause(14);
    }
    mx = x;
    my = y;
  }
  async function click(locator, sound = "click") {
    await locator.scrollIntoViewIfNeeded();
    await pause(250);
    const b = await locator.boundingBox();
    await glide(b.x + b.width / 2, b.y + Math.min(b.height / 2, 60));
    await pause(160);
    mark(sound);
    await page.mouse.down();
    await pause(70);
    await page.mouse.up();
    await pause(350);
  }
  async function type(text, delay = 26) {
    for (const ch of text) {
      await page.keyboard.type(ch);
      if (ch !== " ") mark("key");
      await pause(delay + Math.random() * 22);
    }
  }
  async function cap(text, hold = 2600) {
    mark("pop");
    await page.evaluate((t) => window.__cap(t), text);
    await pause(hold);
  }
  // scroll in small steps ourselves: the browser's own smooth scrolling is unreliable when nobody is watching
  const scroll = async (y, ms = 900) => {
    const from = await page.evaluate(() => window.scrollY), steps = Math.max(10, Math.round(ms / 16));
    for (let i = 1; i <= steps; i++) {
      const k = i / steps, e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), from + (y - from) * e);
      await pause(16);
    }
    await pause(250);
  };
  // waiting for the agent is fast-forwarded in the finished video
  async function wait(locator, timeout = 180000) {
    const s = now();
    await locator.waitFor({ timeout });
    meta.fast.push({ s: s + 1.2, e: now() - 0.3, to: 2.2 });
    mark("chime");
  }

  // ---- the walkthrough ----
  await glide(820, 520, 500);
  await cap("This is Ghostwork, live on NEAR.", 2800);
  await scroll(await page.evaluate(() => document.getElementById("roster").getBoundingClientRect().top + window.scrollY - 40), 1800);
  await pause(1400);
  await cap("Every card you see is read straight from the contract.", 3000);
  await scroll(0, 1500);
  await click(page.getByRole("link", { name: "Browse the cards" }).first(), "whoosh");
  await page.waitForSelector("a.gcard");
  await cap("Each card is an AI agent you can hire.", 2400);

  await click(page.getByPlaceholder("Search name, skill, owner or #number"));
  await type("solana", 70);
  await cap("Search by name, skill or owner.", 2000);
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Delete");
  await pause(500);

  await click(page.locator('a.gcard[href="#/card/0"]'), "whoosh");
  await page.waitForSelector(".hire");
  await cap("Yellowstone answers from its owner's private Solana data feed.", 3000);
  await scroll(520, 1100);
  await cap("Owner, price and record all come from the chain.", 2600);
  await scroll(0, 900);

  await click(page.getByPlaceholder("Type or paste what you want it to work on…"));
  await type("What are the busiest programs on Solana right now?");
  await cap("Ask it something, and pay 0.1 NEAR.", 1500);
  await click(page.getByRole("button", { name: /Pay .* NEAR and run/ }));
  await cap("The contract holds the payment while the agent measures the live chain.", 1200);
  await wait(page.locator(".answer__text").first());
  await page.locator(".answer__text").first().scrollIntoViewIfNeeded();
  await cap("The answer arrives, and the contract pays the card.", 4200);
  await click(page.locator(".stars button").nth(4));
  await cap("Rate it. The rating is written to the card's record.", 2800);

  // make an agent
  await scroll(0, 700);
  await click(page.locator("a.back").first(), "whoosh");
  await page.waitForSelector("a.gcard");
  await click(page.getByRole("button", { name: "Mint a card" }));
  await cap("Anyone can make an agent.", 1800);
  await click(page.getByRole("button", { name: "Answers from your documents" }));
  await click(page.getByPlaceholder("Paste your own material: a price list, policies, product docs, research notes."));
  await type("Returns are accepted within 30 days. Shipping takes 3 to 5 days. Support: weekdays 9 to 5.", 14);
  await cap("Write how it works and paste what it knows.", 2000);
  await click(page.getByRole("button", { name: "+ Custom tool" }));
  await click(page.getByRole("button", { name: "+ Database" }));
  await click(page.getByRole("button", { name: "+ Take photos" }));
  await cap("Or give it tools: any API, a database, photos, an MCP server.", 3200);
  for (let i = 0; i < 3; i++) await click(page.getByRole("button", { name: "Remove" }).first());
  await click(page.getByRole("button", { name: "Mint card", exact: true }));
  await cap("Minting…", 600);
  await page.waitForFunction(() => /#\/card\/3/.test(location.hash), null, { timeout: 90000 });
  await page.waitForSelector(".owner");
  mark("chime");
  await cap("Minted. It's an NFT you own, ready to be hired or sold.", 3600);

  // an agent that hires a person
  await click(page.locator("a.back").first(), "whoosh");
  await page.waitForSelector("a.gcard");
  await click(page.locator('a.gcard[href="#/card/1"]'), "whoosh");
  await page.waitForSelector(".hire");
  await cap("Radius can't go anywhere. So it hires a person who can.", 2600);
  await click(page.getByPlaceholder("Type or paste what you want it to work on…"));
  await type("Get someone to photograph the Cloud Gate sculpture in Chicago and check it's open.", 20);
  await click(page.getByRole("button", { name: /Pay .* NEAR and run/ }));
  await cap("It looks the place up and writes a task for a person.", 1200);
  await wait(page.locator(".answer__text").first());
  await page.locator(".answer__text").first().scrollIntoViewIfNeeded();
  await cap("Task posted. The reward is locked from the card's own balance.", 4200);
  await scroll(0, 700);
  await click(page.locator("a.back").first(), "whoosh");
  await page.waitForSelector("a.gcard");
  await click(page.getByRole("link", { name: /Radius: tasks for people/ }), "whoosh");
  await page.waitForSelector(".task");
  await cap("The task is on the board for anyone nearby.", 2800);
  await click(page.getByRole("button", { name: "Take this task" }));
  await pause(1500);
  await cap("Take it, send a photo from the spot, and the contract pays you.", 3800);
  await cap("Live on NEAR mainnet · unretain.github.io/ghostwork", 3600);
  await page.evaluate(() => window.__cap(""));
  await pause(700);

  await cdp.send("Page.stopScreencast");
  meta.end = now();
  fs.writeFileSync(path.join(out, "meta.json"), JSON.stringify(meta));
  console.log(JSON.stringify({ seconds: meta.end.toFixed(1), frames: meta.frames.length, events: meta.events.length, fast: meta.fast, errors }));
  await browser.close();
})().catch((e) => {
  console.error("FAILED:", e.message.split("\n").slice(0, 4).join(" | "));
  process.exit(1);
});
