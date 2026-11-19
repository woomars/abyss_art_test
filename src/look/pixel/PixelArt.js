// Pixel-art sheets (assets/images/px, copied by tools/art/sync_px.py from asset_dev dot_gen).
// They load in the background; until a sheet is in, or when there is none, the Canvas shapes are drawn as before.
export const WORLD = 3; // world units per game pixel (a res-2 sheet pixel is 1.5)

export class PixelArt {
  constructor(base = 'assets/images/px/', ver = '') {
    this.sheets = {}; // key -> { a: atlas entry, img, white }
    this.doll = null; // the hero's paper doll: { a, imgs: { body, head, helm: { grade: img }, ... } }
    if (typeof Image === 'undefined' || typeof fetch === 'undefined') return;
    const q = ver ? `?v=${ver}` : '';
    const img = (p) => { const i = new Image(); i.src = base + p + q; return i; };
    fetch(base + 'index.json' + q).then((r) => r.json()).then((index) => {
      for (const [dir, atlas] of Object.entries(index)) {
        if (atlas.sheets) {
          const imgs = {};
          for (const [part, s] of Object.entries(atlas.sheets)) {
            imgs[part] = typeof s === 'string' ? img(`${dir}/${s}`) : Object.fromEntries(Object.entries(s).map(([g, f]) => [g, img(`${dir}/${f}`)]));
          }
          this.doll = { a: atlas, imgs };
        } else {
          for (const [k, a] of Object.entries(atlas)) this.sheets[k] = { a, img: img(`${dir}/${k}.png`), white: a.white ? img(`${dir}/${k}_white.png`) : null };
        }
      }
    }).catch(() => {});
  }

  // a sheet ready to draw, or null
  get(key) {
    const s = this.sheets[key];
    return s && ready(s.img) ? s : null;
  }

  // frame n of a sheet with its anchor at (x, y); flip mirrors left-right; k scales
  frame(ctx, a, img, n, x, y, flip = false, k = 1) {
    if (!ready(img)) return;
    const u = (WORLD / a.res) * k, sx = (n % a.cols) * a.w, sy = Math.floor(n / a.cols) * a.h;
    if (!flip) { ctx.drawImage(img, sx, sy, a.w, a.h, x - a.ax * u, y - a.ay * u, a.w * u, a.h * u); return; }
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(-1, 1);
    ctx.drawImage(img, sx, sy, a.w, a.h, -a.ax * u, -a.ay * u, a.w * u, a.h * u);
    ctx.restore();
  }
}

// a loaded image, or a canvas (tinted copies)
export const ready = (img) => !!img && (img.complete === undefined ? img.width > 0 : img.complete && img.naturalWidth > 0);

// eight ways: d0 = right, clockwise (screen y points down)
export const dir8 = (ang) => ((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8;

// characters: down, up, right; left is right mirrored
export function face(ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  if (Math.abs(c) >= Math.abs(s)) return { d: 'right', flip: c < 0 };
  return { d: s > 0 ? 'down' : 'up', flip: false };
}

// frame i of an animation list running at fps (looping)
export const loop = (list, fps, t) => list[Math.floor(t * fps) % list.length];
