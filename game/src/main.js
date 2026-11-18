// main.js — Frostpeak Drift: game loop, input, camera, wanted level, saving.
// The whole game state lives in one object so the HUD, missions and tests all
// read the same truth.

import { WORLD_W, WORLD_H, PLACES, drawWorld, isOnRoad, pushOutOfBuildings, clampToWorld } from './world.js';
import { Car, collideCars, randomRoadPoint } from './vehicles.js';
import { Ped, Pickup, playerPunch, playerShoot } from './people.js';
import { MissionManager } from './missions.js';
import { SoundEngine } from './audio.js';
import { drawHUD, drawTitle, drawPause, drawBusted, drawWasted, drawEnding, drawWorldMarker } from './hud.js';

const TAU = Math.PI * 2;
const SAVE_KEY = 'frostpeak-save-v1';

function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Game {
  constructor() {
    this.viewW = 1280;
    this.viewH = 720;
    this.state = 'title'; // title | play | pause | busted | wasted | ending
    this.time = 0;
    this.hour = 9; // 09:00 on a snowy morning
    this.night = false;
    this.rng = makeRng(20261119);
    this.sound = new SoundEngine();
    this.missions = new MissionManager();
    this.wanted = 0;
    this.crimeTimer = 0;
    this.wantedDecay = 0;
    this.notifs = [];
    this.dialog = null;
    this.gunfireAt = null;
    this.muzzle = null;
    this.sparks = [];
    this.smokePuffs = [];
    this.flakes = [];
    this.cam = { x: 0, y: 0, w: 1280, h: 720 };
    this.keys = {};
    this.mouse = { x: 640, y: 360, down: false };
    this.hasSave = false;
    this.policeTimer = 0;
    this.trafficTimer = 0;

    this.player = {
      x: PLACES.depot.x, y: PLACES.depot.y + 60, angle: 0,
      hp: 100, maxHp: 100, money: 50,
      inCar: false, car: null,
      hasGun: false, ammo: 0,
      punchCooldown: 0, shootCooldown: 0, punchAnim: 0,
      hurtCooldown: 0, // brief immunity after being hit by a car
      walkSpeed: 210,
    };

    this.cars = [];
    this.peds = [];
    this.pickups = [];
    this.initWorld();
    this.initFlakes();
    this.loadSaveMeta();
  }

  initWorld() {
    // The hero's snowplow, parked by the depot on the main street.
    const plow = new Car('plow', 430, 400, 0);
    this.cars.push(plow);
    this.plow = plow;
    // Parked cars around town, free for the taking.
    const parked = [
      ['sedan', 620, 400, 0], ['hatch', 1700, 1460, Math.PI], ['van', 2300, 960, 0],
      ['truck', 500, 1960, Math.PI / 2], ['sedan', 2800, 900, -Math.PI / 2],
    ];
    for (const [type, x, y, a] of parked) this.cars.push(new Car(type, x, y, a));
    // Traffic.
    for (let i = 0; i < 9; i++) {
      const pt = randomRoadPoint(this.rng);
      const types = ['sedan', 'hatch', 'van', 'sedan', 'truck'];
      const car = new Car(types[i % types.length], pt.x, pt.y, this.rng() * TAU);
      car.driver = 'traffic';
      this.cars.push(car);
    }
    // Pedestrians.
    for (let i = 0; i < 14; i++) {
      const pt = randomRoadPoint(this.rng);
      this.peds.push(new Ped(pt.x, pt.y, false, this.rng));
    }
    // Pickups.
    this.pickups.push(new Pickup('gun', PLACES.gunShop.x, PLACES.gunShop.y));
    this.pickups.push(new Pickup('health', PLACES.clinic.x + 60, PLACES.clinic.y + 40));
    this.pickups.push(new Pickup('ammo', PLACES.depot.x + 80, PLACES.depot.y + 60));
  }

  initFlakes() {
    for (let i = 0; i < 180; i++) {
      this.flakes.push({
        x: this.rng() * this.viewW, y: this.rng() * this.viewH,
        s: 1 + this.rng() * 2.5, v: 30 + this.rng() * 50, drift: this.rng() * 20 - 10,
      });
    }
  }

  // ---- save / load ---------------------------------------------------------

  save() {
    try {
      const data = {
        money: this.player.money,
        missionIndex: this.missions.index,
        x: this.player.x, y: this.player.y,
        hp: this.player.hp,
        hasGun: this.player.hasGun, ammo: this.player.ammo,
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      this.hasSave = true;
    } catch (e) { /* storage unavailable: the game still plays */ }
  }

  loadSaveMeta() {
    try {
      this.hasSave = !!localStorage.getItem(SAVE_KEY);
    } catch (e) { this.hasSave = false; }
  }

  loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const d = JSON.parse(raw);
      this.player.money = d.money ?? 50;
      this.missions.index = Math.min(d.missionIndex ?? 0, 6);
      this.player.x = d.x ?? PLACES.depot.x;
      this.player.y = d.y ?? PLACES.depot.y + 60;
      this.player.hp = d.hp ?? 100;
      this.player.hasGun = !!d.hasGun;
      this.player.ammo = d.ammo ?? 0;
      return true;
    } catch (e) { return false; }
  }

  // ---- helpers the other modules call --------------------------------------

  notify(text) {
    this.notifs.push({ text, t: 4 });
    if (this.notifs.length > 4) this.notifs.shift();
  }

  showDialog(name, text) {
    this.dialog = { name, text, t: 7 };
  }

  raiseWanted(n) {
    if (this.crimeTimer > 0) return;
    this.crimeTimer = 3;
    this.wanted = Math.min(5, this.wanted + n);
    if (this.wanted > 0) this.notify(`Bintang naik: ${this.wanted} — polisi mengejarmu!`);
  }

  setWanted(n) {
    this.wanted = Math.max(0, Math.min(5, n));
  }

  setNight(on) {
    this.night = on;
    this.hour = on ? 23 : 9;
  }

  damagePlayer(amount, source) {
    if (this.state !== 'play') return;
    this.player.hp -= amount;
    if (this.player.hp <= 0) {
      this.player.hp = 0;
      this.wasted();
    }
  }

  spawnCar(type, x, y, angle, driver) {
    const car = new Car(type, x, y, angle);
    car.driver = driver;
    this.cars.push(car);
    return car;
  }

  removeCar(car) {
    const i = this.cars.indexOf(car);
    if (i >= 0) this.cars.splice(i, 1);
  }

  objectiveText() {
    if (this.missions.done) return 'Kota bebas — jelajahi Frostpeak sesukamu!';
    const m = this.missions.current;
    if (this.missions.active) {
      const step = this.missions.currentStep();
      return step ? `Misi ${m.id} — ${m.title}: ${step.text}` : '';
    }
    return 'Pergi ke penanda ! kuning untuk memulai misi berikutnya.';
  }

  markerPos() {
    if (this.missions.done) return null;
    if (this.missions.active) {
      const step = this.missions.currentStep();
      if (!step) return null;
      if (step.type === 'enterPlow') return { x: this.plow.x, y: this.plow.y };
      if (step.type === 'enterVault' && this.missions.vaultCar) {
        return { x: this.missions.vaultCar.x, y: this.missions.vaultCar.y };
      }
      if (step.type === 'ram' && this.missions.thiefCar) {
        return { x: this.missions.thiefCar.x, y: this.missions.thiefCar.y };
      }
      if (step.x !== undefined) return { x: step.x, y: step.y };
      return null;
    }
    return this.missions.startMarker();
  }

  // ---- police & traffic upkeep ---------------------------------------------

  updatePolice(dt) {
    this.policeTimer -= dt;
    if (this.policeTimer > 0) return;
    this.policeTimer = 2;
    const p = this.player;
    const policeCars = this.cars.filter((c) => c.type === 'police' && !c.dead);
    const wantCars = Math.min(this.wanted, 4);
    if (policeCars.length < wantCars) {
      // Spawn a patrol car on a road 500–900 px away from the player.
      for (let tries = 0; tries < 12; tries++) {
        const pt = randomRoadPoint(this.rng);
        const d = Math.hypot(pt.x - p.x, pt.y - p.y);
        if (d > 500 && d < 1000) {
          const car = this.spawnCar('police', pt.x, pt.y, 0, 'police');
          car.flash = this.rng();
          break;
        }
      }
    }
    const cops = this.peds.filter((pd) => pd.isCop && pd.state !== 'down');
    const wantCops = this.wanted >= 2 ? Math.min(this.wanted - 1, 3) : 0;
    if (cops.length < wantCops) {
      const ang = this.rng() * TAU;
      this.peds.push(new Ped(p.x + Math.cos(ang) * 260, p.y + Math.sin(ang) * 260, true, this.rng));
    }
    // Wanted slowly fades when the player lies low.
    if (this.wanted > 0) {
      const nearCop = policeCars.some((c) => Math.hypot(c.x - p.x, c.y - p.y) < 350)
        || cops.some((c) => Math.hypot(c.x - p.x, c.y - p.y) < 300);
      if (!nearCop && this.crimeTimer <= 0) {
        this.wantedDecay += 2;
        if (this.wantedDecay >= 25) {
          this.wantedDecay = 0;
          this.wanted--;
          if (this.wanted === 0) this.notify('Polisi kehilangan jejakmu.');
        }
      } else {
        this.wantedDecay = 0;
      }
    }
    // Despawn far-away police cars once the heat is off.
    if (this.wanted === 0) {
      for (const c of [...policeCars]) {
        if (Math.hypot(c.x - p.x, c.y - p.y) > 1200) this.removeCar(c);
      }
    }
  }

  updateTraffic(dt) {
    this.trafficTimer -= dt;
    if (this.trafficTimer > 0) return;
    this.trafficTimer = 3;
    const traffic = this.cars.filter((c) => c.driver === 'traffic' && !c.dead);
    if (traffic.length < 8) {
      for (let tries = 0; tries < 8; tries++) {
        const pt = randomRoadPoint(this.rng);
        if (Math.hypot(pt.x - this.player.x, pt.y - this.player.y) > 700) {
          const types = ['sedan', 'hatch', 'van'];
          const car = this.spawnCar(types[Math.floor(this.rng() * types.length)], pt.x, pt.y, this.rng() * TAU, 'traffic');
          break;
        }
      }
    }
  }

  // ---- entering / leaving cars ----------------------------------------------

  nearestCar(maxDist) {
    const p = this.player;
    let best = null;
    let bestD = maxDist;
    for (const car of this.cars) {
      if (car.dead) continue;
      if (car === p.car) continue; // the car the player already sits in
      const d = Math.hypot(car.x - p.x, car.y - p.y);
      if (d < bestD) { best = car; bestD = d; }
    }
    return best;
  }

  enterCar(car) {
    const p = this.player;
    // Leaving one car for another: free the old car first.
    if (p.inCar && p.car && p.car !== car) p.car.driver = null;
    if (car.driver === 'traffic' || car.driver === 'thief') {
      // Steal it: the driver is thrown out as a pedestrian.
      const driver = new Ped(car.x + 40, car.y, false, this.rng);
      driver.scared = 5;
      this.peds.push(driver);
      car.stolen = true;
      this.raiseWanted(1);
      this.notify(`Mobil dicuri! Itu ${car.spec.name}.`);
      this.sound.horn();
    }
    car.driver = 'player';
    p.inCar = true;
    p.car = car;
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
  }

  exitCar() {
    const p = this.player;
    if (!p.inCar || !p.car) return;
    const car = p.car;
    car.driver = null;
    car.throttle = 0;
    p.inCar = false;
    p.car = null;
    p.x = car.x - Math.cos(car.angle) * 40;
    p.y = car.y - Math.sin(car.angle) * 40;
    p.angle = car.angle;
    pushOutOfBuildings(p, 12);
  }

  // ---- busted / wasted / ending --------------------------------------------

  busted() {
    if (this.state !== 'play') return;
    this.state = 'busted';
    this.setWanted(0);
    this.player.money = Math.max(0, this.player.money - 100);
    this.sound.busted();
    if (this.player.inCar) this.exitCar();
    this.missions.active = false;
    this.missions.cleanup(this);
    this.save();
  }

  wasted() {
    if (this.state !== 'play') return;
    this.state = 'wasted';
    this.setWanted(0);
    this.player.money = Math.floor(this.player.money * 0.9);
    this.sound.busted();
    if (this.player.inCar) this.exitCar();
    this.missions.active = false;
    this.missions.cleanup(this);
    this.save();
  }

  respawn() {
    this.player.x = PLACES.clinic.x;
    this.player.y = PLACES.clinic.y + 60;
    this.player.hp = this.player.maxHp;
    this.player.angle = 0;
    this.state = 'play';
    this.notify('Kamu bangkit di Klinik Salju.');
  }

  finishStory() {
    this.state = 'ending';
    this.setWanted(0);
    this.save();
  }

  // ---- per-frame update ------------------------------------------------------

  update(dt) {
    this.time += dt;
    this.hour += dt * (24 / 600); // a full day lasts 10 minutes
    if (this.hour >= 24) this.hour -= 24;
    this.night = this.hour >= 20 || this.hour < 6;
    if (this.crimeTimer > 0) this.crimeTimer -= dt;
    if (this.dialog && this.dialog.t > 0) this.dialog.t -= dt;
    for (const n of this.notifs) n.t -= dt;
    this.notifs = this.notifs.filter((n) => n.t > 0);
    if (this.muzzle) {
      this.muzzle.t -= dt;
      if (this.muzzle.t <= 0) this.muzzle = null;
    }
    for (const s of this.sparks) s.t -= dt;
    this.sparks = this.sparks.filter((s) => s.t > 0);
    for (const s of this.smokePuffs) { s.t -= dt; s.x += s.vx * dt; s.y += s.vy * dt; }
    this.smokePuffs = this.smokePuffs.filter((s) => s.t > 0);
    if (this.gunfireAt) this.gunfireAt = null;

    const p = this.player;
    if (p.punchCooldown > 0) p.punchCooldown -= dt;
    if (p.shootCooldown > 0) p.shootCooldown -= dt;
    if (p.punchAnim > 0) p.punchAnim -= dt;
    if (p.hurtCooldown > 0) p.hurtCooldown -= dt;

    // --- player movement ---
    const k = this.keys;
    if (p.inCar && p.car) {
      const throttle = (k['KeyW'] || k['ArrowUp'] ? 1 : 0) + (k['KeyS'] || k['ArrowDown'] ? -0.7 : 0);
      const steer = (k['KeyA'] || k['ArrowLeft'] ? -1 : 0) + (k['KeyD'] || k['ArrowRight'] ? 1 : 0);
      p.car.drive(dt, throttle, steer);
      p.x = p.car.x;
      p.y = p.car.y;
      p.angle = p.car.angle;
      if (p.car.smoke > 0.3 && Math.random() < 0.5) {
        this.smokePuffs.push({
          x: p.car.x - Math.cos(p.car.angle) * 20, y: p.car.y - Math.sin(p.car.angle) * 20,
          vx: -p.car.vx * 0.1, vy: -p.car.vy * 0.1, t: 0.7,
        });
      }
      this.sound.update(dt, p.car.speed, this.wanted);
    } else {
      const mx = (k['KeyD'] || k['ArrowRight'] ? 1 : 0) - (k['KeyA'] || k['ArrowLeft'] ? 1 : 0);
      const my = (k['KeyS'] || k['ArrowDown'] ? 1 : 0) - (k['KeyW'] || k['ArrowUp'] ? 1 : 0);
      if (mx !== 0 || my !== 0) {
        const len = Math.hypot(mx, my);
        p.angle = Math.atan2(my / len, mx / len);
        const speed = p.walkSpeed * (isOnRoad(p.x, p.y) ? 1 : 0.75);
        p.x += (mx / len) * speed * dt;
        p.y += (my / len) * speed * dt;
        clampToWorld(p, 20);
        pushOutOfBuildings(p, 12);
      }
      this.sound.update(dt, 0, this.wanted);
    }

    // --- cars ---
    for (const car of this.cars) {
      if (car.dead) continue;
      if (car.driver === 'traffic') car.updateTraffic(dt, this.rng);
      else if (car.driver === 'police') {
        car.updatePolice(dt, p.x, p.y);
      } else if (car.driver === 'thief') {
        // The thief is driven by the mission manager.
      } else if (car.driver !== 'player') {
        car.drive(dt, 0, 0); // parked: just settle
      }
    }
    // Car-vs-car collisions.
    for (let i = 0; i < this.cars.length; i++) {
      for (let j = i + 1; j < this.cars.length; j++) {
        const a = this.cars[i];
        const b = this.cars[j];
        if (a.dead || b.dead) continue;
        const impact = collideCars(a, b);
        if (impact > 60) {
          if (impact > 160) {
            a.hp -= impact / 12;
            b.hp -= impact / 12;
            this.sound.punch();
          }
          // Ramming the thief's car counts toward mission 3. A ram counts on a
          // hard hit, or when the player is simply shoving the thief at speed
          // (a chase at matching speed barely registers as an impact).
          const thief = this.missions.thiefCar;
          if (thief && (a === thief || b === thief)) {
            const other = a === thief ? b : a;
            if (other.driver === 'player' && thief.ramCooldown <= 0 && (impact > 90 || other.speed > 140)) {
              thief.ramCooldown = 1;
              this.missions.ramCount++;
              this.notify(`Tabrakan! (${this.missions.ramCount}/3)`);
              this.sound.horn();
            }
          }
          // Crash damage to the driver, at most once per half second.
          if (a.driver === 'player' && impact > 260 && p.hurtCooldown <= 0) {
            this.damagePlayer(impact / 45, 'crash');
            p.hurtCooldown = 0.6;
          }
          if (b.driver === 'player' && impact > 260 && p.hurtCooldown <= 0) {
            this.damagePlayer(impact / 45, 'crash');
            p.hurtCooldown = 0.6;
          }
          if (a.hp <= 0) this.wreckCar(a);
          if (b.hp <= 0) this.wreckCar(b);
        }
      }
    }
    // Cars hitting the player on foot.
    if (!p.inCar) {
      for (const car of this.cars) {
        if (car.dead || car.driver === 'player') continue;
        if (Math.hypot(car.x - p.x, car.y - p.y) < 30 && car.speed > 90 && p.hurtCooldown <= 0) {
          this.damagePlayer(14, 'hit');
          p.hurtCooldown = 1;
          p.x += (p.x - car.x) * 0.6;
          p.y += (p.y - car.y) * 0.6;
        }
      }
    }
    // Player's car running over pedestrians.
    if (p.inCar && p.car) {
      for (const ped of this.peds) {
        if (ped.state === 'down') continue;
        if (Math.hypot(ped.x - p.car.x, ped.y - p.car.y) < 26 && p.car.speed > 60) {
          ped.hp = 0;
          ped.state = 'down';
          this.raiseWanted(1);
          this.notify('Kamu menabrak pejalan kaki!');
        }
      }
    }

    // --- pedestrians & pickups ---
    for (const ped of this.peds) ped.update(dt, this);
    this.peds = this.peds.filter((pd) => !(pd.state === 'down' && pd.hp <= -50));
    for (const pk of this.pickups) pk.update(dt, this);

    // --- missions ---
    this.missions.update(this, dt);
    // Start a mission by walking onto its marker.
    if (!this.missions.active && !this.missions.done) {
      const marker = this.missions.startMarker();
      if (marker && Math.hypot(p.x - marker.x, p.y - marker.y) < 70) {
        this.missions.start(this);
      }
    }

    this.updatePolice(dt);
    this.updateTraffic(dt);

    // --- camera follows the player ---
    this.cam.x = Math.max(0, Math.min(WORLD_W - this.viewW, p.x - this.viewW / 2));
    this.cam.y = Math.max(0, Math.min(WORLD_H - this.viewH, p.y - this.viewH / 2));

    // --- snowfall ---
    for (const f of this.flakes) {
      f.y += f.v * dt;
      f.x += f.drift * dt + Math.sin(this.time + f.s) * 8 * dt;
      if (f.y > this.viewH) { f.y = -4; f.x = this.rng() * this.viewW; }
      if (f.x > this.viewW) f.x = 0;
      if (f.x < 0) f.x = this.viewW;
    }
    // Autosave every 20 seconds of play.
    if (Math.floor(this.time) % 20 === 0 && Math.floor((this.time - dt)) % 20 !== 0) this.save();
  }

  wreckCar(car) {
    car.dead = true;
    car.driver = null;
    car.vx = 0;
    car.vy = 0;
    this.sparks.push({ x: car.x, y: car.y, t: 0.5 });
    if (car === this.player.car) {
      this.player.inCar = false;
      this.player.car = null;
      this.player.x = car.x + 50;
      this.player.y = car.y;
      this.notify('Mobilmu hancur!');
    }
  }

  // ---- drawing --------------------------------------------------------------

  draw(ctx) {
    ctx.clearRect(0, 0, this.viewW, this.viewH);
    ctx.save();
    ctx.translate(-Math.round(this.cam.x), -Math.round(this.cam.y));
    drawWorld(ctx, this.cam, this.time);
    drawWorldMarker(ctx, this);
    for (const pk of this.pickups) pk.draw(ctx);
    for (const car of this.cars) car.draw(ctx, this.night);
    for (const ped of this.peds) ped.draw(ctx);
    this.drawPlayer(ctx);
    // Muzzle flash line.
    if (this.muzzle) {
      ctx.strokeStyle = 'rgba(255,220,120,0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(this.muzzle.x, this.muzzle.y);
      ctx.lineTo(this.muzzle.tx, this.muzzle.ty);
      ctx.stroke();
    }
    // Sparks and smoke.
    for (const s of this.sparks) {
      ctx.fillStyle = `rgba(255,200,60,${Math.max(0, s.t * 2)})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 8, 0, TAU);
      ctx.fill();
    }
    for (const s of this.smokePuffs) {
      ctx.fillStyle = `rgba(200,200,210,${Math.max(0, s.t * 0.5)})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 10 + (0.7 - s.t) * 14, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    // Night darkens the town.
    if (this.night) {
      ctx.fillStyle = 'rgba(10,18,44,0.42)';
      ctx.fillRect(0, 0, this.viewW, this.viewH);
    }
    // Falling snow on top of everything.
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (const f of this.flakes) {
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.s, 0, TAU);
      ctx.fill();
    }

    if (this.state === 'title') drawTitle(ctx, this);
    else if (this.state === 'pause') drawPause(ctx, this);
    else if (this.state === 'busted') drawBusted(ctx, this);
    else if (this.state === 'wasted') drawWasted(ctx, this);
    else if (this.state === 'ending') drawEnding(ctx, this);
    else drawHUD(ctx, this);
  }

  drawPlayer(ctx) {
    const p = this.player;
    if (p.inCar) return;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 11, 10, 4, 0, 0, TAU);
    ctx.fill();
    // Raka: orange snowplow-driver jacket.
    ctx.fillStyle = '#e8722a';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 11, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#e8c39a';
    ctx.beginPath();
    ctx.arc(p.x, p.y - 2, 6.5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#20242c';
    ctx.fillRect(p.x - 7, p.y - 10, 14, 5);
    // Facing tick, or a punch swing.
    const reach = p.punchAnim > 0 ? 26 : 14;
    ctx.strokeStyle = '#20242c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + Math.cos(p.angle) * reach, p.y + Math.sin(p.angle) * reach);
    ctx.stroke();
    // Gun in hand.
    if (p.hasGun) {
      ctx.fillStyle = '#20242c';
      ctx.fillRect(p.x + Math.cos(p.angle) * 10 - 3, p.y + Math.sin(p.angle) * 10 - 2, 9, 4);
    }
    // Passenger: the rescued skier walks beside Raka.
    if (this.missions.passenger && !p.inCar) {
      ctx.fillStyle = '#3f6fb8';
      ctx.beginPath();
      ctx.arc(p.x + 22, p.y + 14, 9, 0, TAU);
      ctx.fill();
    }
  }
}

