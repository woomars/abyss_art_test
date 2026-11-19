// Draws the pixel-art sheets where there are some; each function returns false (or null) when its sheet
// is not there, and the caller draws its old Canvas shape instead.
import { WORLD, ready, dir8, face, loop } from './PixelArt.js';

// enemy type -> its sheet and animation names (types not here keep their Canvas shapes)
const ENEMY = {
  soldier: { key: 'skel', shadow: 'shadow', slash: 'slashS', wind: 'wind', strike: 'strike', stun: 'hurt' },
  elite: { key: 'orc', shadow: 'shadowBig', slash: 'slashE', wind: 'windCleave', strike: 'strikeCleave', stun: 'stagger' },
};
const SLASH_R = { slashP: 46, slashS: 33, slashE: 49 }; // the crescent's radius in sheet pixels (art.py slash_frames)
const DOLL_GRADE = (g) => (g === 'set' ? 'legendary' : g); // no set designs drawn yet
const FEET = 0.6; // feet below the body centre, in body radii

// the room floor: the four stone tiles laid in a fixed jumble, as a repeating pattern (null: not loaded)
export function floorPattern(rd) {
  if (rd._floorPat) return rd._floorPat;
  const s = rd.px.get('floor');
  if (!s || typeof document === 'undefined') return null;
  const a = s.a, N = 8, c = document.createElement('canvas');
  c.width = a.w * N; c.height = a.h * N;
  const g = c.getContext('2d');
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const n = (x * 7 + y * 13 + ((x * y) % 3)) % a.n;
    g.drawImage(s.img, (n % a.cols) * a.w, Math.floor(n / a.cols) * a.h, a.w, a.h, x * a.w, y * a.h, a.w, a.h);
  }
  const pat = rd.ctx.createPattern(c, 'repeat'), u = WORLD / a.res;
  pat.setTransform(new DOMMatrix([u, 0, 0, u, 0, 0]));
  rd._floorPat = pat;
  return pat;
}

function shadow(rd, key, x, y) {
  const s = rd.px.get(key);
  if (s) rd.px.frame(rd.ctx, s.a, s.img, 0, x, y);
}

// the hero: body and head, then each worn part in its grade colour (helm, sword, shield, armor, boots)
export function drawHeroPx(rd, game, alpha, lift) {
  const doll = rd.px.doll;
  if (!doll || !ready(doll.imgs.body)) return false;
  const p = game.player, a = doll.a, im = doll.imgs, ctx = rd.ctx, t = performance.now() / 1000;
  const { x, y } = rd.lerpPos(p.prevPos, p.pos, alpha);
  const f = face(p.visualAngle);
  const anim = (name) => a.anims[`${name}_${f.d}`];
  let slash = null;
  rd.fx.effects.slashes.forEachActive((s) => { if (!s.wave && (!slash || s.life > slash.life)) slash = s; });
  let n;
  if (rd.fx.hurtFlash > 0) n = loop(anim('hurt'), 10, t);
  else if (slash) { const l = anim('attack'); n = l[Math.min(l.length - 1, Math.floor((1 - slash.life / slash.max) * l.length))]; }
  else if (game.combat._state === 'dash' || game.skills.rush) n = anim('dash')[0];
  else if (Math.hypot(p.pos.x - p.prevPos.x, p.pos.y - p.prevPos.y) > 0.01) n = loop(anim('walk'), 9, t);
  else n = loop(anim('idle'), 2, t);
  const feet = y + p.radius * FEET, k = lift ? lift.s : 1, fy = feet - (lift ? lift.z : 0);
  if (!lift) shadow(rd, 'shadow', x, feet);
  const worn = game.loadout ? game.loadout.slots : {};
  const gear = { helm: worn.helm, armor: worn.armor, boots: worn.boots, shield: worn.gloves };
  const sheet = (part) => {
    if (part === 'body' || part === 'head') return im[part];
    if (part === 'sword') return im.sword[worn.weapon ? DOLL_GRADE(worn.weapon.grade) : 'base'];
    return gear[part] ? im[part][DOLL_GRADE(gear[part].grade)] : null;
  };
  const blink = p.invuln > 0 && Math.floor(p.invuln * 20) % 2 === 0;
  if (blink) ctx.globalAlpha = 0.45;
  for (const layer of a.order) {
    const [part, side] = layer.split(':');
    if (side && (a.front[part][n] ? 'front' : 'back') !== side) continue;
    const img = sheet(part);
    if (img) rd.px.frame(ctx, a, img, n, x, fy, f.flip, k);
  }
  ctx.globalAlpha = 1;
  return true;
}

