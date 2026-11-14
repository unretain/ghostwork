// Save video/motion.html as numbered frames, ready to encode.
//
//   node video/render.cjs <frames-dir> [fps=30] [from-seconds] [to-seconds]
//   node video/render.cjs <dir> stills 1.5 4 9.2 ...     (single frames at those times, for checking)
//
// Needs Playwright (set PLAYWRIGHT to its folder if it is not installed in this project)
// and Microsoft Edge. Encode the frames with ffmpeg, for example:
//   ffmpeg -framerate 30 -i <dir>/f_%05d.jpg -c:v libx264 -pix_fmt yuv420p -crf 16 out.mp4
const path = require("path");
const fs = require("fs");
const { chromium } = require(process.env.PLAYWRIGHT || "playwright");

(async () => {
  const [dir, mode = "30", ...rest] = process.argv.slice(2);
  if (!dir) throw new Error("Give a folder for the frames");
  fs.mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch({ channel: "msedge" });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("file:///" + path.resolve(__dirname, process.env.PAGE || "motion.html").replace(/\\/g, "/") + "?export=1");
  await page.waitForFunction("window.__ready === true || window.__error", null, { timeout: 60000 });
  const total = await page.evaluate("window.__total");
  const scenes = await page.evaluate("window.__scenes");

  if (mode === "stills") {
    for (const t of rest.map(Number)) {
      await page.evaluate((s) => window.__seek(s), t);
      await page.screenshot({ path: path.join(dir, `t_${t.toFixed(2).padStart(6, "0")}.jpg`), type: "jpeg", quality: 80 });
    }
  } else {
    const fps = Number(mode);
    const from = Math.round(Number(rest[0] ?? 0) * fps);
    const to = Math.round(Number(rest[1] ?? total) * fps);
    const started = Date.now();
    for (let i = from; i < to; i++) {
      await page.evaluate((s) => window.__seek(s), i / fps);
      await page.screenshot({ path: path.join(dir, `f_${String(i).padStart(5, "0")}.jpg`), type: "jpeg", quality: 96 });
    }
    console.log(`frames ${from}-${to - 1} in ${((Date.now() - started) / 1000).toFixed(0)}s`);
  }
  fs.writeFileSync(path.join(dir, "scenes.json"), JSON.stringify({ total, scenes }, null, 1));
  console.log(JSON.stringify({ total, scenes: scenes.map((s) => `${s.name} ${s.start}-${s.end}`), errors }));
  await browser.close();
})();
