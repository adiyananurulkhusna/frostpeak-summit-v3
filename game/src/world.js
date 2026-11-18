// world.js — Frostpeak: the snowy city map, its roads, buildings, pines and frozen lake.
// Everything here is generated from one fixed seed so the city is identical every run.

export const WORLD_W = 3200;
export const WORLD_H = 2400;

// Deterministic random number generator (mulberry32) so the map never changes.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Roads as segments: {x1, y1, x2, y2, w}. Grid streets plus a winding mountain road.
export const ROADS = [
  { x1: 0, y1: 400, x2: WORLD_W, y2: 400, w: 120 },
  { x1: 0, y1: 900, x2: WORLD_W, y2: 900, w: 120 },
  { x1: 0, y1: 1400, x2: WORLD_W, y2: 1400, w: 120 },
  { x1: 0, y1: 1900, x2: WORLD_W, y2: 1900, w: 120 },
  { x1: 500, y1: 0, x2: 500, y2: WORLD_H, w: 120 },
  { x1: 1100, y1: 0, x2: 1100, y2: WORLD_H, w: 120 },
  { x1: 1700, y1: 0, x2: 1700, y2: WORLD_H, w: 120 },
  { x1: 2300, y1: 0, x2: 2300, y2: WORLD_H, w: 120 },
  { x1: 2800, y1: 0, x2: 2800, y2: WORLD_H, w: 120 },
  // Mountain road: climbs from the north street up to the summit cabin.
  { x1: 2300, y1: 400, x2: 2580, y2: 300, w: 110 },
  { x1: 2580, y1: 300, x2: 2830, y2: 330, w: 110 },
  { x1: 2830, y1: 330, x2: 2950, y2: 250, w: 110 },
];

// The frozen lake in the middle of town. Drivable, but extremely slippery.
export const LAKE = { cx: 1600, cy: 1150, rx: 380, ry: 260 };

// Named places the story uses.
export const PLACES = {
  depot: { x: 430, y: 300, label: 'Depot Snowplow' },
  lodge: { x: 1180, y: 1020, label: 'Lodge Frostpeak' },
  clinic: { x: 1780, y: 820, label: 'Klinik Salju' },
  bank: { x: 1780, y: 1480, label: 'Bank Frostpeak' },
  hideout: { x: 2920, y: 2100, label: 'Gudang Tua' },
  summit: { x: 2960, y: 210, label: 'Kabin Puncak' },
  skier: { x: 2620, y: 280, label: 'Pendaki Tersesat' },
  gunShop: { x: 620, y: 980, label: 'Toko Alat' },
};

