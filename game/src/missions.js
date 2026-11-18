// missions.js — Raka's story: six missions across Frostpeak, from plowing the
// main street to the final getaway. Each mission is a list of steps the manager
// checks every frame against the live game state.

import { PLACES } from './world.js';

export const MISSIONS = [
  {
    id: 1,
    title: 'Bersihkan Jalan Utama',
    giver: 'Raka',
    briefing: 'Salju menumpuk di jalan utama, Raka. Naik snowplow di depot dan bersihkan tiga simpang sebelum warga terjebak.',
    reward: 300,
    steps: [
      { type: 'enterPlow', text: 'Naik ke snowplow di depot (tekan E di dekatnya)' },
      { type: 'goto', x: 1100, y: 400, r: 100, text: 'Bersihkan simpang Jalan 1100' },
      { type: 'goto', x: 1700, y: 400, r: 100, text: 'Bersihkan simpang Jalan 1700' },
      { type: 'goto', x: 2300, y: 400, r: 100, text: 'Bersihkan simpang Jalan 2300' },
    ],
  },
  {
    id: 2,
    title: 'Antar Paket Hangat',
    giver: 'Bu Sari',
    briefing: 'Sup hangat untuk Lodge Frostpeak harus sampai sebelum dingin. Waktumu 120 detik, jangan sampai telat!',
    reward: 250,
    timeLimit: 120,
    steps: [
      { type: 'goto', x: PLACES.lodge.x, y: PLACES.lodge.y, r: 90, text: 'Antar paket ke Lodge Frostpeak sebelum waktu habis' },
    ],
  },
  {
    id: 3,
    title: 'Kejar Pencuri',
    giver: 'Pak Dedi',
    briefing: 'Pencuri itu kabur dengan mobil curian! Tabrak mobilnya tiga kali sampai dia menyerah.',
    reward: 400,
    steps: [
      { type: 'ram', count: 3, text: 'Tabrak mobil pencuri 3 kali (0/3)' },
    ],
  },
  {
    id: 4,
    title: 'Selamatkan Pendaki',
    giver: 'Tim SAR',
    briefing: 'Seorang pendaki tersesat di jalan gunung. Jemput dia dan bawa ke Klinik Salju secepatnya.',
    reward: 350,
    steps: [
      { type: 'goto', x: PLACES.skier.x, y: PLACES.skier.y, r: 80, text: 'Temui pendaki di jalan gunung' },
      { type: 'goto', x: PLACES.clinic.x, y: PLACES.clinic.y, r: 90, text: 'Bawa pendaki ke Klinik Salju' },
    ],
  },
  {
    id: 5,
    title: 'Jalan Tengah Malam',
    giver: 'Raka',
    briefing: 'Paket rahasia harus sampai ke Kabin Puncak tengah malam. Polisi sedang patroli — jangan sampai tertangkap.',
    reward: 500,
    timeLimit: 150,
    night: true,
    steps: [
      { type: 'goto', x: PLACES.summit.x, y: PLACES.summit.y, r: 90, text: 'Antar paket ke Kabin Puncak sebelum waktu habis' },
    ],
  },
  {
    id: 6,
    title: 'Pelarian Terakhir',
    giver: 'Raka',
    briefing: 'Ini dia, Raka. Curi truk brankas di Bank Frostpeak dan kabur ke Gudang Tua. Seluruh kota akan mengejarmu.',
    reward: 1000,
    steps: [
      { type: 'enterVault', text: 'Curi truk brankas di Bank Frostpeak (tekan E di dekatnya)' },
      { type: 'escape', x: PLACES.hideout.x, y: PLACES.hideout.y, r: 110, text: 'Kabur ke Gudang Tua dengan polisi mengejar' },
    ],
  },
];

export class MissionManager {
  constructor() {
    this.index = 0; // 0-based into MISSIONS; 6 means the story is done
    this.step = 0;
    this.active = false;
    this.timeLeft = 0;
    this.ramCount = 0;
    this.thiefCar = null;
    this.thiefStuck = 0;
    this.thiefReverse = 0;
    this.vaultCar = null;
    this.passenger = false;
    this.failed = false;
  }

  get current() {
    return MISSIONS[this.index] || null;
  }

  get done() {
    return this.index >= MISSIONS.length;
  }

  currentStep() {
    const m = this.current;
    return m ? m.steps[this.step] : null;
  }

  start(game) {
    const m = this.current;
    if (!m || this.active) return;
    this.active = true;
    this.step = 0;
    this.ramCount = 0;
    this.passenger = false;
    this.timeLeft = m.timeLimit || 0;
    this.failed = false;
    if (m.night) game.setNight(true);
    if (m.id === 3) {
      // The thief spawns in a sedan on the nearest street ahead of the player
      // and flees along it — never inside a building block, where it would jam.
      const p = game.player;
      const roadYs = [400, 900, 1400, 1900];
      let bestY = roadYs[0];
      for (const y of roadYs) if (Math.abs(y - p.y) < Math.abs(bestY - p.y)) bestY = y;
      const tx = Math.max(200, Math.min(3000, p.x + 300));
      this.thiefCar = game.spawnCar('sedan', tx, bestY, 0, 'thief');
      this.thiefStuck = 0;
      this.thiefReverse = 0;
      game.notify('Pencuri kabur! Kejar mobil merah itu!');
    }
    if (m.id === 6) {
      this.vaultCar = game.spawnCar('vault', PLACES.bank.x + 60, PLACES.bank.y + 40, Math.PI / 2, null);
    }
    game.showDialog(m.giver, m.briefing);
    game.notify(`Misi ${m.id}: ${m.title} — hadiah $${m.reward}`);
    game.sound.missionStart();
  }

