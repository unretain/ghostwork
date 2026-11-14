// LED-matrix renderer: paints a low-resolution source as a grid of lit cells
// separated by dark gaps, the way an LED wall shows an image.

const tiles = new Map<string, HTMLCanvasElement>();

// One cell-sized tile: transparent where the LED is, `bg` in the gaps and corners.
function gridTile(cw: number, ch: number, gap: number, bg: string) {
  const key = `${cw}x${ch}/${gap}/${bg}`;
  let tile = tiles.get(key);
  if (!tile) {
    tile = document.createElement("canvas");
    tile.width = cw;
    tile.height = ch;
    const t = tile.getContext("2d")!;
    t.fillStyle = bg;
    t.fillRect(cw - gap, 0, gap, ch);
    t.fillRect(0, ch - gap, cw, gap);
    // soften the four corners of the lit area so cells read as rounded
    t.globalAlpha = 0.55;
    const c = Math.max(1, Math.round(gap));
    t.fillRect(0, 0, c, c);
    t.fillRect(cw - gap - c, 0, c, c);
    t.fillRect(0, ch - gap - c, c, c);
    t.fillRect(cw - gap - c, ch - gap - c, c, c);
    tiles.set(key, tile);
  }
  return tile;
}

/**
 * Draw `src` (cols x rows pixels, one pixel per LED) onto `ctx` as a matrix.
 * All sizes are in device pixels.
 */
export function paintMatrix(
  ctx: CanvasRenderingContext2D,
  src: CanvasImageSource,
  cols: number,
  rows: number,
  cw: number,
  ch: number,
  gap: number,
  bg: string,
) {
  ctx.imageSmoothingEnabled = false;
  ctx.globalCompositeOperation = "source-over";
  ctx.drawImage(src, 0, 0, cols, rows, 0, 0, cols * cw, rows * ch);
  ctx.fillStyle = ctx.createPattern(gridTile(cw, ch, gap, bg), "repeat")!;
  ctx.fillRect(0, 0, cols * cw, rows * ch);
}

export function seeded(seed: number) {
  let s = (Math.abs(Math.floor(seed)) % 2147483646) + 1;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}