// ---- boot ------------------------------------------------------------------

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const game = new Game();

function mouseWorld() {
  const rect = canvas.getBoundingClientRect();
  const scaleX = game.viewW / rect.width;
  const scaleY = game.viewH / rect.height;
  return {
    x: game.cam.x + (game.mouse.x - rect.left) * scaleX,
    y: game.cam.y + (game.mouse.y - rect.top) * scaleY,
  };
}

function startGame(fromSave) {
  game.sound.ensure();
  if (fromSave && game.loadSave()) game.notify('Save dimuat — lanjutkan petualanganmu.');
  game.state = 'play';
}

window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  game.sound.ensure();
  if (e.repeat) return;
  game.keys[e.code] = true;
  if (game.state === 'title') {
    if (e.code === 'Enter') startGame(false);
    else if (e.code === 'KeyL') startGame(true);
    return;
  }
  if (e.code === 'KeyP' && (game.state === 'play' || game.state === 'pause')) {
    game.state = game.state === 'play' ? 'pause' : 'play';
    return;
  }
  if (game.state === 'busted' || game.state === 'wasted') {
    if (e.code === 'Enter') game.respawn();
    return;
  }
  if (game.state === 'ending') {
    if (e.code === 'Enter') game.state = 'play';
    return;
  }
  if (game.state === 'pause') {
    if (e.code === 'KeyR') { game.loadSave(); game.state = 'play'; }
    return;
  }
  if (game.state !== 'play') return;
  if (e.code === 'KeyE') {
    if (game.player.inCar) game.exitCar();
    else {
      const car = game.nearestCar(64);
      if (car) game.enterCar(car);
    }
  } else if (e.code === 'KeyF') {
    playerPunch(game);
  } else if (e.code === 'KeyJ') {
    const w = mouseWorld();
    playerShoot(game, w.x, w.y);
  } else if (e.code === 'KeyM') {
    const muted = game.sound.toggleMute();
    game.notify(muted ? 'Suara mati.' : 'Suara hidup.');
  } else if (e.code === 'KeyH') {
    game.sound.horn();
  }
});