function distToSegment(px, py, s) {
  const dx = s.x2 - s.x1;
  const dy = s.y2 - s.y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - s.x1) * dx + (py - s.y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = s.x1 + t * dx;
  const cy = s.y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

// True when a point is on asphalt (within half the road width of a segment).
export function isOnRoad(x, y) {
  for (const s of ROADS) {
    if (distToSegment(x, y, s) < s.w / 2) return true;
  }
  return false;
}

// True when a point is on the frozen lake.
export function isOnIce(x, y) {
  const dx = (x - LAKE.cx) / LAKE.rx;
  const dy = (y - LAKE.cy) / LAKE.ry;
  return dx * dx + dy * dy < 1;
}

// Grip factor for driving: 1.0 is normal asphalt, lower is more slide.
export function gripAt(x, y) {
  if (isOnIce(x, y)) return 0.35;
  if (isOnRoad(x, y)) return 1.0;
  return 0.55; // deep snow off-road
}

function buildBuildings(rng) {
  const list = [];
  const xBlocks = [
    [60, 440], [620, 1040], [1220, 1640], [1820, 2240], [2420, 2740], [2920, 3140],
  ];
  const yBlocks = [
    [60, 340], [520, 840], [1020, 1340], [1520, 1840], [2020, 2340],
  ];
  const palette = ['#b8574a', '#4a7ab8', '#5a8a5a', '#a8843c', '#7a5aa8', '#3f6f6f', '#96507a'];
  for (const [x0, x1] of xBlocks) {
    for (const [y0, y1] of yBlocks) {
      const count = 1 + Math.floor(rng() * 2);
      for (let i = 0; i < count; i++) {
        const w = 90 + rng() * 110;
        const h = 80 + rng() * 100;
        const x = x0 + rng() * Math.max(1, x1 - x0 - w);
        const y = y0 + rng() * Math.max(1, y1 - y0 - h);
        // Keep the frozen lake clear of buildings.
        const cx = x + w / 2;
        const cy = y + h / 2;
        const lx = (cx - LAKE.cx) / (LAKE.rx + 90);
        const ly = (cy - LAKE.cy) / (LAKE.ry + 90);
        if (lx * lx + ly * ly < 1) continue;
        list.push({
          x, y, w, h,
          color: palette[Math.floor(rng() * palette.length)],
          roof: rng() > 0.5,
        });
      }
    }
  }
  return list;
}

function buildTrees(rng, buildings) {
  const trees = [];
  let tries = 0;
  while (trees.length < 230 && tries < 4000) {
    tries++;
    const x = 40 + rng() * (WORLD_W - 80);
    const y = 40 + rng() * (WORLD_H - 80);
    if (isOnRoad(x, y) || isOnIce(x, y)) continue;
    let bad = false;
    for (const b of buildings) {
      if (x > b.x - 30 && x < b.x + b.w + 30 && y > b.y - 30 && y < b.y + b.h + 30) { bad = true; break; }
    }
    if (bad) continue;
    trees.push({ x, y, r: 12 + rng() * 10, shade: 0.75 + rng() * 0.25 });
  }
  return trees;
}

const rng = makeRng(1337);
export const BUILDINGS = buildBuildings(rng);
export const TREES = buildTrees(rng, BUILDINGS);

// Circle-vs-building collision. Returns the building hit, or null.
export function hitBuilding(x, y, r) {
  for (const b of BUILDINGS) {
    if (x > b.x - r && x < b.x + b.w + r && y > b.y - r && y < b.y + b.h + r) return b;
  }
  return null;
}

// Push a circle out of any building it overlaps. Returns true when a push happened.
export function pushOutOfBuildings(pos, r) {
  const b = hitBuilding(pos.x, pos.y, r);
  if (!b) return false;
  const left = pos.x - (b.x - r);
  const right = b.x + b.w + r - pos.x;
  const top = pos.y - (b.y - r);
  const bottom = b.y + b.h + r - pos.y;
  const m = Math.min(left, right, top, bottom);
  if (m === left) pos.x = b.x - r;
  else if (m === right) pos.x = b.x + b.w + r;
  else if (m === top) pos.y = b.y - r;
  else pos.y = b.y + b.h + r;
  return true;
}

export function clampToWorld(pos, margin) {
  pos.x = Math.max(margin, Math.min(WORLD_W - margin, pos.x));
  pos.y = Math.max(margin, Math.min(WORLD_H - margin, pos.y));
}

// ---- drawing ---------------------------------------------------------------

function drawGround(ctx, cam, time) {
  const { x, y, w, h } = cam;
  ctx.fillStyle = '#dfe9f4';
  ctx.fillRect(x, y, w, h);
  // Soft snow drifts: pale patches that drift slowly with the wind.
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  for (let i = 0; i < 40; i++) {
    const px = ((i * 613 + time * 12) % WORLD_W);
    const py = ((i * 977 + time * 5) % WORLD_H);
    if (px < x - 100 || px > x + w + 100 || py < y - 100 || py > y + h + 100) continue;
    ctx.beginPath();
    ctx.ellipse(px, py, 90 + (i % 5) * 22, 34 + (i % 3) * 12, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Frozen lake.
  ctx.fillStyle = '#a9cfe8';
  ctx.beginPath();
  ctx.ellipse(LAKE.cx, LAKE.cy, LAKE.rx, LAKE.ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(LAKE.cx - 200, LAKE.cy - 60);
  ctx.lineTo(LAKE.cx - 40, LAKE.cy + 30);
  ctx.lineTo(LAKE.cx + 150, LAKE.cy - 40);
  ctx.moveTo(LAKE.cx - 120, LAKE.cy + 120);
  ctx.lineTo(LAKE.cx + 60, LAKE.cy + 80);
  ctx.stroke();
  ctx.fillStyle = '#5a7d9e';
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('DANAU BEKU', LAKE.cx, LAKE.cy - LAKE.ry - 12);
}

function drawRoads(ctx, cam) {
  const { x, y, w, h } = cam;
  ctx.lineCap = 'round';
  for (const s of ROADS) {
    if (Math.max(s.x1, s.x2) < x - 100 || Math.min(s.x1, s.x2) > x + w + 100) continue;
    if (Math.max(s.y1, s.y2) < y - 100 || Math.min(s.y1, s.y2) > y + h + 100) continue;
    // Asphalt with a snow rim.
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = s.w + 14;
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
    ctx.strokeStyle = '#3d4450';
    ctx.lineWidth = s.w;
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
    // Centre dashes.
    ctx.strokeStyle = 'rgba(240,220,120,0.9)';
    ctx.lineWidth = 4;
    ctx.setLineDash([26, 30]);
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawBuildings(ctx, cam) {
  const { x, y, w, h } = cam;
  for (const b of BUILDINGS) {
    if (b.x > x + w + 60 || b.x + b.w < x - 60 || b.y > y + h + 60 || b.y + b.h < y - 60) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(b.x + 5, b.y + 7, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    // Windows, warmly lit.
    ctx.fillStyle = '#ffd98a';
    const cols = Math.max(1, Math.floor(b.w / 34));
    const rows = Math.max(1, Math.floor(b.h / 34));
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        if ((i * 7 + j * 3) % 4 === 0) continue;
        ctx.fillRect(b.x + 8 + i * 32, b.y + 8 + j * 32, 14, 16);
      }
    }
    // Snowy roof.
    ctx.fillStyle = '#f4f8ff';
    ctx.fillRect(b.x - 4, b.y - 4, b.w + 8, 16);
    if (b.roof) {
      ctx.beginPath();
      ctx.moveTo(b.x - 6, b.y + 10);
      ctx.lineTo(b.x + b.w / 2, b.y - 22);
      ctx.lineTo(b.x + b.w + 6, b.y + 10);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function drawTrees(ctx, cam) {
  const { x, y, w, h } = cam;
  for (const t of TREES) {
    if (t.x < x - 60 || t.x > x + w + 60 || t.y < y - 60 || t.y > y + h + 60) continue;
    const g = t.shade;
    ctx.fillStyle = `rgb(${Math.round(38 * g)},${Math.round(96 * g)},${Math.round(58 * g)})`;
    ctx.beginPath();
    ctx.moveTo(t.x, t.y - t.r * 1.9);
    ctx.lineTo(t.x - t.r, t.y + t.r * 0.7);
    ctx.lineTo(t.x + t.r, t.y + t.r * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(t.x, t.y - t.r * 1.9);
    ctx.lineTo(t.x - t.r * 0.45, t.y - t.r * 0.5);
    ctx.lineTo(t.x + t.r * 0.45, t.y - t.r * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#6b4a2f';
    ctx.fillRect(t.x - 2, t.y + t.r * 0.7, 4, 7);
  }
}

function drawPlaceLabels(ctx, cam) {
  const { x, y, w, h } = cam;
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  for (const key of Object.keys(PLACES)) {
    const p = PLACES[key];
    if (p.x < x - 80 || p.x > x + w + 80 || p.y < y - 80 || p.y > y + h + 80) continue;
    ctx.fillStyle = 'rgba(20,40,70,0.75)';
    const tw = ctx.measureText(p.label).width + 14;
    ctx.fillRect(p.x - tw / 2, p.y - 26, tw, 18);
    ctx.fillStyle = '#eaf3ff';
    ctx.fillText(p.label, p.x, p.y - 12);
  }
}

export function drawWorld(ctx, cam, time) {
  drawGround(ctx, cam, time);
  drawRoads(ctx, cam);
  drawBuildings(ctx, cam);
  drawTrees(ctx, cam);
  drawPlaceLabels(ctx, cam);
}
