// vehicles.js — cars: drift physics on ice, traffic AI and police pursuit.
// Every car keeps a velocity vector separate from its heading, so a hard turn
// on ice throws the tail out instead of gripping.

import { WORLD_W, WORLD_H, gripAt, isOnRoad, pushOutOfBuildings, clampToWorld } from './world.js';

const TAU = Math.PI * 2;

export const CAR_TYPES = {
  plow: { name: 'Snowplow', color: '#e8a13a', len: 56, wid: 28, maxSpeed: 300, accel: 300, hp: 220 },
  sedan: { name: 'Sedan', color: '#4a7ab8', len: 48, wid: 24, maxSpeed: 430, accel: 380, hp: 100 },
  hatch: { name: 'Hatchback', color: '#b8574a', len: 44, wid: 23, maxSpeed: 400, accel: 360, hp: 90 },
  van: { name: 'Van', color: '#5a8a5a', len: 54, wid: 26, maxSpeed: 340, accel: 300, hp: 140 },
  truck: { name: 'Truk', color: '#7a5aa8', len: 62, wid: 28, maxSpeed: 320, accel: 280, hp: 180 },
  police: { name: 'Patroli', color: '#20242c', len: 50, wid: 25, maxSpeed: 470, accel: 430, hp: 160 },
  vault: { name: 'Truk Brankas', color: '#c9a227', len: 62, wid: 28, maxSpeed: 360, accel: 300, hp: 260 },
};

