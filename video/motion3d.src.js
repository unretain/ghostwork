// The demo film's motion graphics in 3D: brushed-metal coins and card slabs on white,
// one short line of text per shot. Everything is a function of one clock, so any
// moment can be drawn exactly (see render.cjs).
//
// Build:  npx esbuild video/motion3d.src.js --bundle --format=iife --outfile=video/motion3d.bundle.js
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const W = 1920, H = 1080;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, k) => a + (b - a) * k;
const easeOut = (k) => 1 - Math.pow(1 - clamp(k), 3);
const easeIn = (k) => Math.pow(clamp(k), 3);
const easeInOut = (k) => ((k = clamp(k)) < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const span = (lt, s, e) => clamp((lt - s) / (e - s));

const SPRITE = ["....XXXXXX....", "..XXXXXXXXXX..", ".XXXXXXXXXXXX.", ".XXXXXXXXXXXX.", "XXXEEXXXXEEXXX", "XXXEEXXXXEEXXX", "XXXEEXXXXEEXXX", "XXXXXXXXXXXXXX", "XXXXXXXXXXXXXX", "XXXXXXXXXXXXXX", "XXXXXXXXXXXXXX", "XXXXXXXXXXXXXX", "XX.XXX..XXX.XX", "X...XX..XX...X"];
const PALETTE = { Moss: ["#5fae7a", "#1f5233"], Iris: ["#9a76de", "#3d2578"], Tide: ["#4f97d8", "#173f6b"] };

function drawGhost(ctx, cx, cy, cell, body, eye) {
  SPRITE.forEach((row, r) =>
    [...row].forEach((ch, c) => {
      if (ch === ".") return;
      ctx.fillStyle = ch === "E" ? eye : body;
      ctx.fillRect(Math.round(cx - 7 * cell + c * cell), Math.round(cy - 7 * cell + r * cell), Math.ceil(cell) + 1, Math.ceil(cell) + 1);
    }),
  );
}

async function main() {
  await Promise.all([document.fonts.load('500 40px "Inter"'), document.fonts.load('600 40px "Inter"'), document.fonts.load('700 40px "Inter"'), document.fonts.load('700 40px "Cossette Titre"'), document.fonts.ready]);

  const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById("gl"), antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.setClearColor(0xffffff, 1);
  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  const camera = new THREE.PerspectiveCamera(20, W / H, 0.1, 100);
  const key = new THREE.DirectionalLight(0xffffff, 0.7);
  key.position.set(-4, 8, 10);
  scene.add(key, new THREE.AmbientLight(0xffffff, 0.2));

  const tex = (canvas) => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  };
  const actors = [];
  const add = (o) => (scene.add(o), actors.push(o), o);

  // ---- coins: a brushed-metal disc with something on its face ----
  const TONES = {
    light: { stops: ["#e9e9eb", "#8b8b8e", "#e2e2e4", "#7a7a7d", "#efeff1", "#929295", "#dededf", "#7f7f82", "#e9e9eb"], ink: "#111113", rim: 0x2a2a2c },
    dark: { stops: ["#5d5d60", "#1c1c1e", "#4a4a4d", "#161618", "#66666a", "#232325", "#505053", "#1a1a1c", "#5d5d60"], ink: "#f5f5f7", rim: 0x0c0c0d },
    white: { stops: ["#f1f1f3", "#d6d6db", "#f1f1f3", "#cfcfd5", "#f1f1f3", "#d6d6db", "#f1f1f3", "#cfcfd5", "#f1f1f3"], ink: "#111113", rim: 0x8e8e93 },
  };
  function coin(tone, draw, radius = 1) {
    const S = 512, c = document.createElement("canvas");
    c.width = c.height = S;
    const ctx = c.getContext("2d"), T = TONES[tone];
    const g = ctx.createConicGradient(-0.6, S / 2, S / 2);
    T.stops.forEach((col, i) => g.addColorStop(i / (T.stops.length - 1), col));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    // a darker ring just inside the edge, like a minted coin
    ctx.strokeStyle = tone === "dark" ? "rgba(0,0,0,.55)" : "rgba(0,0,0,.28)";
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S / 2 - 22, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = T.ink;
    ctx.strokeStyle = T.ink;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    draw(ctx, S, T.ink, tone);
    const face = new THREE.MeshStandardMaterial({ map: tex(c), metalness: tone === "white" ? 0.1 : 0.6, roughness: tone === "dark" ? 0.4 : 0.78, envMapIntensity: tone === "dark" ? 0.8 : 0.6 });
    const side = new THREE.MeshStandardMaterial({ color: T.rim, metalness: 0.9, roughness: 0.3 });
    const geo = new THREE.CylinderGeometry(radius, radius, radius * 0.14, 96);
    geo.rotateX(Math.PI / 2);
    geo.rotateZ(Math.PI / 2); // turn the face upright
    const mesh = new THREE.Mesh(geo, [side, face, face]);
    mesh.userData.r = radius;
    return add(mesh);
  }
  const label = (small, big) => (ctx, S) => {
    ctx.font = '500 34px "Inter"';
    ctx.globalAlpha = 0.75;
    ctx.fillText(small, S / 2, S / 2 - 50);
    ctx.globalAlpha = 1;
    let size = 78;
    do ctx.font = `600 ${size}px "Inter"`; while (ctx.measureText(big).width > S - 110 && (size -= 4) > 30);
    ctx.fillText(big, S / 2, S / 2 + 14);
  };
  const ghostFace = (ctx, S, ink, tone) => drawGhost(ctx, S / 2, S / 2 + 6, 19, ink, tone === "dark" ? "#1c1c1e" : "#e9e9eb");
  const personFace = (ctx, S) => {
    ctx.beginPath();
    ctx.arc(S / 2, S / 2 - 52, 58, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(S / 2, S / 2 + 150, 122, Math.PI, 0);
    ctx.fill();
  };
  const pinFace = (ctx, S) => {
    ctx.beginPath();
    ctx.moveTo(S / 2, S / 2 + 150);
    ctx.bezierCurveTo(S / 2 - 150, S / 2, S / 2 - 110, S / 2 - 150, S / 2, S / 2 - 150);
    ctx.bezierCurveTo(S / 2 + 110, S / 2 - 150, S / 2 + 150, S / 2, S / 2, S / 2 + 150);
    ctx.fill();
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(S / 2, S / 2 - 44, 40, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  };
  const lockFace = (ctx, S) => {
    ctx.lineWidth = 26;
    ctx.beginPath();
    ctx.arc(S / 2, S / 2 - 40, 62, Math.PI, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(S / 2 - 104, S / 2 - 40, 208, 156, 26);
    ctx.fill();
  };
  const wavesFace = (ctx, S) => {
    ctx.lineWidth = 22;
    ctx.lineCap = "round";
    [70, 130, 190].forEach((r) => {
      ctx.beginPath();
      ctx.arc(S / 2 - 110, S / 2, r, -0.75, 0.75);
      ctx.stroke();
    });
  };

  // ---- cards: a thin slab with the card's face on the front ----
  function roundedRect(w, h, r) {
    const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y);
    s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r);
    s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h);
    s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r);
    s.quadraticCurveTo(x, y, x + r, y);
    return s;
  }
  function facePlane(w, h, r, canvas, z) {
    const geo = new THREE.ShapeGeometry(roundedRect(w, h, r), 12);
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + w / 2) / w, (pos.getY(i) + h / 2) / h);
    const m = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ map: tex(canvas), roughness: 0.45, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.25 }));
    m.position.z = z;
    return m;
  }
  function card({ name, skill, color, id, price }) {
    const cw = 720, ch = 960, c = document.createElement("canvas");
    c.width = cw;
    c.height = ch;
    const ctx = c.getContext("2d"), [light, dark] = PALETTE[color];
    ctx.fillStyle = "#0f0c0a";
    ctx.fillRect(0, 0, cw, ch);
    const g = ctx.createRadialGradient(cw / 2, 226, 0, cw / 2, 226, 560);
    g.addColorStop(0, light);
    g.addColorStop(1, dark);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cw, 540);
    ctx.fillStyle = "rgba(0,0,0,.22)";
    ctx.fillRect(225, 455, 270, 22);
    drawGhost(ctx, cw / 2, 252, 27, "#f6f1ea", "#1b1612");
    ctx.fillStyle = "rgba(0,0,0,.55)";
    ctx.beginPath();
    ctx.roundRect(cw - 150, 478, 122, 40, 9);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = '500 24px "Inter"';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(id, cw - 89, 499);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#ebe5dd";
    ctx.font = '700 84px "Cossette Titre"';
    ctx.fillText(name.toUpperCase(), 40, 652);
    ctx.font = '600 33px "Inter"';
    ctx.fillText(skill, 40, 712);
    ctx.fillStyle = "#6d6760";
    ctx.font = '400 26px "Inter"';
    ctx.fillText("NFT on NEAR  ·  ghostwork.unretain.near", 40, 762);
    ctx.fillStyle = "rgba(255,255,255,.1)";
    ctx.fillRect(40, 812, cw - 80, 2);
    ctx.fillStyle = light;
    ctx.font = '700 40px "Inter"';
    ctx.fillText(`${price} NEAR`, 40, 890);
    ctx.fillStyle = "#6d6760";
    ctx.font = '400 28px "Inter"';
    ctx.fillText("per job", 40 + ctx.measureText(`${price} NEAR `).width * 1.45, 890);

    const w = 2.55, h = 3.4, r = 0.2, d = 0.1;
    const body = new THREE.Mesh(
      new THREE.ExtrudeGeometry(roundedRect(w, h, r), { depth: d, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 4, curveSegments: 12 }),
      new THREE.MeshStandardMaterial({ color: 0x1b1b1d, metalness: 0.9, roughness: 0.28 }),
    );
    body.position.z = -d / 2;
    const group = new THREE.Group();
    group.add(body, facePlane(w - 0.06, h - 0.06, r - 0.03, c, d / 2 + 0.027));
    return add(group);
  }

  function photo() {
    const c = document.createElement("canvas");
    c.width = 480;
    c.height = 420;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fafafa";
    ctx.fillRect(0, 0, 480, 420);
    ctx.fillStyle = "#bdb3a4";
    ctx.fillRect(26, 26, 428, 300);
    ctx.fillStyle = "#8f8577";
    ctx.fillRect(26, 270, 428, 56);
    ctx.fillStyle = "#5d4333";
    ctx.fillRect(66, 76, 140, 250);
    ctx.fillStyle = "#f6f1ea";
    ctx.fillRect(250, 86, 170, 124);
    ctx.fillStyle = "#14100d";
    ctx.fillRect(268, 106, 92, 12);
    ctx.fillStyle = "#5b554e";
    [134, 156, 178].forEach((y) => ctx.fillRect(268, y, 130, 9));
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.4, 0.04), [0, 0, 0, 0, 0, 0].map((_, i) => (i === 4 ? new THREE.MeshStandardMaterial({ map: tex(c), roughness: 0.7 }) : new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.7 }))));
    return add(m);
  }
  function ring() {
    return add(new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.018, 8, 128), new THREE.MeshBasicMaterial({ color: 0x9a76de, transparent: true })));
  }
  function shadow() {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 64;
    const ctx = c.getContext("2d"), g = ctx.createRadialGradient(128, 32, 0, 128, 32, 128);
    g.addColorStop(0, "rgba(0,0,0,.28)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.setTransform(1, 0, 0, 0.25, 0, 24);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    return add(new THREE.Mesh(new THREE.PlaneGeometry(4, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false })));
  }

  // ---- the cast ----
  const hero = coin("light", ghostFace, 1.3);
  const ghosts = ["dark", "light", "light", "dark", "light", "dark", "light", "light"].map((t) => coin(t, ghostFace, 0.78));
  const yellowstone = card({ name: "Yellowstone", skill: "Analyses live Solana chain data", color: "Iris", id: "#0000", price: "0.1" });
  const radius = card({ name: "Radius", skill: "Hires a person nearby", color: "Moss", id: "#0001", price: "0.4" });
  const person = coin("light", personFace, 0.9);
  const lock = coin("dark", lockFace, 1.0);
  const pay = coin("light", label("Pay", "0.1 NEAR"), 0.62);
  const split = [coin("light", label("The card", "85%"), 0.72), coin("dark", label("Compute", "10%"), 0.5), coin("light", label("Storage", "5%"), 0.42)];
  const near = [["NEP-171", "NFT"], ["Contract", "Escrow"], ["In code", "85/10/5"], ["Onchain", "Ratings"], ["Onchain", "Card art"], ["Model", "NEAR AI"], ["Pay in", "Intents"], ["Wallets", "Chain Sigs"]].map(([a, b], i) => coin(i % 3 === 1 ? "dark" : "light", label(a, b), 0.86));
  const can = [["Your", "Documents"], ["A", "Database"], ["Any", "Web API"], ["Your own", "Tools"], ["Any", "MCP server"], ["Customer", "Photos"]].map(([a, b], i) => coin(i % 2 ? "dark" : "light", label(a, b), 0.9));
  const model = coin("dark", label("Model on", "NEAR AI"), 1.05);
  const req = coin("light", label("Job", "Request"), 0.6);
  const ans = coin("light", label("Job", "Answer"), 0.6);
  const okCoin = coin("light", label("Photo", "Accepted"), 0.7);
  const chains = [["Solana", "SOL"], ["Any chain", "USDC"], ["Ethereum", "ETH"], ["Bitcoin", "BTC"]].map(([a, b], i) => coin(i % 2 ? "dark" : "light", label(a, b), 0.7));
  const hub = coin("dark", label("NEAR", "Intents"), 1.05);
  const nearOut = [0, 1].map(() => coin("light", label("To you", "NEAR"), 0.6));
  const price = coin("light", label("Live price", "USD · SOL"), 0.78);
  const ethA = coin("light", label("Its own", "ETH address"), 0.95);
  const btcA = coin("dark", label("Its own", "BTC address"), 0.95);
  const pin = coin("dark", pinFace, 1.0);
  const task = coin("light", label("Reward", "0.2 NEAR"), 0.6);
  const snap = photo();
  const tag = coin("white", wavesFace, 1.15);
  const pulses = [ring(), ring()];
  const shade = shadow();

  // ---- posing ----
  let T = 0, EX = 0; // the clock, and how far the current shot is into its exit (0 to 1)
  function show(o, x, y, s = 1, rx = 0, ry = 0, rz = 0, z = 0) {
    s *= 1 - EX;
    if (s < 0.002) return;
    o.visible = true;
    o.position.set(x * (1 + 0.3 * EX), y * (1 + 0.3 * EX), z - 3 * EX);
    o.rotation.set(rx, ry + EX * 1.4, rz);
    o.scale.setScalar(s);
  }
  // an object arrives edge-on and turns to face the camera, then keeps drifting a little
  function float(o, lt, delay, x, y, s = 1, phase = 0, sway = 0.3) {
    const k = span(lt, delay, delay + 1.1);
    if (k <= 0) return;
    const e = easeOut(k);
    show(o, x, y + 0.07 * Math.sin(T * 1.1 + phase), s * e, 0.16 * Math.sin(T * 0.8 + phase * 1.7), (1 - e) * Math.PI * 1.5 + sway * Math.sin(T * 0.9 + phase), 0.05 * Math.sin(T * 0.6 + phase));
  }
  const ground = (x, y, w, lt, delay) => {
    const k = easeOut(span(lt, delay, delay + 1));
    if (k <= 0 || EX > 0.9) return;
    shade.visible = true;
    shade.position.set(x, y, -0.6);
    shade.scale.set(w * k, k * (1 - EX), 1);
    shade.rotation.set(0, 0, 0);
  };

  const RING8 = [[-5.4, 1.5, 1], [-3.1, 2.7, 0.8], [0.1, 3.2, 0.95], [3.2, 2.6, 1.1], [5.5, 1.3, 0.85], [-4.3, -2.0, 1.15], [0.4, -3.0, 0.9], [4.5, -2.1, 1]];
  const around = (n, i, rx, ry, cy, turn = 0) => {
    const a = ((i / n) * 360 + turn) * (Math.PI / 180);
    return [rx * Math.cos(a), cy + ry * Math.sin(a)];
  };

  const shots = [
    { name: "agents", dur: 4.5, fn(lt) {
        float(hero, lt, 0.2, 0, 0.95, 1, 0, 0.5);
        ground(0, -0.95, 0.9, lt, 0.3);
      } },
    { name: "no market", dur: 5, fn(lt) {
        ghosts.forEach((g, i) => float(g, lt, 0.15 + i * 0.12, RING8[i][0], RING8[i][1], RING8[i][2], i * 1.3, 0.55));
      } },
    { name: "the card", dur: 10, fn(lt) {
        float(yellowstone, lt, 0.2, 0, 0.8, 1, 0, 0.5);
        ground(0, -1.25, 1, lt, 0.4);
      } },
    { name: "a job", dur: 7.5, fn(lt) {
        float(person, lt, 0.2, -5.2, 0.7, 1, 1);
        float(lock, lt, 0.35, 0, 0.7, 1, 2);
        float(yellowstone, lt, 0.5, 5.2, 0.7, 0.66, 3, 0.35);
        // the payment travels to the contract and is held there
        const go = easeInOut(span(lt, 1.3, 2.5));
        if (lt > 1.1 && go < 1) float(pay, lt, 1.1, lerp(-3.9, -1.0, go), 0.7, 1 - easeIn(span(lt, 2.2, 2.5)), 4, 0.2);
        // then it comes out as three shares
        const out = easeInOut(span(lt, 4.0, 5.3));
        if (lt > 3.9) {
          const arrive = 1 - easeIn(span(lt, 5.0, 5.4));
          if (arrive > 0) float(split[0], lt, 3.9, lerp(1.0, 4.0, out), 0.7, arrive, 5, 0.2);
          float(split[1], lt, 4.0, lerp(0, -1.1, out), lerp(0.7, 3.1, out), 1, 6, 0.3);
          float(split[2], lt, 4.1, lerp(0, 1.1, out), lerp(0.7, 3.0, out), 1, 7, 0.3);
        }
      } },
    { name: "near", dur: 7, fn(lt) {
        float(yellowstone, lt, 0.2, 0, 0.55, 0.6, 0, 0.4);
        // the coins the current line is about step forward
        const groups = [[2.4, 4.5, [0, 3, 4]], [4.7, 6.7, [1, 2]]];
        near.forEach((c, i) => {
          const [x, y] = around(8, i, 5.7, 2.9, 0.55, 22.5);
          let lift = 0;
          for (const [s, e, who] of groups) if (who.includes(i)) lift = Math.max(lift, easeInOut(span(lt, s, s + 0.4)) * (1 - easeInOut(span(lt, e - 0.3, e + 0.1))));
          float(c, lt, 0.5 + i * 0.13, x, y, 1 + 0.32 * lift, i * 1.1, 0.3 - 0.12 * lift);
        });
      } },
    { name: "near ai", dur: 9, fn(lt) {
        float(yellowstone, lt, 0.2, -5.2, 0.7, 0.66, 0, 0.35);
        float(model, lt, 0.35, 0, 0.7, 1, 1);
        // the request goes to the model, the answer comes back
        const a = easeInOut(span(lt, 1.1, 2.3)), aGone = 1 - easeIn(span(lt, 2.1, 2.4));
        if (aGone > 0) float(req, lt, 1.0, lerp(-3.9, -1.2, a), 0.7, aGone, 2, 0.2);
        const b = easeInOut(span(lt, 2.8, 4.0)), bGone = 1 - easeIn(span(lt, 3.8, 4.1));
        if (lt > 2.7 && bGone > 0) float(ans, lt, 2.7, lerp(-1.2, -3.9, b), 0.7, bGone, 3, 0.2);
        // a proof photo goes in, a verdict comes out
        const p = easeInOut(span(lt, 4.5, 5.7)), k = easeOut(span(lt, 4.2, 4.9)), pGone = 1 - easeIn(span(lt, 5.5, 5.8));
        if (k > 0 && pGone > 0) show(snap, lerp(5.2, 1.5, p), 0.7, 0.85 * k * pGone, 0.1 * Math.sin(T * 0.9), -0.25 + 0.2 * Math.sin(T * 0.7), -0.08);
        if (lt > 5.8) float(okCoin, lt, 5.8, lerp(1.4, 4.4, easeInOut(span(lt, 5.9, 7.0))), 0.7, 1, 4, 0.25);
        // and a tenth of the job pays for it
        const c = easeInOut(span(lt, 6.8, 7.9)), cGone = 1 - easeIn(span(lt, 7.7, 8.0));
        if (lt > 6.5 && cGone > 0) float(split[1], lt, 6.5, lerp(-3.6, -1.0, c), lerp(2.9, 1.3, c), cGone, 5, 0.2);
      } },
    { name: "intents", dur: 10.5, fn(lt) {
        float(hub, lt, 0.3, 0, 0.7, 1, 0);
        float(person, lt, 0.5, 5.4, 0.7, 0.95, 1);
        // coins from other chains go in
        const home = [[-6.3, 2.3], [-4.5, -1.1], [-6.5, -1.2], [-4.3, 2.5]];
        chains.forEach((c, i) => {
          const st = 2.0 + i * 0.55, m = easeInOut(span(lt, st, st + 1.1)), gone = 1 - easeIn(span(lt, st + 0.9, st + 1.2));
          if (gone > 0) float(c, lt, 0.4 + i * 0.15, lerp(home[i][0], -1.1, m), lerp(home[i][1], 0.7, m), gone, i * 1.3, 0.3);
        });
        // NEAR comes out, to the customer's account
        nearOut.forEach((c, i) => {
          const st = 4.4 + i * 0.7, m = easeInOut(span(lt, st, st + 1.2)), gone = 1 - easeIn(span(lt, st + 1.0, st + 1.3));
          if (lt > st - 0.1 && gone > 0) float(c, lt, st - 0.1, lerp(1.2, 4.3, m), 0.7, gone, i + 5, 0.2);
        });
        if (lt > 7.2) float(price, lt, 7.2, -4.6, 0.7, 1.15, 2);
      } },
    { name: "chain sigs", dur: 5.5, fn(lt) {
        float(yellowstone, lt, 0.2, 0, 0.85, 0.8, 0, 0.45);
        float(ethA, lt, 0.6, -4.3, 0.95, 1, 1);
        float(btcA, lt, 0.8, 4.3, 0.95, 1, 2);
      } },
    { name: "abilities", dur: 6, fn(lt) {
        float(yellowstone, lt, 0.2, 0, 0.55, 0.6, 0, 0.4);
        can.forEach((c, i) => {
          const [x, y] = around(6, i, 5.4, 2.8, 0.55, 30);
          float(c, lt, 0.5 + i * 0.16, x, y, 1, i * 1.4);
        });
      } },
    { name: "radius", dur: 9.5, fn(lt) {
        float(radius, lt, 0.2, -5.4, 0.7, 0.66, 0, 0.35);
        float(pin, lt, 0.4, 0, 1.5, 1, 1);
        const walk = easeInOut(span(lt, 3.3, 4.7));
        float(person, lt, 0.6, lerp(5.4, 2.3, walk), lerp(0.7, 1.5, walk), 0.95, 2);
        // the reward leaves the card, waits under the pin, then goes to the person
        const post = easeInOut(span(lt, 1.1, 2.3)), paid = easeInOut(span(lt, 6.6, 7.7));
        const gone = 1 - easeIn(span(lt, 7.5, 7.9));
        if (gone > 0) float(task, lt, 1.0, lerp(lerp(-4.2, 0, post), 2.3, paid), lerp(lerp(0.7, -0.5, post), 1.5, paid), gone, 3, 0.2);
        const k = easeOut(span(lt, 4.8, 5.6));
        if (k > 0) show(snap, 4.4, -0.3 + 0.06 * Math.sin(T * 1.2), k, 0.1 * Math.sin(T * 0.9), (1 - k) * 2.5 - 0.25 + 0.2 * Math.sin(T * 0.7), -0.08);
      } },
    { name: "nfc", dur: 6.5, fn(lt) {
        const k = easeOut(span(lt, 0.2, 1.2));
        if (k > 0) show(tag, 0, -1.6, k, -1.05, 0, (1 - k) * 2);
        // the card comes down, touches the tag and lifts off again
        const down = easeInOut(span(lt, 1.3, 2.7)), up = easeInOut(span(lt, 2.9, 3.9));
        if (lt > 1.0) show(yellowstone, 0, lerp(lerp(6.2, 0.35, down), 1.05, up), 0.62, lerp(-0.5, -0.12, down), 0.3 * Math.sin(T * 0.8), lerp(0.25, 0, down), 0.4);
        pulses.forEach((p, i) => {
          const q = span(lt, 2.75 + i * 0.4, 4.2 + i * 0.4);
          if (q <= 0 || q >= 1 || EX > 0) return;
          show(p, 0, -1.6, 1 + 1.5 * easeOut(q), -1.05);
          p.material.opacity = 1 - q;
        });
      } },
    { name: "close", dur: 7, hold: true, fn(lt) {
        float(hero, lt, 0.2, 0, 2.1, 0.85, 0, 0.5);
        ground(0, 0.55, 0.75, lt, 0.3);
      } },
  ];
  let total = 0;
  for (const sh of shots) {
    sh.s = total;
    total += sh.dur;
    sh.e = total;
  }
  const at = (name) => shots.find((s) => s.name === name).s;

  // ---- the words: one short line at a time ----
  const lines = [
    [at("agents") + 0.5, at("agents") + 4.2, 742, "Everyone is building AI agents."],
    [at("no market") + 0.7, at("no market") + 4.6, 540, "But there is no onchain market for them."],
    [at("the card") + 0.6, at("the card") + 3.4, 800, "Ghostwork is a market where every agent is a card."],
    [at("the card") + 3.6, at("the card") + 6.5, 800, "Each card is an NFT on NEAR."],
    [at("the card") + 6.7, at("the card") + 9.6, 800, "Hold the card and you own the agent, and what it earns."],
    [at("a job") + 0.6, at("a job") + 3.7, 820, "You pay a card per job. The contract holds the money."],
    [at("a job") + 3.9, at("a job") + 7.1, 820, "When the answer arrives, the contract splits it."],
    [at("near") + 0.4, at("near") + 2.2, 985, "NEAR does more than move money."],
    [at("near") + 2.4, at("near") + 4.5, 985, "The agent, its picture and its record live in one contract."],
    [at("near") + 4.7, at("near") + 6.6, 985, "Payments are held and split by code, the same for everyone."],
    [at("near ai") + 0.5, at("near ai") + 4.0, 850, "Every answer is written by a model on NEAR AI Cloud."],
    [at("near ai") + 4.2, at("near ai") + 6.3, 850, "The same model checks the proof photos."],
    [at("near ai") + 6.5, at("near ai") + 8.6, 850, "A tenth of every job pays for it."],
    [at("intents") + 0.5, at("intents") + 3.7, 850, "No NEAR? Pay from another chain."],
    [at("intents") + 3.9, at("intents") + 7.0, 850, "NEAR Intents swaps it and delivers NEAR to your account."],
    [at("intents") + 7.2, at("intents") + 10.1, 850, "Intents also prices every card in dollars and SOL."],
    [at("chain sigs") + 0.6, at("chain sigs") + 5.1, 850, "Chain Signatures give each card its own Ethereum and Bitcoin addresses."],
    [at("abilities") + 0.6, at("abilities") + 5.6, 985, "Give it your data, your own tools, or any MCP server."],
    [at("radius") + 0.5, at("radius") + 3.2, 850, "An agent can't go anywhere. So it hires someone nearby."],
    [at("radius") + 3.4, at("radius") + 6.3, 850, "They go there and send a photo. The agent checks it."],
    [at("radius") + 6.5, at("radius") + 9.1, 850, "The contract pays them on the spot."],
    [at("nfc") + 0.6, at("nfc") + 6.1, 930, "Put an agent on an NFC tag. Tap to open it."],
    [at("close") + 0.9, 999, 610, "Ghostwork", "big"],
    [at("close") + 1.5, 999, 712, "Live on NEAR mainnet  ·  ghostwork.unretain.near", "small"],
    [at("close") + 2.1, 999, 772, "unretain.github.io/ghostwork", "link"],
  ].map(([s, e, y, text, kind]) => {
    const el = document.createElement("div");
    el.className = `line ${kind ?? ""}`;
    el.style.top = `${y}px`;
    el.textContent = text;
    document.getElementById("lines").appendChild(el);
    return { s, e, el };
  });

  function seek(t) {
    t = clamp(t, 0, total - 1e-4);
    T = t;
    const sh = shots.find((s) => t >= s.s && t < s.e);
    const lt = t - sh.s;
    EX = sh.hold ? 0 : easeIn(span(lt, sh.dur - 0.5, sh.dur));
    for (const o of actors) o.visible = false;
    sh.fn(lt);
    // a slow push in on every shot, with a slight drift sideways
    camera.position.set(0.7 * Math.sin(t * 0.21), 0.25 * Math.sin(t * 0.17), 30.6 - 1.3 * (lt / sh.dur));
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
    for (const { s, e, el } of lines) {
      const k = easeOut(span(t, s, s + 0.7)) * (1 - easeIn(span(t, e - 0.45, e)));
      el.style.opacity = k;
      el.style.filter = k < 0.999 ? `blur(${((1 - k) * 10).toFixed(2)}px)` : "none";
      el.style.transform = `translateY(${((1 - k) * 14).toFixed(2)}px)`;
    }
  }

  seek(0);
  window.__total = total;
  window.__scenes = shots.map((s) => ({ name: s.name, start: s.s, end: s.e }));
  window.__seek = seek;
  window.__ready = true;

  // preview: play, pause, scrub (not used when rendering)
  if (!new URLSearchParams(location.search).has("export")) {
    const scrub = document.getElementById("scrub"), clock = document.getElementById("clock"), pp = document.getElementById("pp");
    let now = 0, playing = true, last = null;
    pp.onclick = () => ((now = now >= total - 0.01 ? 0 : now), (playing = !playing));
    scrub.oninput = () => ((playing = false), (now = (scrub.value / 1000) * total));
    const tick = (ts) => {
      if (last !== null && playing) now = Math.min(total, now + (ts - last) / 1000);
      if (now >= total) playing = false;
      last = ts;
      seek(now);
      if (document.activeElement !== scrub) scrub.value = (now / total) * 1000;
      clock.textContent = `${now.toFixed(1)} / ${total.toFixed(1)}s`;
      pp.textContent = playing ? "pause" : "play";
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}
main().catch((e) => {
  window.__error = String(e?.stack ?? e);
  console.error(e);
});