window.addEventListener('keyup', (e) => {
  game.keys[e.code] = false;
});

canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  game.mouse.x = e.clientX - rect.left;
  game.mouse.y = e.clientY - rect.top;
});

canvas.addEventListener('mousedown', (e) => {
  game.sound.ensure();
  const rect = canvas.getBoundingClientRect();
  game.mouse.x = e.clientX - rect.left;
  game.mouse.y = e.clientY - rect.top;
  if (game.state === 'title') { startGame(false); return; }
  if (game.state !== 'play') return;
  const w = mouseWorld();
  playerShoot(game, w.x, w.y);
});

// ---- screenshot scenes (?scene=city|chase|mission|night&autostart=1) -------
function applyScene() {
  const params = new URLSearchParams(location.search);
  const scene = params.get('scene');
  const autostart = params.get('autostart') === '1';
  if (params.get('fresh') === '1') {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
  }
  if (!scene && !autostart) return;
  game.state = 'play';
  const p = game.player;
  if (scene === 'city') {
    // Raka in his snowplow on the main street, mission 1 under way.
    game.enterCar(game.plow);
    p.car.x = 1000;
    p.car.y = 400;
    p.car.angle = 0;
    p.x = 1000;
    p.y = 400;
    game.missions.index = 0;
    game.missions.active = true;
    game.missions.step = 1;
    game.missions.timeLeft = 0;
    game.showDialog('Raka', 'Salju menumpuk di jalan utama. Bersihkan tiga simpang sebelum warga terjebak!');
    game.cam.x = Math.max(0, p.x - 640);
    game.cam.y = Math.max(0, p.y - 360);
  } else if (scene === 'chase') {
    // Wanted 3, patrol cars closing in on the main street.
    const sedan = game.nearestCar(100000);
    game.enterCar(game.cars.find((c) => c.type === 'sedan' && !c.dead));
    p.car.x = 1700;
    p.car.y = 1400;
    p.car.angle = 0;
    p.car.vx = 230; // fleeing east, so the chase is already moving
    p.car.vy = 0;
    p.x = 1700;
    p.y = 1400;
    game.setWanted(3);
    // Both patrol cars start behind the player and chase from the rear,
    // so the chase builds up instead of opening with a head-on wreck.
    game.spawnCar('police', 1150, 1400, 0, 'police');
    game.spawnCar('police', 1300, 1400, 0, 'police');
    game.missions.index = 1;
    game.missions.start(game); // sets active, step 0 and the 120 s timer
    game.showDialog('Raka', 'Polisi mengejarku! Aku harus kabur dari kota ini!');
  } else if (scene === 'mission') {
    // Mission 3: chasing the thief down the avenue.
    const sedan = game.cars.find((c) => c.type === 'sedan' && !c.dead);
    game.enterCar(sedan);
    p.car.x = 1400;
    p.car.y = 900;
    p.car.angle = 0;
    p.x = 1400;
    p.y = 900;
    game.missions.index = 2;
    game.missions.start(game);
    if (game.missions.thiefCar) {
      game.missions.thiefCar.x = 1750;
      game.missions.thiefCar.y = 900;
      game.missions.thiefCar.angle = 0;
    }
  } else if (scene === 'night') {
    // Mission 5: a midnight run up the mountain road.
    const van = game.cars.find((c) => c.type === 'van' && !c.dead);
    game.enterCar(van);
    p.car.x = 2300;
    p.car.y = 400;
    p.car.angle = 0.5;
    p.x = 2300;
    p.y = 400;
    game.missions.index = 4;
    game.missions.start(game);
    game.setNight(true);
    game.hour = 23.2;
  }
}

