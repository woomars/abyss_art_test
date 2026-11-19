// Picks the screen: the Pixi pixel renderer, or the Canvas one when Pixi cannot start (no network, no WebGL)
// or when the address asks for it (?render=canvas).
import { Renderer } from '../render/Renderer.js';

const PIXI_URL = 'https://cdn.jsdelivr.net/npm/pixi.js@8.6.6/dist/pixi.min.mjs';

export async function createRenderer(canvas, config) {
  const want = new URLSearchParams(location.search).get('render');
  if (want !== 'canvas') {
    try {
      const [PIXI, { PixelRenderer }] = await Promise.all([import(PIXI_URL), import('./PixelRenderer.js')]);
      return await PixelRenderer.create(PIXI, canvas, config);
    } catch (err) {
      console.warn('pixel renderer off, Canvas instead:', err);
    }
  }
  return new Renderer(canvas, config);
}
