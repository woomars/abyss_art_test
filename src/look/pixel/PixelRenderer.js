// The pixel screen (PixiJS). The world is drawn into a small texture - one texture pixel = 1.5 world units,
// a res-2 sheet pixel (body pixels show 2x2) - and blown up by a whole number with no smoothing, with the
// camera on whole pixels. Sheets become Pixi sprites; what has no sheet yet is still drawn by the Canvas
// draw* functions onto two small canvases (below and above the characters). The HUD overlay is drawn sharp
// on the page canvas (#game) on top. Same face as Renderer: resize, scale, viewWorld, worldToScreen, render.
import { BUILD } from '../../core/version.js';
import { Renderer } from '../render/Renderer.js';
import { drawArena } from '../render/drawArena.js';
import { drawScreen } from '../render/drawHud.js';
import { PixelArt, WORLD, ready } from './PixelArt.js';

export const FINE = 1.5; // world units per screen-texture pixel

// PixelArt whose frames become sprites in the current layer (the canvas transform at the call included)
class PixiArt extends PixelArt {
  constructor(P, ver) {
    super('assets/images/px/', ver);
    this.P = P;
    this.layers = {};
    this.layer = null;
    this.cache = new Map(); // img -> { base, frames: [] }
    this.mat = new P.Matrix();
  }

  addLayer(name, container) { this.layers[name] = { c: container, pool: [], n: 0 }; }
  begin() { for (const l of Object.values(this.layers)) l.n = 0; }
  end() { for (const l of Object.values(this.layers)) for (let i = l.n; i < l.pool.length; i++) l.pool[i].visible = false; }

  tex(img, a, n) {
    let e = this.cache.get(img);
    if (!e) { e = { base: this.P.Texture.from(img), frames: [] }; this.cache.set(img, e); }
    if (!e.frames[n]) {
      const frame = new this.P.Rectangle((n % a.cols) * a.w, Math.floor(n / a.cols) * a.h, a.w, a.h);
      e.frames[n] = new this.P.Texture({ source: e.base.source, frame });
    }
    return e.frames[n];
  }

  frame(ctx, a, img, n, x, y, flip = false, k = 1) {
    const l = this.layers[this.layer];
    if (!l || !ready(img)) return;
    let sp = l.pool[l.n];
    if (!sp) { sp = new this.P.Sprite(); l.pool.push(sp); l.c.addChild(sp); }
    l.n++;
    sp.visible = true;
    sp.texture = this.tex(img, a, n);
    sp.anchor.set(a.ax / a.w, a.ay / a.h);
    sp.alpha = ctx.globalAlpha;
    const M = ctx.getTransform(), u = (WORLD / a.res) * k, sx = flip ? -u : u;
    const e = M.a * x + M.c * y + M.e, f = M.b * x + M.d * y + M.f;
    this.mat.set(M.a * sx, M.b * sx, M.c * u, M.d * u, Math.round(e), Math.round(f)); // whole pixels: no shimmer
    sp.setFromMatrix(this.mat);
  }
}

export class PixelRenderer extends Renderer {
  static async create(P, canvas, config) {
    P.TextureSource.defaultOptions.scaleMode = 'nearest';
    const app = new P.Application();
    await app.init({ width: 2, height: 2, background: config.look.render.colors.bg, antialias: false, autoStart: false, resolution: 1, preference: 'webgl' });
    return new PixelRenderer(P, app, canvas, config);
  }

  constructor(P, app, canvas, config) {
    super(canvas, config, { alpha: true }); // #game becomes the see-through HUD overlay (and keeps the input)
    this.P = P;
    this.app = app;
    this.octx = this.ctx;
    app.ticker.stop();
    Object.assign(app.canvas.style, { position: 'absolute', left: '0', top: '0', pointerEvents: 'none', imageRendering: 'pixelated' });
    canvas.parentNode.insertBefore(app.canvas, canvas);
    this.px = new PixiArt(P, BUILD);
    this.scene = new P.Container();
    this.below = new P.Sprite();
    this.actors = new P.Container();
    this.above = new P.Sprite();
    this.fxLayer = new P.Container();
    this.scene.addChild(this.below, this.actors, this.above, this.fxLayer);
    this.px.addLayer('actors', this.actors);
    this.px.addLayer('fx', this.fxLayer);
    this.view = new P.Sprite();
    app.stage.addChild(this.view);
    this.m = 1; this.fineW = 1; this.fineH = 1;
  }

