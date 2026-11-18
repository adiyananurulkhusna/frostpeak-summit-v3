// hud.js — everything drawn on top of the world: health, money, wanted stars,
// clock, objective, dialog, notifications, minimap and the menu screens.

import { WORLD_W, WORLD_H, ROADS, LAKE, PLACES } from './world.js';

const TAU = Math.PI * 2;

function star(ctx, x, y, r, filled) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const ang = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? r : r * 0.45;
    const px = x + Math.cos(ang) * rad;
    const py = y + Math.sin(ang) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = filled ? '#ffd23f' : 'rgba(255,255,255,0.25)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

export function drawHUD(ctx, game) {
  const W = game.viewW;
  const H = game.viewH;
  const p = game.player;

  // --- top-left: health, money, wanted stars ---
  ctx.fillStyle = 'rgba(10,20,35,0.55)';
  ctx.fillRect(12, 12, 250, 84);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 15px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('RAKA', 22, 34);
  // Health bar.
  ctx.fillStyle = '#20242c';
  ctx.fillRect(22, 44, 150, 14);
  const hpFrac = Math.max(0, p.hp / p.maxHp);
  ctx.fillStyle = hpFrac > 0.5 ? '#58c96b' : hpFrac > 0.25 ? '#e8a13a' : '#d23c3c';
  ctx.fillRect(22, 44, 150 * hpFrac, 14);
  ctx.fillStyle = '#ffffff';
  ctx.font = '12px sans-serif';
  ctx.fillText(`${Math.ceil(p.hp)}`, 178, 56);
  // Money.
  ctx.fillStyle = '#7ee787';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText(`$${p.money}`, 22, 80);
  // Wanted stars.
  for (let i = 0; i < 5; i++) star(ctx, 200 + i * 16, 74, 8, i < game.wanted);

  // --- top-right: clock and day ---
  ctx.fillStyle = 'rgba(10,20,35,0.55)';
  ctx.fillRect(W - 132, 12, 120, 44);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'right';
  const hh = String(Math.floor(game.hour)).padStart(2, '0');
  const mm = String(Math.floor((game.hour % 1) * 60)).padStart(2, '0');
  ctx.fillText(`${hh}:${mm}`, W - 24, 32);
  ctx.font = '12px sans-serif';
  ctx.fillText(game.night ? 'Malam' : 'Siang', W - 24, 48);

  // --- objective line under the top bar ---
  const objective = game.objectiveText();
  if (objective) {
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    const tw = ctx.measureText(objective).width + 24;
    ctx.fillStyle = 'rgba(10,20,35,0.6)';
    ctx.fillRect((W - tw) / 2, 12, tw, 30);
    ctx.fillStyle = '#ffe9a8';
    ctx.fillText(objective, W / 2, 32);
  }

  // --- mission timer ---
  const m = game.missions.current;
  if (game.missions.active && m && m.timeLimit) {
    ctx.fillStyle = game.missions.timeLeft < 20 ? '#ff5a5a' : '#ffffff';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`⏱ ${Math.ceil(game.missions.timeLeft)} dtk`, W / 2, 62);
  }

  // --- bottom-left: controls hint ---
  ctx.fillStyle = 'rgba(10,20,35,0.5)';
  ctx.fillRect(12, H - 62, 330, 50);
  ctx.fillStyle = '#dfe9f4';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('WASD gerak / nyetir  •  E masuk-keluar mobil  •  F pukul', 20, H - 42);
  ctx.fillText('Klik / J tembak  •  P jeda  •  M suara  •  H klakson', 20, H - 24);

  // --- bottom-center: dialog box ---
  if (game.dialog && game.dialog.t > 0) {
    const boxW = Math.min(640, W - 80);
    const boxH = 86;
    ctx.fillStyle = 'rgba(12,22,38,0.88)';
    ctx.fillRect((W - boxW) / 2, H - boxH - 76, boxW, boxH);
    ctx.strokeStyle = '#e8a13a';
    ctx.lineWidth = 2;
    ctx.strokeRect((W - boxW) / 2, H - boxH - 76, boxW, boxH);
    ctx.fillStyle = '#ffd23f';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(game.dialog.name, (W - boxW) / 2 + 16, H - boxH - 50);
    ctx.fillStyle = '#ffffff';
    ctx.font = '14px sans-serif';
    wrapText(ctx, game.dialog.text, (W - boxW) / 2 + 16, H - boxH - 28, boxW - 32, 18);
  }

  // --- notifications (stacked, fading) ---
  ctx.textAlign = 'center';
  let ny = 110;
  for (const n of game.notifs) {
    ctx.globalAlpha = Math.min(1, n.t);
    ctx.font = 'bold 15px sans-serif';
    const tw = ctx.measureText(n.text).width + 24;
    ctx.fillStyle = 'rgba(10,20,35,0.7)';
    ctx.fillRect((W - tw) / 2, ny, tw, 28);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(n.text, W / 2, ny + 19);
    ny += 34;
  }
  ctx.globalAlpha = 1;

  // --- car health when driving ---
  if (p.inCar && p.car) {
    ctx.fillStyle = 'rgba(10,20,35,0.55)';
    ctx.fillRect(12, 104, 200, 40);
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(p.car.spec.name, 22, 120);
    ctx.fillStyle = '#20242c';
    ctx.fillRect(22, 126, 150, 10);
    ctx.fillStyle = '#7ab8e8';
    ctx.fillRect(22, 126, 150 * Math.max(0, p.car.hp / p.car.maxHp), 10);
    if (p.hasGun) {
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`Pistol: ${p.ammo} peluru`, 22, 138 + 0);
    }
  }

  drawMinimap(ctx, game);
}

