// people.js — pedestrians, foot police, simple combat and pickups.
// Peds wander the snowy sidewalks, flee gunfire, and cops on foot chase the player.

import { WORLD_W, WORLD_H, pushOutOfBuildings, clampToWorld } from './world.js';
import { randomRoadPoint } from './vehicles.js';

const TAU = Math.PI * 2;

const COATS = ['#c94f4f', '#3f6fb8', '#4f8a4f', '#c9a13f', '#8a4fb8', '#3fb8a8', '#e07a3f'];

export class Ped {
  constructor(x, y, isCop, rng) {
    this.x = x;
    this.y = y;
    this.angle = rng() * TAU;
    this.speed = isCop ? 150 : 55 + rng() * 40;
    this.isCop = isCop;
    this.hp = isCop ? 60 : 40;
    this.maxHp = this.hp;
    this.state = 'walk'; // walk | flee | chase | down
    this.target = null;
    this.coat = isCop ? '#20242c' : COATS[Math.floor(rng() * COATS.length)];
    this.punchCooldown = 0;
    this.bustedTimer = 0;
    this.scared = 0;
    this.rng = rng;
  }

  update(dt, game) {
    if (this.state === 'down') return;
    if (this.punchCooldown > 0) this.punchCooldown -= dt;
    if (this.scared > 0) this.scared -= dt;
    const p = game.player;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const dist = Math.hypot(dx, dy);

    if (this.isCop) {
      // Foot police chase the player on foot when wanted, and grab them.
      if (game.wanted >= 2 && !p.inCar && game.state === 'play') {
        this.state = 'chase';
        const want = Math.atan2(dy, dx);
        this.angle = want;
        this.x += Math.cos(want) * this.speed * dt;
        this.y += Math.sin(want) * this.speed * dt;
        if (dist < 30) {
          this.bustedTimer += dt;
          if (this.punchCooldown <= 0) {
            this.punchCooldown = 0.9;
            game.damagePlayer(8, 'cop');
          }
        } else {
          this.bustedTimer = Math.max(0, this.bustedTimer - dt);
        }
        if (this.bustedTimer > 1.4) game.busted();
      } else {
        this.state = 'walk';
        this.wander(dt);
      }
    } else if (this.scared > 0 || (game.gunfireAt && Math.hypot(game.gunfireAt.x - this.x, game.gunfireAt.y - this.y) < 260)) {
      // Flee from the last gunshot.
      this.state = 'flee';
      const threat = game.gunfireAt || p;
      const away = Math.atan2(this.y - threat.y, this.x - threat.x);
      this.angle = away;
      this.x += Math.cos(away) * this.speed * 2.2 * dt;
      this.y += Math.sin(away) * this.speed * 2.2 * dt;
    } else {
      this.state = 'walk';
      this.wander(dt);
    }
    clampToWorld(this, 20);
    pushOutOfBuildings(this, 12);
  }

  wander(dt) {
    if (!this.target || Math.hypot(this.target.x - this.x, this.target.y - this.y) < 40) {
      this.target = randomRoadPoint(this.rng);
    }
    const want = Math.atan2(this.target.y - this.y, this.target.x - this.x);
    let diff = want - this.angle;
    while (diff > Math.PI) diff -= TAU;
    while (diff < -Math.PI) diff += TAU;
    this.angle += Math.max(-2.5 * dt, Math.min(2.5 * dt, diff));
    this.x += Math.cos(this.angle) * this.speed * dt;
    this.y += Math.sin(this.angle) * this.speed * dt;
  }

  // A punch from the player: knockback, damage, and a witness calls the police.
  takePunch(fromX, fromY, game) {
    this.hp -= 25;
    const away = Math.atan2(this.y - fromY, this.x - fromX);
    this.x += Math.cos(away) * 26;
    this.y += Math.sin(away) * 26;
    this.scared = 4;
    if (this.hp <= 0) {
      this.state = 'down';
      game.notify(this.isCop ? 'Polisi tumbang! Bintang naik.' : 'Pejalan kaki tumbang!');
    }
    game.raiseWanted(1);
  }

  takeShot(fromX, fromY, game) {
    this.hp -= 34;
    this.scared = 5;
    if (this.hp <= 0) {
      this.state = 'down';
      game.notify(this.isCop ? 'Polisi tertembak!' : 'Pejalan kaki tertembak!');
    }
    game.raiseWanted(1);
  }

  draw(ctx) {
    if (this.state === 'down') {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(this.x, this.y, 14, 8, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = this.coat;
      ctx.beginPath();
      ctx.ellipse(this.x, this.y, 12, 7, this.angle, 0, TAU);
      ctx.fill();
      return;
    }
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + 10, 9, 4, 0, 0, TAU);
    ctx.fill();
    // Body: winter coat.
    ctx.fillStyle = this.coat;
    ctx.beginPath();
    ctx.arc(this.x, this.y, 10, 0, TAU);
    ctx.fill();
    // Head with a warm hat.
    ctx.fillStyle = '#e8c39a';
    ctx.beginPath();
    ctx.arc(this.x, this.y - 2, 6, 0, TAU);
    ctx.fill();
    ctx.fillStyle = this.isCop ? '#1c4fd6' : '#d23c3c';
    ctx.fillRect(this.x - 6, this.y - 9, 12, 5);
    // Facing tick.
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.x + Math.cos(this.angle) * 13, this.y + Math.sin(this.angle) * 13);
    ctx.stroke();
    if (this.isCop) {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('POL', this.x, this.y + 4);
    }
  }
}

