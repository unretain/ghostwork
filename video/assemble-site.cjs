// Turn a recording from record-site.cjs into a video with sound.
//
//   node video/assemble-site.cjs <recording-dir> <out.mp4>
//
// Long waits are fast-forwarded (and labelled), and a sound is placed on every click,
// keystroke, caption and finished job. The sounds are generated here, not sampled.
// Needs ffmpeg; on Windows it is run inside WSL (set FFMPEG="ffmpeg" to run it directly).
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const [dir, outFile] = process.argv.slice(2);
if (!dir || !outFile) throw new Error("usage: assemble-site.cjs <recording-dir> <out.mp4>");
const meta = JSON.parse(fs.readFileSync(path.join(dir, "meta.json"), "utf8"));
const wsl = !process.env.FFMPEG && process.platform === "win32";
const p = (file) => (wsl ? path.resolve(file).replace(/^([A-Za-z]):/, (_, d) => `/mnt/${d.toLowerCase()}`).replace(/\\/g, "/") : path.resolve(file));

// recorded time -> time in the finished video
const fast = [...meta.fast].sort((a, b) => a.s - b.s);
function toOut(t) {
  let shift = 0;
  for (const f of fast) {
    if (t >= f.e) shift += f.e - f.s - f.to;
    else if (t > f.s) return f.s - shift + ((t - f.s) / (f.e - f.s)) * f.to;
  }
  return t - shift;
}
const total = toOut(meta.end);

// ---- picture: each saved frame is shown until the next one ----
const list = [];
meta.frames.forEach((f, i) => {
  const next = i + 1 < meta.frames.length ? meta.frames[i + 1].t : meta.end;
  const d = toOut(next) - toOut(f.t);
  if (d <= 0.0005) return;
  list.push(`file '${p(path.join(dir, "frames", f.file))}'\nduration ${d.toFixed(5)}`);
});
list.push(`file '${p(path.join(dir, "frames", meta.frames[meta.frames.length - 1].file))}'`);
fs.writeFileSync(path.join(dir, "list.txt"), list.join("\n") + "\n");

// ---- sound ----
const RATE = 48000;
const track = new Float32Array(Math.ceil((total + 1) * RATE));
let seed = 1;
const noise = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2147483648 - 1);
function add(at, seconds, fn) {
  const start = Math.round(at * RATE), n = Math.round(seconds * RATE);
  for (let i = 0; i < n && start + i < track.length; i++) track[start + i] += fn(i / RATE, i / n);
}
const SOUNDS = {
  // a soft tick for each key
  key: (at) => add(at, 0.02, (t) => 0.035 * Math.exp(-t * 320) * (Math.sin(2 * Math.PI * 2600 * t) + 0.5 * noise())),
  // a short falling click
  click: (at) => add(at, 0.07, (t) => 0.3 * Math.exp(-t * 75) * Math.sin(2 * Math.PI * (1500 - 9000 * t) * t)),
  // a rising pop when a caption appears
  pop: (at) => add(at + 0.22, 0.14, (t, k) => 0.16 * Math.sin(Math.PI * k) * Math.sin(2 * Math.PI * (430 + 1500 * t) * t)),
  // a breath of filtered noise when the page changes
  whoosh: (at) => {
    let low = 0;
    add(at, 0.38, (t, k) => {
      low += (0.05 + 0.3 * k) * (noise() - low);
      return 0.5 * Math.sin(Math.PI * k) ** 2 * low;
    });
  },
  // two notes when a job finishes
  chime: (at) => {
    add(at, 0.9, (t) => 0.2 * Math.exp(-t * 5) * Math.sin(2 * Math.PI * 880 * t));
    add(at + 0.11, 0.9, (t) => 0.2 * Math.exp(-t * 5) * Math.sin(2 * Math.PI * 1318.5 * t));
  },
};
for (const e of meta.events) {
  // nothing but the finishing chime is heard during a fast-forward
  if (e.kind !== "chime" && fast.some((f) => e.t > f.s && e.t < f.e)) continue;
  SOUNDS[e.kind]?.(toOut(e.t));
}
const wav = Buffer.alloc(44 + track.length * 2);
wav.write("RIFF", 0);
wav.writeUInt32LE(36 + track.length * 2, 4);
wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(RATE, 24);
wav.writeUInt32LE(RATE * 2, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write("data", 36);
wav.writeUInt32LE(track.length * 2, 40);
for (let i = 0; i < track.length; i++) wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, track[i])) * 32767), 44 + i * 2);
fs.writeFileSync(path.join(dir, "sound.wav"), wav);

// ---- put them together, with a label over each fast-forward ----
const FONT = process.env.FONT || "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
const labels = fast
  .map((f) => `drawtext=fontfile=${FONT}:text='▶▶  sped up':fontsize=26:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=14:x=w-tw-60:y=56:enable='between(t,${toOut(f.s).toFixed(2)},${toOut(f.e).toFixed(2)})'`)
  .join(",");
const vf = ["fps=30", "scale=1920:1080:flags=lanczos", labels, "format=yuv420p"].filter(Boolean).join(",");
const args = ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", p(path.join(dir, "list.txt")), "-i", p(path.join(dir, "sound.wav")), "-vf", vf, "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-c:a", "aac", "-b:a", "160k", "-t", total.toFixed(2), "-movflags", "+faststart", p(outFile)];
if (wsl) execFileSync("wsl.exe", ["-d", process.env.WSL_DISTRO || "Ubuntu-24.04", "-u", "root", "--", "ffmpeg", ...args], { stdio: "inherit" });
else execFileSync(process.env.FFMPEG || "ffmpeg", args, { stdio: "inherit" });
console.log(JSON.stringify({ seconds: +total.toFixed(1), sounds: meta.events.length, fastForwards: fast.map((f) => `${toOut(f.s).toFixed(1)}-${toOut(f.e).toFixed(1)}s`) }));