// a skeleton soldier or an orc warrior (false for every other kind)
export function drawEnemyPx(rd, game, e, x, y, flash) {
  const m = ENEMY[e.type];
  if (!m || e.cloneOf) return false;
  const s = rd.px.get(m.key);
  if (!s) return false;
  const a = s.a, pp = game.player.pos, t = performance.now() / 1000 + (e.id || 0) * 0.37;
  const to = e.windupDir || { x: pp.x - e.pos.x, y: pp.y - e.pos.y };
  const f = face(Math.atan2(to.y, to.x));
  const anim = (name) => a.anims[`${name}_${f.d}`];
  const at = (l, k) => l[Math.max(0, Math.min(l.length - 1, Math.floor(k * l.length)))];
  let n;
  if (e.dying) n = at(anim('die'), 1 - Math.max(0, e.deathTimer / e.root.deathTime));
  else if (e.stunTime > 0) n = loop(anim(m.stun), 6, t);
  else if (e.strikeTime > 0) n = loop(anim(m.strike), 10, t);
  else if (e.windupTime > 0) n = at(anim(m.wind), 1 - e.windupTime / Math.max(1e-6, e.windupMax));
  else if (flash) n = anim('hurt')[0];
  else if (Math.hypot(e.pos.x - e.prevPos.x, e.pos.y - e.prevPos.y) > 0.01) n = loop(anim('walk'), 8, t);
  else n = loop(anim('idle'), 2, t);
  const feet = y + e.radius * FEET;
  if (!e.dying) shadow(rd, m.shadow, x, feet);
  rd.px.frame(rd.ctx, a, flash && ready(s.white) ? s.white : s.img, n, x, feet, f.flip);
  if (e.strikeTime > 0 && !e.dying) { // its swing: the crescent over its reach
    const sl = rd.px.get(m.slash);
    if (sl) {
      const reach = e.radius + (e.tcfg.attackRange || 0) + game.player.radius;
      const l = sl.a.anims[`d${dir8(Math.atan2(to.y, to.x))}`];
      rd.px.frame(rd.ctx, sl.a, sl.img, at(l, 1 - e.strikeTime / 0.18), x, y, false, reach / (SLASH_R[m.slash] * WORLD / sl.a.res));
    }
  }
  return true;
}

// the hero's swing (not the wind wave): the blue crescent, mirrored for the backhand swing
export function drawSlashPx(rd, s) {
  const sl = rd.px.get('slashP');
  if (!sl || s.wave) return false;
  const ctx = rd.ctx, l = sl.a.anims[`d${dir8(s.angle)}`];
  const n = l[Math.min(l.length - 1, Math.floor((1 - s.life / s.max) * l.length))];
  ctx.save();
  ctx.translate(s.x, s.y);
  if (s.sweep < 0) { ctx.rotate(s.angle); ctx.scale(1, -1); ctx.rotate(-s.angle); }
  rd.px.frame(ctx, sl.a, sl.img, n, 0, 0, false, s.radius / (SLASH_R.slashP * WORLD / sl.a.res));
  ctx.restore();
  return true;
}

// one-shot sheets (hit sparks, death bursts) from fx.sprites
export function drawFxSprites(rd, fx) {
  for (const o of fx.sprites) {
    const s = rd.px.get(o.key);
    if (!s || !rd.isVisible(o, 60)) continue;
    const l = s.a.anims[`d${o.d}`] || [...Array(s.a.n).keys()];
    rd.px.frame(rd.ctx, s.a, s.img, l[Math.min(l.length - 1, Math.floor((1 - o.life / o.max) * l.length))], o.x, o.y);
  }
}

// which particle kinds a sheet replaces
const PARTICLE_SHEET = { hit: 'spark', kill: 'burstS' };
export const particleCovered = (rd, p) => !!p.kind && !!rd.px.get(PARTICLE_SHEET[p.kind]);

// stun stars over a head
export function drawStarsPx(rd, x, y) {
  const s = rd.px.get('stars');
  if (!s) return false;
  rd.px.frame(rd.ctx, s.a, s.img, loop([...Array(s.a.n).keys()], 8, performance.now() / 1000), x, y);
  return true;
}

// a damage number in the pixel digits (words still use the font)
export function drawNumberPx(rd, n, color, scale) {
  const s = rd.px.get('digits');
  if (!s) return false;
  const a = s.a, l = a.anims[color], str = String(n.value), adv = (a.w - 1) * (WORLD / a.res) * scale;
  let x = n.x - (adv * (str.length - 1)) / 2;
  for (const ch of str) {
    const d = ch.charCodeAt(0) - 48;
    if (d >= 0 && d <= 9) rd.px.frame(rd.ctx, a, s.img, l[d], x, n.y, false, scale);
    x += adv;
  }
  return true;
}