applyScene();

// ---- debug hooks for automated play-testing (window.__game) -----------------
window.__game = {
  game,
  state() {
    return {
      state: game.state,
      missionIndex: game.missions.index,
      missionActive: game.missions.active,
      missionStep: game.missions.step,
      missionDone: game.missions.done,
      ramCount: game.missions.ramCount,
      wanted: game.wanted,
      money: game.player.money,
      hp: game.player.hp,
      x: Math.round(game.player.x),
      y: Math.round(game.player.y),
      inCar: game.player.inCar,
      carType: game.player.car ? game.player.car.type : null,
      cars: game.cars.length,
      peds: game.peds.length,
      time: Math.round(game.time),
    };
  },
  debug: {
    teleport(x, y) {
      const p = game.player;
      if (p.inCar && p.car) { p.car.x = x; p.car.y = y; p.car.vx = 0; p.car.vy = 0; }
      p.x = x;
      p.y = y;
    },
    teleportToObjective() {
      const m = game.markerPos();
      if (m) window.__game.debug.teleport(m.x, m.y);
    },
    setWanted(n) { game.setWanted(n); },
    startMission() { game.missions.start(game); },
    completeMission() { if (game.missions.active) game.missions.completeMission(game); },
    setMission(i) {
      game.missions.index = i;
      game.missions.active = false;
      game.missions.step = 0;
    },
    enterNearestCar() {
      const car = game.nearestCar(100000);
      if (car) game.enterCar(car);
    },
    ramThief() {
      const t = game.missions.thiefCar;
      const p = game.player;
      if (t && p.car) {
        p.car.x = t.x - 40;
        p.car.y = t.y;
        p.car.vx = 300;
        p.car.vy = 0;
        p.x = p.car.x;
        p.y = p.car.y;
      }
    },
    giveGun() { game.player.hasGun = true; game.player.ammo = 100; },
    setHour(h) { game.hour = h; game.night = h >= 20 || h < 6; },
  },
};

// ---- main loop ---------------------------------------------------------------

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (game.state === 'play') game.update(dt);
  else {
    // The title screen still drifts the camera and falls snow behind the menu.
    game.time += dt;
    game.cam.x = Math.max(0, Math.min(WORLD_W - game.viewW, 300 + Math.sin(game.time * 0.05) * 200));
    game.cam.y = Math.max(0, Math.min(WORLD_H - game.viewH, 200 + Math.cos(game.time * 0.04) * 120));
    for (const f of game.flakes) {
      f.y += f.v * dt;
      if (f.y > game.viewH) { f.y = -4; f.x = game.rng() * game.viewW; }
    }
  }
  game.draw(ctx);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__gameReady = true;