  fail(game, reason) {
    this.active = false;
    this.failed = true;
    game.showDialog('Raka', reason);
    game.notify('Misi gagal — kembali ke penanda ! untuk mencoba lagi.');
    game.sound.busted();
    this.cleanup(game);
  }

  completeStep(game) {
    this.step++;
    game.sound.pickup();
    const m = this.current;
    if (this.step >= m.steps.length) {
      this.completeMission(game);
    } else {
      game.notify(`Lanjut: ${m.steps[this.step].text}`);
    }
  }

  completeMission(game) {
    const m = this.current;
    game.player.money += m.reward;
    game.notify(`Misi selesai! +$${m.reward}`);
    game.showDialog(m.giver, `Bagus, Raka! $${m.reward} sudah masuk kantongmu.`);
    game.sound.cash();
    this.active = false;
    this.index++;
    this.cleanup(game);
    if (this.done) {
      game.finishStory();
    } else {
      game.notify('Misi berikutnya menunggu di penanda ! kuning.');
    }
    game.save();
  }

  cleanup(game) {
    if (this.thiefCar) {
      game.removeCar(this.thiefCar);
      this.thiefCar = null;
    }
    this.passenger = false;
  }

  // Where the player must go to start (or retry) the current mission.
  startMarker() {
    if (this.done) return null;
    if (this.active) return null;
    // Mission 1 starts at the depot; the rest start where the player stands
    // after the previous mission, so the marker follows the player area.
    if (this.index === 0) return { x: PLACES.depot.x, y: PLACES.depot.y };
    return { x: 1700, y: 900 }; // road intersection in the middle of town
  }

  update(game, dt) {
    if (!this.active) return;
    const m = this.current;
    if (!m) return;
    if (m.timeLimit) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this.fail(game, 'Waktu habis! Paketnya dingin dan pelanggan marah. Coba lagi, Raka.');
        return;
      }
    }
    const step = this.currentStep();
    if (!step) return;
    const p = game.player;
    const car = p.car;

    if (step.type === 'enterPlow') {
      if (car && car.type === 'plow') this.completeStep(game);
    } else if (step.type === 'enterVault') {
      if (car && car.type === 'vault') {
        game.setWanted(4);
        game.notify('Alarm berbunyi! Seluruh kota mengejarmu!');
        this.completeStep(game);
      }
    } else if (step.type === 'goto') {
      const d = Math.hypot(p.x - step.x, p.y - step.y);
      if (d < step.r) {
        if (m.id === 4 && this.step === 0) {
          this.passenger = true;
          game.notify('Pendaki naik! Bawa dia ke klinik.');
          game.showDialog('Pendaki', 'Terima kasih! Kakiku kedinginan, tolong cepat ke klinik.');
        }
        this.completeStep(game);
      }
    } else if (step.type === 'ram') {
      if (this.thiefCar) {
        const t = this.thiefCar;
        // The thief flees along the roads away from the player.
        const away = Math.atan2(t.y - p.y, t.x - p.x);
        const want = away;
        let diff = want - t.angle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const steer = Math.max(-1, Math.min(1, diff * 2));
        // Stuck against a wall? Reverse out for a moment, then flee again.
        if (t.speed < 40) this.thiefStuck += dt;
        else this.thiefStuck = 0;
        if (this.thiefStuck > 1) {
          this.thiefReverse = 0.8;
          this.thiefStuck = 0;
        }
        if (this.thiefReverse > 0) {
          this.thiefReverse -= dt;
          t.drive(dt, -0.7, -steer);
        } else {
          t.drive(dt, 0.85, steer);
        }
        step.text = `Tabrak mobil pencuri 3 kali (${this.ramCount}/3)`;
        // A close shove at speed counts as a ram too: at matching chase
        // speed the cars barely register an impact, but the bump is real.
        const pc = game.player.car;
        if (pc && t.ramCooldown <= 0 && Math.hypot(pc.x - t.x, pc.y - t.y) < 62 && pc.speed > 120) {
          t.ramCooldown = 1;
          this.ramCount++;
          game.notify(`Tabrakan! (${this.ramCount}/3)`);
          game.sound.horn();
        }
        if (this.ramCount >= step.count) {
          t.driver = null;
          game.notify('Pencuri menyerah! Mobilnya berhenti.');
          this.completeStep(game);
        }
      }
    } else if (step.type === 'escape') {
      const d = Math.hypot(p.x - step.x, p.y - step.y);
      if (d < step.r && game.wanted >= 3) {
        game.setWanted(0);
        this.completeStep(game);
      }
    }
  }
}