function wrapText(ctx, text, x, y, maxW, lineH) {
  const words = text.split(' ');
  let line = '';
  let yy = y;
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, yy);
      line = word;
      yy += lineH;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, yy);
}

export function drawMinimap(ctx, game) {
  const W = game.viewW;
  const H = game.viewH;
  const size = 170;
  const mx = W - size - 14;
  const my = H - size - 14;
  const scale = size / WORLD_W;
  ctx.fillStyle = 'rgba(10,20,35,0.72)';
  ctx.fillRect(mx - 6, my - 6, size + 12, size + 12);
  ctx.save();
  ctx.beginPath();
  ctx.rect(mx, my, size, size);
  ctx.clip();
  // Snow background.
  ctx.fillStyle = '#dfe9f4';
  ctx.fillRect(mx, my, size, size);
  // Lake.
  ctx.fillStyle = '#a9cfe8';
  ctx.beginPath();
  ctx.ellipse(mx + LAKE.cx * scale, my + LAKE.cy * scale, LAKE.rx * scale, LAKE.ry * scale, 0, 0, TAU);
  ctx.fill();
  // Roads.
  ctx.strokeStyle = '#3d4450';
  ctx.lineWidth = Math.max(2, 120 * scale);
  for (const s of ROADS) {
    ctx.beginPath();
    ctx.moveTo(mx + s.x1 * scale, my + s.y1 * scale);
    ctx.lineTo(mx + s.x2 * scale, my + s.y2 * scale);
    ctx.stroke();
  }
  // Mission marker.
  const marker = game.markerPos();
  if (marker) {
    const pulse = 4 + Math.sin(game.time * 5) * 2;
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.arc(mx + marker.x * scale, my + marker.y * scale, pulse, 0, TAU);
    ctx.fill();
  }
  // Police (red) and traffic (white).
  for (const car of game.cars) {
    if (car.type === 'police') ctx.fillStyle = '#ff2d2d';
    else if (car.driver === 'player') continue;
    else ctx.fillStyle = '#ffffff';
    ctx.fillRect(mx + car.x * scale - 2, my + car.y * scale - 2, 4, 4);
  }
  // Player arrow.
  const p = game.player;
  ctx.save();
  ctx.translate(mx + p.x * scale, my + p.y * scale);
  ctx.rotate(p.angle);
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath();
  ctx.moveTo(7, 0);
  ctx.lineTo(-5, -5);
  ctx.lineTo(-5, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.strokeRect(mx - 6, my - 6, size + 12, size + 12);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('FROSTPEAK', mx - 4, my - 10);
}

// ---- full screens ----------------------------------------------------------

function screenBase(ctx, game, title, lines, accent) {
  const W = game.viewW;
  const H = game.viewH;
  ctx.fillStyle = 'rgba(8,16,30,0.82)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = accent || '#ffffff';
  ctx.font = 'bold 52px sans-serif';
  ctx.fillText(title, W / 2, H / 2 - 110);
  ctx.fillStyle = '#ffffff';
  ctx.font = '17px sans-serif';
  let y = H / 2 - 60;
  for (const line of lines) {
    ctx.fillText(line, W / 2, y);
    y += 28;
  }
}

export function drawTitle(ctx, game) {
  const W = game.viewW;
  const H = game.viewH;
  // Snowy gradient backdrop with falling flakes already drawn behind.
  ctx.fillStyle = 'rgba(8,18,34,0.72)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#9fd0ff';
  ctx.font = 'bold 64px sans-serif';
  ctx.fillText('FROSTPEAK DRIFT', W / 2, H / 2 - 130);
  ctx.fillStyle = '#ffd23f';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText('Kota salju. Enam misi. Satu malam yang panjang.', W / 2, H / 2 - 92);
  ctx.fillStyle = '#ffffff';
  ctx.font = '16px sans-serif';
  ctx.fillText('Kamu Raka, supir snowplow. Bersihkan jalan, antar paket, kejar pencuri,', W / 2, H / 2 - 40);
  ctx.fillText('selamatkan pendaki — dan kabur dari seluruh kota di misi terakhir.', W / 2, H / 2 - 14);
  ctx.fillStyle = '#7ee787';
  ctx.font = 'bold 18px sans-serif';
  const blink = Math.floor(game.time * 2) % 2 === 0;
  if (blink) ctx.fillText('Tekan ENTER atau klik untuk mulai', W / 2, H / 2 + 40);
  ctx.fillStyle = '#c9d6e8';
  ctx.font = '13px sans-serif';
  ctx.fillText('WASD gerak / nyetir  •  E masuk mobil  •  F pukul  •  Klik tembak  •  P jeda', W / 2, H / 2 + 80);
  if (game.hasSave) {
    ctx.fillStyle = '#ffd23f';
    ctx.fillText('Save ditemukan — tekan L untuk lanjut dari misi terakhir', W / 2, H / 2 + 108);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '12px sans-serif';
  ctx.fillText('Game orisinal buatan adiyananurulkhusna — tanpa aset dari game komersial mana pun.', W / 2, H - 24);
}

export function drawPause(ctx, game) {
  screenBase(ctx, game, 'JEDA', [
    `Uang: $${game.player.money}   •   Misi: ${game.missions.done ? 'TAMAT' : game.missions.index + 1 + ' / 6'}`,
    'P — lanjut main      M — suara on/off      R — mulai ulang dari save',
    'Progress tersimpan otomatis di browser ini.',
  ], '#9fd0ff');
}

export function drawBusted(ctx, game) {
  screenBase(ctx, game, 'BUSTED!', [
    'Polisi menangkapmu di tengah salju.',
    `Denda $100 — uangmu sekarang $${game.player.money}.`,
    'Tekan ENTER untuk bangkit di Klinik Salju.',
  ], '#ff5a5a');
}

export function drawWasted(ctx, game) {
  screenBase(ctx, game, 'WASTED', [
    'Raka tumbang di salju Frostpeak.',
    'Tekan ENTER untuk bangkit di Klinik Salju.',
  ], '#ff5a5a');
}

export function drawEnding(ctx, game) {
  screenBase(ctx, game, 'TAMAT!', [
    'Raka kabur dengan truk brankas dan menghilang di balik badai salju.',
    `Enam misi selesai. Total uang: $${game.player.money}.`,
    'Frostpeak tidak akan pernah sama lagi.',
    'Tekan ENTER untuk main bebas di kota.',
  ], '#ffd23f');
}

// A floating mission marker in the world (drawn by main, after the world).
export function drawWorldMarker(ctx, game) {
  const marker = game.markerPos();
  if (!marker) return;
  const pulse = 1 + Math.sin(game.time * 5) * 0.15;
  ctx.save();
  ctx.translate(marker.x, marker.y);
  ctx.scale(pulse, pulse);
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath();
  ctx.moveTo(0, -34);
  ctx.lineTo(12, -14);
  ctx.lineTo(12, 6);
  ctx.lineTo(-12, 6);
  ctx.lineTo(-12, -14);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#20242c';
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('!', 0, 0);
  ctx.restore();
  // Ring on the ground.
  ctx.strokeStyle = 'rgba(255,210,63,0.8)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(marker.x, marker.y, 40 + Math.sin(game.time * 5) * 6, 16 + Math.sin(game.time * 5) * 2, 0, 0, TAU);
  ctx.stroke();
}