// ---- pickups ---------------------------------------------------------------

export class Pickup {
  constructor(type, x, y) {
    this.type = type; // 'gun' | 'health' | 'ammo'
    this.x = x;
    this.y = y;
    this.taken = false;
    this.respawnAt = 0;
    this.bob = 0;
  }

  update(dt, game) {
    this.bob += dt;
    if (this.taken && game.time > this.respawnAt) this.taken = false;
    if (this.taken) return;
    const p = game.player;
    if (Math.hypot(p.x - this.x, p.y - this.y) < 34) {
      this.taken = true;
      this.respawnAt = game.time + 60;
      if (this.type === 'gun') {
        game.player.hasGun = true;
        game.player.ammo += 24;
        game.notify('Pistol didapat! Klik mouse atau tekan J untuk menembak.');
        game.sound.pickup();
      } else if (this.type === 'health') {
        game.player.hp = Math.min(game.player.maxHp, game.player.hp + 50);
        game.notify('Kesehatan +50.');
        game.sound.pickup();
      } else {
        game.player.ammo += 18;
        game.notify('Amunisi +18.');
        game.sound.pickup();
      }
    }
  }

  draw(ctx) {
    if (this.taken) return;
    const bobY = Math.sin(this.bob * 3) * 3;
    ctx.fillStyle = 'rgba(255,215,80,0.9)';
    ctx.beginPath();
    ctx.arc(this.x, this.y + bobY, 13, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#20242c';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    const label = this.type === 'gun' ? 'P' : this.type === 'health' ? '+' : 'A';
    ctx.fillText(label, this.x, this.y + bobY + 5);
  }
}

// ---- combat helpers --------------------------------------------------------

// The player's punch: hits the nearest living ped in front of them.
export function playerPunch(game) {
  const p = game.player;
  if (p.punchCooldown > 0 || p.inCar) return;
  p.punchCooldown = 0.45;
  p.punchAnim = 0.25;
  game.sound.punch();
  let best = null;
  let bestD = 52;
  for (const ped of game.peds) {
    if (ped.state === 'down') continue;
    const d = Math.hypot(ped.x - p.x, ped.y - p.y);
    if (d < bestD) { best = ped; bestD = d; }
  }
  if (best) best.takePunch(p.x, p.y, game);
  // A punch can also dent a nearby car.
  for (const car of game.cars) {
    if (car.driver === 'player') continue;
    if (Math.hypot(car.x - p.x, car.y - p.y) < 46) {
      car.hp -= 6;
      game.notify('Mobil dipukul!');
    }
  }
}

// The player's shot: hitscan toward the aim point, limited ammo.
export function playerShoot(game, aimX, aimY) {
  const p = game.player;
  if (!p.hasGun || p.ammo <= 0 || p.inCar || p.shootCooldown > 0) return;
  p.ammo -= 1;
  p.shootCooldown = 0.35;
  game.sound.shot();
  game.gunfireAt = { x: p.x, y: p.y };
  game.muzzle = { x: p.x, y: p.y, tx: aimX, ty: aimY, t: 0.12 };
  const aimAngle = Math.atan2(aimY - p.y, aimX - p.x);
  let best = null;
  let bestScore = Infinity;
  for (const ped of game.peds) {
    if (ped.state === 'down') continue;
    const d = Math.hypot(ped.x - p.x, ped.y - p.y);
    if (d > 460) continue;
    const a = Math.atan2(ped.y - p.y, ped.x - p.x);
    let diff = Math.abs(a - aimAngle);
    if (diff > Math.PI) diff = TAU - diff;
    const score = d + diff * 300;
    if (diff < 0.35 && score < bestScore) { best = ped; bestScore = score; }
  }
  if (best) {
    best.takeShot(p.x, p.y, game);
    game.sparks.push({ x: best.x, y: best.y, t: 0.3 });
    return;
  }
  // Otherwise the shot may hit a car.
  for (const car of game.cars) {
    if (car.driver === 'player') continue;
    const d = Math.hypot(car.x - p.x, car.y - p.y);
    if (d > 460) continue;
    const a = Math.atan2(car.y - p.y, car.x - p.x);
    let diff = Math.abs(a - aimAngle);
    if (diff > Math.PI) diff = TAU - diff;
    if (diff < 0.3) {
      car.hp -= 20;
      game.sparks.push({ x: car.x, y: car.y, t: 0.3 });
      if (car.hp <= 0 && !car.dead) {
        car.dead = true;
        game.notify('Mobil itu hancur!');
        game.raiseWanted(1);
      }
      return;
    }
  }
}