  // the blow-up: a whole number that shows close to viewHeight; a fraction only when no whole number comes near
  resize(cssW, cssH, dpr) {
    const P = this.P, d = Math.min(dpr, this.config.look.camera.maxDpr);
    this.cssW = cssW; this.cssH = cssH; this.dpr = d;
    const W = Math.max(1, Math.round(cssW * d)), H = Math.max(1, Math.round(cssH * d));
    const want = this.config.camera.viewHeight / FINE, mi = Math.max(1, Math.round(H / want)), k = H / mi / want;
    this.m = k >= 0.9 && k <= 1.2 ? mi : H / want;
    const fw = (this.fineW = Math.ceil(W / this.m)), fh = (this.fineH = Math.ceil(H / this.m));
    this.canvas.width = W; this.canvas.height = H;
    this.canvas.style.width = cssW + 'px'; this.canvas.style.height = cssH + 'px';
    this.app.renderer.resize(W, H);
    this.app.canvas.style.width = cssW + 'px'; this.app.canvas.style.height = cssH + 'px';
    for (const t of [this.rt, this.texB, this.texA]) if (t) t.destroy(true);
    const layer = () => { const c = document.createElement('canvas'); c.width = fw; c.height = fh; return c; };
    const cb = layer(), ca = layer();
    this.bctx = cb.getContext('2d');
    this.actx = ca.getContext('2d');
    this.texB = P.Texture.from(cb); this.below.texture = this.texB;
    this.texA = P.Texture.from(ca); this.above.texture = this.texA;
    this.rt = P.RenderTexture.create({ width: fw, height: fh });
    this.view.texture = this.rt;
    this.view.scale.set(this.m);
    this._floorPat = null;
  }

  get scale() { return this.m / (FINE * this.dpr); } // css px per world unit
  get viewWorld() { return { w: this.cssW / this.scale, h: this.cssH / this.scale }; }

  render(game, fx, alpha) {
    this.fx = fx;
    const c = this.cameraPos(game, alpha), W = this.fineW, H = this.fineH;
    const cam = (this.cam = { x: Math.round(c.x / FINE) * FINE, y: Math.round(c.y / FINE) * FINE });
    const ox = Math.floor(W / 2) - cam.x / FINE, oy = Math.floor(H / 2) - cam.y / FINE;
    const prep = (ctx, fill) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      if (fill) { ctx.fillStyle = this.colors.bg; ctx.fillRect(0, 0, W, H); } else ctx.clearRect(0, 0, W, H);
      ctx.imageSmoothingEnabled = false;
      ctx.setTransform(1 / FINE, 0, 0, 1 / FINE, ox, oy);
    };
    this.px.begin();
    prep(this.bctx, true);
    this.ctx = this.bctx; this.px.layer = 'actors';
    drawArena(this, game.arena, cam);
    this.drawWorldBelow(game, alpha);
    prep(this.actx, false);
    this.ctx = this.actx; this.px.layer = 'fx';
    this.drawWorldAbove(game, alpha);
    this.px.end();
    this.texB.source.update();
    this.texA.source.update();
    const r = this.app.renderer;
    r.render({ container: this.scene, target: this.rt, clear: true });
    r.render(this.app.stage);
    // the HUD overlay, sharp, on the page canvas
    const o = (this.ctx = this.octx);
    o.setTransform(1, 0, 0, 1, 0, 0);
    o.clearRect(0, 0, this.canvas.width, this.canvas.height);
    o.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    drawScreen(this, game, alpha);
    o.fillStyle = this.colors.text;
    o.font = '10px monospace';
    o.textBaseline = 'bottom';
    o.textAlign = 'left';
    o.fillText(`build ${BUILD} px`, 6, this.cssH - 4);
  }
}