function angleDiff(a, b) {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export class Car {
  constructor(type, x, y, angle) {
    const spec = CAR_TYPES[type];
    this.type = type;
    this.spec = spec;
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.vx = 0;
    this.vy = 0;
    this.steer = 0; // -1..1, smoothed
    this.throttle = 0;
    this.hp = spec.hp;
    this.maxHp = spec.hp;
    this.driver = null; // 'player' | 'traffic' | 'police' | 'thief' | null (parked)
    this.stolen = false;
    this.dead = false;
    this.flash = 0; // police light phase
    this.ramCooldown = 0;
    this.scrapeCooldown = 0; // building-scrape damage ticks at most twice a second
    this.waypoint = null;
    this.wait = 0;
    this.smoke = 0;
  }

  get speed() {
    return Math.hypot(this.vx, this.vy);
  }

  get forwardSpeed() {
    return this.vx * Math.cos(this.angle) + this.vy * Math.sin(this.angle);
  }

  // Drive with throttle (-1..1) and steering (-1..1) for one step.
  drive(dt, throttle, steerTarget) {
    this.throttle = throttle;
    this.steer += (steerTarget - this.steer) * Math.min(1, dt * 8);
    const grip = gripAt(this.x, this.y);
    const fwd = this.forwardSpeed;
    // Steering bites less at very low speed and on ice the car keeps sliding.
    const steerAuthority = Math.min(1, Math.abs(fwd) / 90) * (0.55 + 0.45 * grip);
    this.angle += this.steer * 2.4 * steerAuthority * Math.sign(fwd || 1) * dt;
    const fx = Math.cos(this.angle);
    const fy = Math.sin(this.angle);
    let vf = this.vx * fx + this.vy * fy;
    let vl = -this.vx * fy + this.vy * fx;
    // Engine force along the nose.
    vf += throttle * this.spec.accel * dt;
    // Rolling drag.
    vf *= Math.exp(-0.35 * dt);
    if (throttle === 0) vf *= Math.exp(-0.9 * dt);
    // Lateral grip: asphalt holds the line, ice lets the tail slide.
    const lateralGrip = 2.2 + grip * 5.0;
    vl *= Math.exp(-lateralGrip * dt);
    // Cap top speed.
    const max = this.spec.maxSpeed;
    if (vf > max) vf = max;
    if (vf < -max * 0.45) vf = -max * 0.45;
    this.vx = fx * vf - fy * vl;
    this.vy = fy * vf + fx * vl;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.ramCooldown > 0) this.ramCooldown -= dt;
    if (this.scrapeCooldown > 0) this.scrapeCooldown -= dt;
    if (Math.abs(vl) > 120) this.smoke = Math.min(1, this.smoke + dt * 3);
    else this.smoke = Math.max(0, this.smoke - dt * 2);
    clampToWorld(this, 30);
    if (pushOutOfBuildings(this, this.spec.len / 2)) {
      // Scrape along the wall: kill the velocity into the building.
      this.vx *= 0.4;
      this.vy *= 0.4;
      if (Math.abs(this.forwardSpeed) > 120 && this.scrapeCooldown <= 0) {
        this.hp -= 4;
        this.scrapeCooldown = 0.5;
      }
    }
  }

  // Simple traffic brain: drive along roads toward a waypoint, pick a new one on arrival.
  updateTraffic(dt, rng) {
    if (this.wait > 0) {
      this.wait -= dt;
      this.drive(dt, 0, 0);
      return;
    }
    if (!this.waypoint || Math.hypot(this.waypoint.x - this.x, this.waypoint.y - this.y) < 70) {
      this.waypoint = randomRoadPoint(rng);
    }
    const want = Math.atan2(this.waypoint.y - this.y, this.waypoint.x - this.x);
    const diff = angleDiff(want, this.angle);
    const steer = Math.max(-1, Math.min(1, diff * 2.2));
    const throttle = Math.abs(diff) > 1.4 ? 0.25 : 0.55;
    this.drive(dt, throttle, steer);
  }

  // Police brain: chase the target point, ram it when close.
  updatePolice(dt, tx, ty) {
    const want = Math.atan2(ty - this.y, tx - this.x);
    const diff = angleDiff(want, this.angle);
    const steer = Math.max(-1, Math.min(1, diff * 2.5));
    const dist = Math.hypot(tx - this.x, ty - this.y);
    const throttle = dist < 60 ? 0.4 : 1;
    this.drive(dt, throttle, steer);
    this.flash += dt;
  }

  draw(ctx, night) {
    const s = this.spec;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(-s.len / 2 + 3, -s.wid / 2 + 4, s.len, s.wid);
    // Body.
    ctx.fillStyle = s.color;
    roundRect(ctx, -s.len / 2, -s.wid / 2, s.len, s.wid, 7);
    ctx.fill();
    // Cabin / windshield.
    ctx.fillStyle = '#bfe0f2';
    roundRect(ctx, -s.len / 6, -s.wid / 2 + 4, s.len / 3, s.wid - 8, 4);
    ctx.fill();
    ctx.fillStyle = '#2c3440';
    ctx.fillRect(-s.len / 6 - 2, -s.wid / 2 + 4, 3, s.wid - 8);
    // Wheels.
    ctx.fillStyle = '#14181f';
    const wy = s.wid / 2;
    ctx.fillRect(-s.len / 2 + 6, -wy - 3, 12, 5);
    ctx.fillRect(s.len / 2 - 18, -wy - 3, 12, 5);
    ctx.fillRect(-s.len / 2 + 6, wy - 2, 12, 5);
    ctx.fillRect(s.len / 2 - 18, wy - 2, 12, 5);
    // Snowplow blade.
    if (this.type === 'plow') {
      ctx.fillStyle = '#8d97a5';
      ctx.beginPath();
      ctx.moveTo(s.len / 2, -s.wid / 2 - 4);
      ctx.lineTo(s.len / 2 + 16, -s.wid / 2 - 8);
      ctx.lineTo(s.len / 2 + 16, s.wid / 2 + 8);
      ctx.lineTo(s.len / 2, s.wid / 2 + 4);
      ctx.closePath();
      ctx.fill();
    }
    // Vault truck cargo box.
    if (this.type === 'vault' || this.type === 'truck') {
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(-s.len / 2 + 4, -s.wid / 2 + 3, s.len / 2 - 8, s.wid - 6);
    }
    // Police light bar, flashing red/blue.
    if (this.type === 'police') {
      const phase = Math.floor(this.flash * 4) % 2 === 0;
      ctx.fillStyle = phase ? '#ff2d2d' : '#2d6bff';
      ctx.fillRect(-6, -s.wid / 2 - 2, 12, 5);
      ctx.fillStyle = phase ? '#2d6bff' : '#ff2d2d';
      ctx.fillRect(-6, s.wid / 2 - 3, 12, 5);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('POLISI', 0, 3);
    }
    // Headlights at night.
    if (night) {
      ctx.fillStyle = 'rgba(255,240,170,0.9)';
      ctx.beginPath();
      ctx.arc(s.len / 2, -s.wid / 2 + 5, 3, 0, TAU);
      ctx.arc(s.len / 2, s.wid / 2 - 5, 3, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    // Damage smoke.
    if (this.hp < this.maxHp * 0.4) {
      ctx.fillStyle = 'rgba(90,90,90,0.5)';
      ctx.beginPath();
      ctx.arc(this.x - Math.cos(this.angle) * s.len / 2, this.y - Math.sin(this.angle) * s.len / 2, 6, 0, TAU);
      ctx.fill();
    }
  }
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// A random point on the road grid, used as a traffic waypoint.
export function randomRoadPoint(rng) {
  const horiz = rng() > 0.5;
  if (horiz) {
    const ys = [400, 900, 1400, 1900];
    return { x: 100 + rng() * (WORLD_W - 200), y: ys[Math.floor(rng() * ys.length)] };
  }
  const xs = [500, 1100, 1700, 2300, 2800];
  return { x: xs[Math.floor(rng() * xs.length)], y: 100 + rng() * (WORLD_H - 200) };
}

// Circle collision between two cars; returns the impact speed.
export function collideCars(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  const min = (a.spec.len + b.spec.len) / 2 - 8;
  if (dist >= min || dist === 0) return 0;
  const nx = dx / dist;
  const ny = dy / dist;
  const overlap = min - dist;
  a.x -= nx * overlap / 2;
  a.y -= ny * overlap / 2;
  b.x += nx * overlap / 2;
  b.y += ny * overlap / 2;
  const relVx = b.vx - a.vx;
  const relVy = b.vy - a.vy;
  const impact = Math.abs(relVx * nx + relVy * ny);
  // Exchange a bit of velocity along the normal.
  const push = (relVx * nx + relVy * ny) * 0.5;
  a.vx += nx * push;
  a.vy += ny * push;
  b.vx -= nx * push;
  b.vy -= ny * push;
  return impact;
}

export { isOnRoad };
