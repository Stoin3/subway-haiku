/*
 * npc.js - de levende stad: voetgangers, verkeer, geparkeerde auto's, politie
 * (wanted-niveau, achtervolging, arrestatie, helikopter), bendeleden, winkelpersoneel
 * en reacties op geweld (vluchten, schreeuwen, getuigen die de politie bellen).
 */
(function () {
  'use strict';

  var G = window.G, T = G.T, U = G.U;
  var N = G.npc = { peds: [], cars: [], cops: [], copCars: [], gang: [], staff: [], parked: [] };
  var W;
  var tmp = new T.Vector3(), tmp2 = new T.Vector3();

  var LIMITS = { laag: { peds: 16, cars: 10, parked: 8 }, normaal: { peds: 28, cars: 18, parked: 12 }, ultra: { peds: 42, cars: 26, parked: 16 } };
  function lim() { return LIMITS[G.settings.quality] || LIMITS.normaal; }

  // ---- Wanted-systeem ----------------------------------------------------------
  var wanted = N.wanted = { level: 0, lastSeen: 0, evade: 0, pending: [], copsKilled: 0 };

  N.addWanted = function (n, reason, immediate) {
    var nl = Math.min(5, Math.max(wanted.level, n));
    if (nl > wanted.level) {
      wanted.level = nl;
      wanted.lastSeen = G.time;
      G.audio.sfx('wanted');
      G.emit('wanted', { level: nl, reason: reason });
    } else if (wanted.level > 0) {
      wanted.lastSeen = G.time;
    }
  };
  N.bump = function (reason) { N.addWanted(Math.min(5, wanted.level + 1), reason); };
  N.clearWanted = function (msg) {
    if (!wanted.level) return;
    wanted.level = 0;
    wanted.pending = [];
    G.emit('wanted', { level: 0, reason: msg || 'Je bent de politie kwijt' });
    N.copCars.forEach(function (c) { c.ai.mode = 'leave'; c.siren = false; });
    N.cops.forEach(function (c) { c.ai.mode = 'leave'; });
  };

  // Misdaad melden: direct als politie dichtbij is, anders via getuigen met vertraging
  N.crime = function (stars, pos, reason) {
    var copNear = N.cops.some(function (c) { return c.alive && c.distTo(pos) < 80; }) ||
      N.copCars.some(function (c) { return !c.wrecked && U.dist2(c.pos.x, c.pos.z, pos.x, pos.z) < 90; });
    if (copNear || stars >= 4) { N.addWanted(stars, reason); return; }
    var witness = N.peds.some(function (p) { return p.alive && p.distTo(pos) < 45 && p.ai.state !== 'dead'; }) ||
      N.staff.some(function (p) { return p.alive && p.distTo(pos) < 30; });
    if (!witness) return;
    wanted.pending.push({ t: G.time + 3, stars: stars, reason: reason });
    G.emit('toast', { text: 'Een getuige belt de politie…', kind: 'warn' });
  };

  // ---- Voetgangers ----------------------------------------------------------------
  var SIDE = 40;   // afstand van blokmidden tot het midden van de stoep

  function ringCorner(bl, k) {
    var c = [[1, 1], [-1, 1], [-1, -1], [1, -1]][k];
    return new T.Vector3(bl.cx + c[0] * SIDE, 0.2, bl.cz + c[1] * SIDE);
  }

  function spawnPed(pos, look, team, opts) {
    opts = opts || {};
    var a = new G.Actor({ look: look || G.randomLook(team === 'civ' ? null : team), team: team || 'civ', pos: pos, health: opts.health || 100, weapon: opts.weapon, name: opts.name });
    a.ai = { state: 'walk', timer: U.rand(2, 10), corner: 0, dir: Math.random() < 0.5 ? 1 : -1, speed: U.rand(1.15, 1.6), tough: Math.random() < 0.18, fear: 0, mode: opts.mode || null };
    a.pos.y = W.surface(pos.x, pos.z, pos.y + 1);
    return a;
  }
  N.spawnPed = spawnPed;

  function pickBlockNear(p, rmin, rmax) {
    for (var tries = 0; tries < 12; tries++) {
      var ang = Math.random() * Math.PI * 2;
      var r = U.rand(rmin, rmax);
      var bl = W.blockAt(p.x + Math.cos(ang) * r, p.z + Math.sin(ang) * r);
      if (bl) return bl;
    }
    return null;
  }

  function spawnCivNear(p) {
    var bl = pickBlockNear(p, 35, 110);
    if (!bl) return;
    var k = U.randInt(4);
    var a = ringCorner(bl, k), b = ringCorner(bl, (k + 1) % 4);
    var t = Math.random();
    var pos = new T.Vector3(U.lerp(a.x, b.x, t), 0.2, U.lerp(a.z, b.z, t));
    if (bl.district === 'park') pos.set(bl.cx + U.rand(-30, 30), 0.2, bl.cz + U.rand(-30, 30));
    if (pos.distanceTo(p) < 25) return;
    var ped = spawnPed(pos, null, 'civ');
    ped.ai.block = bl;
    ped.ai.corner = Math.random() < 0.5 ? (k + 1) % 4 : k;
    if (bl.district === 'park') { ped.ai.state = 'wander'; ped.ai.target = pos.clone(); }
    N.peds.push(ped);
  }

  function nextCorner(p) {
    var ai = p.ai;
    // af en toe oversteken naar het naastgelegen blok
    if (Math.random() < 0.35) {
      var c = [[1, 1], [-1, 1], [-1, -1], [1, -1]][ai.corner];
      var dir = Math.random() < 0.5 ? [c[0], 0] : [0, c[1]];
      var nb = W.blockAt(ai.block.cx + dir[0] * W.P, ai.block.cz + dir[1] * W.P);
      if (nb && nb.district !== 'special') {
        ai.block = nb;
        // corresponderende hoek van het nieuwe blok
        var nc = [c[0] * (dir[0] ? -1 : 1), c[1] * (dir[1] ? -1 : 1)];
        for (var k = 0; k < 4; k++) {
          var cc = [[1, 1], [-1, 1], [-1, -1], [1, -1]][k];
          if (cc[0] === nc[0] && cc[1] === nc[1]) ai.corner = k;
        }
        return;
      }
    }
    ai.corner = (ai.corner + ai.dir + 4) % 4;
  }

  function steerTo(p, target, speed, dt, jump) {
    var dx = target.x - p.pos.x, dz = target.z - p.pos.z;
    var d = Math.sqrt(dx * dx + dz * dz);
    if (d < 0.05) { p.move(dt, 0, 0, false); return d; }
    var s = Math.min(speed, d * 3);
    p.move(dt, dx / d * s, dz / d * s, jump);
    p.faceTo(Math.atan2(dx, dz), dt, 9);
    return d;
  }

  function scare(p, from, strength) {
    if (!p.alive || p.team !== 'civ') return;
    if (p.ai.state === 'flee' && p.ai.timer > 3) return;
    if (p.ai.tough && strength < 2 && from === G.player.pos) return;
    p.ai.state = 'flee';
    p.ai.from = from.clone();
    p.ai.timer = U.rand(7, 13);
    if (Math.random() < 0.6 && p.distTo(G.player.pos) < 50) G.audio.scream(p.pos.clone().setY(p.pos.y + 1.6), p.voice.pitch);
    p.char.setExpression('bang');
  }
  N.scare = scare;

  var PED_LINES = {
    bump: ['Hé, kijk uit!', 'Pardon?!', 'Loop eens op!', 'Au, joh!', 'Wat doe je nou?'],
    greet: ['Goedemiddag!', 'Mooi weer, hè?', 'Hoi!', 'Alles goed?'],
    fight: ['Kom maar op!', 'Dat ga je bezuren!', 'Is dat alles?'],
    flee: ['Help! Politie!', 'Wegwezen!', 'Niet schieten!'],
    car: ['Mijn auto!', 'Dief! Houd de dief!', 'Hé! Dat is mijn wagen!']
  };
  N.LINES = PED_LINES;

  function updatePed(p, dt) {
    var ai = p.ai;
    var player = G.player;
    if (!p.alive) { p.sync(dt); return; }
    ai.timer -= dt;
    var anim = p.anim;
    anim.flee = false; anim.handsUp = false; anim.talk = false; anim.punch = 0; anim.aim = false; anim.phone = false;
    var sp = 0;
    if (ai.state === 'walk') {
      var target = ringCorner(ai.block, ai.corner);
      var d = steerTo(p, target, ai.speed, dt);
      sp = ai.speed;
      if (d < 1.2) nextCorner(p);
      if (ai.timer <= 0) {
        ai.timer = U.rand(8, 25);
        if (Math.random() < 0.3) { ai.state = 'idle'; ai.timer = U.rand(2, 6); ai.phone = Math.random() < 0.5; }
      }
    } else if (ai.state === 'wander') {
      if (!ai.target || p.distTo(ai.target) < 1 || ai.timer <= 0) {
        ai.target = new T.Vector3(ai.block.cx + U.rand(-30, 30), 0.2, ai.block.cz + U.rand(-30, 30));
        if (U.dist2(ai.target.x, ai.target.z, -150, 150) < 24) ai.target.x += 30;
        ai.timer = U.rand(6, 14);
      }
      steerTo(p, ai.target, ai.speed * 0.8, dt);
      sp = ai.speed * 0.8;
    } else if (ai.state === 'idle') {
      p.move(dt, 0, 0, false);
      anim.phone = ai.phone;
      if (ai.timer <= 0) { ai.state = 'walk'; ai.timer = U.rand(8, 20); }
    } else if (ai.state === 'flee') {
      var away = tmp.subVectors(p.pos, ai.from);
      away.y = 0;
      if (away.lengthSq() < 0.01) away.set(1, 0, 0);
      away.normalize();
      var fleeT = tmp2.copy(p.pos).addScaledVector(away, 10);
      steerTo(p, fleeT, 5.6, dt);
      sp = 5.6;
      anim.flee = true;
      if (ai.timer <= 0) { ai.state = 'walk'; p.char.setExpression('neutraal'); }
    } else if (ai.state === 'cower') {
      p.move(dt, 0, 0, false);
      anim.handsUp = true;
      p.faceTo(Math.atan2(player.pos.x - p.pos.x, player.pos.z - p.pos.z), dt, 6);
      if (ai.timer <= 0) scare(p, player.pos, 2);
    } else if (ai.state === 'fight') {
      var dpl = p.distTo(player.pos);
      if (!player.alive || dpl > 25 || player.vehicle) { ai.state = 'walk'; }
      else if (dpl > 1.2) { steerTo(p, player.pos, 4.5, dt); sp = 4.5; }
      else {
        p.move(dt, 0, 0, false);
        p.faceTo(Math.atan2(player.pos.x - p.pos.x, player.pos.z - p.pos.z), dt, 10);
        ai.punchT = (ai.punchT || 0) - dt;
        if (ai.punchT <= 0) { ai.punchT = 0.9; ai.punching = 0.0001; }
      }
      if (ai.punching > 0) {
        ai.punching += dt * 3;
        anim.punch = Math.min(1, ai.punching);
        if (ai.punching > 0.5 && !ai.punchHit) { ai.punchHit = true; G.combat.melee(p, 9); }
        if (ai.punching >= 1) { ai.punching = 0; ai.punchHit = false; }
      }
    }
    // tegen de speler aanlopen
    if (player.alive && !player.vehicle && p.distTo(player.pos) < 0.7 && Math.abs(p.pos.y - player.pos.y) < 1) {
      tmp.subVectors(p.pos, player.pos).setY(0).normalize();
      p.pos.addScaledVector(tmp, 0.05);
      if (!ai.bumpT || G.time > ai.bumpT) { ai.bumpT = G.time + 6; p.say(U.pick(PED_LINES.bump)); }
    }
    anim.speed = Math.sqrt(p.vel.x * p.vel.x + p.vel.z * p.vel.z);
    anim.grounded = p.grounded;
    var dcam = p.distTo(G.cam.position);
    p.char.root.visible = dcam < 130;
    if (dcam > 90) { p.char.root.position.copy(p.pos); p.char.root.rotation.set(0, p.heading, 0); }
    else p.sync(dt, anim);
  }

  // ---- Verkeer ----------------------------------------------------------------------
  var CAR_TYPES = ['kwiek', 'kwiek', 'sedan', 'sedan', 'sedan', 'mammoet', 'bus', 'taxi', 'donder', 'vortex'];

  function laneTarget(from, to, along, out) {
    var ax = from.i * W.P, az = from.j * W.P, bx = to.i * W.P, bz = to.j * W.P;
    var dx = bx - ax, dz = bz - az;
    var len = Math.sqrt(dx * dx + dz * dz);
    var h = Math.atan2(dx, dz);
    var rx = -Math.cos(h), rz = Math.sin(h);
    var t = U.clamp(along / len, 0, 1);
    return out.set(ax + dx * t + rx * W.LANE, 0, az + dz * t + rz * W.LANE);
  }

  function segAlong(car) {
    var ax = car.ai.from.i * W.P, az = car.ai.from.j * W.P;
    var bx = car.ai.to.i * W.P, bz = car.ai.to.j * W.P;
    var dx = bx - ax, dz = bz - az;
    var len = Math.sqrt(dx * dx + dz * dz);
    return { along: ((car.pos.x - ax) * dx + (car.pos.z - az) * dz) / len, len: len };
  }

  function chooseNext(from, to) {
    var nb = W.neighbors(to.i, to.j).filter(function (n) { return !(n.i === from.i && n.j === from.j); });
    return nb.length ? U.pick(nb) : from;
  }

  function spawnCarNear(p) {
    for (var tries = 0; tries < 8; tries++) {
      var ang = Math.random() * Math.PI * 2;
      var r = U.rand(90, 200);
      var n = W.nearestNode(p.x + Math.cos(ang) * r, p.z + Math.sin(ang) * r);
      var nb = W.neighbors(n.i, n.j);
      if (!nb.length) continue;
      var to = U.pick(nb);
      var tgt = laneTarget(n, to, U.rand(15, 70), new T.Vector3());
      if (tgt.distanceTo(p) < 70) continue;
      var clash = G.vehicles.list.some(function (v) { return v.pos.distanceTo(tgt) < 14; });
      if (clash) continue;
      var v = new G.Vehicle(U.pick(CAR_TYPES));
      v.pos.copy(tgt);
      v.pos.y = W.ground(tgt.x, tgt.z);
      v.heading = Math.atan2(to.i - n.i, to.j - n.j);
      v.vel.set(Math.sin(v.heading) * 8, 0, Math.cos(v.heading) * 8);
      var driver = spawnPed(v.pos.clone(), null, 'civ');
      driver.enterVehicle(v, 0);
      driver.ai.state = 'drive';
      v.ai = { from: n, to: to, next: null, cruise: U.rand(10, 14), blocked: 0, mode: 'drive' };
      N.cars.push(v);
      return v;
    }
    return null;
  }

  function trafficDrive(v, dt) {
    var ai = v.ai;
    var d = v.driver;
    if (!d || !d.alive || v.wrecked) { v.update(dt, { throttle: 0, steer: 0, handbrake: true }); return; }
    var sa = segAlong(v);
    if (!ai.next) ai.next = chooseNext(ai.from, ai.to);
    var target = new T.Vector3();
    var look = 9 + v.speed() * 0.4;
    var turning = false;
    if (sa.along + look > sa.len - 4) {
      var over = sa.along + look - sa.len;
      laneTarget(ai.to, ai.next, Math.max(5, over), target);
      turning = (ai.next.i - ai.to.i) !== (ai.to.i - ai.from.i) || (ai.next.j - ai.to.j) !== (ai.to.j - ai.from.j);
    } else {
      laneTarget(ai.from, ai.to, sa.along + look, target);
    }
    if (sa.along > sa.len - 2) {
      ai.from = ai.to; ai.to = ai.next; ai.next = null;
    }
    var desired = Math.atan2(target.x - v.pos.x, target.z - v.pos.z);
    var steer = U.clamp(U.angDiff(v.heading, desired) * 2.4, -1, 1);
    var cruise = ai.mode === 'flee' ? 22 : ai.cruise;
    if (turning && sa.along > sa.len - 25) cruise = Math.min(cruise, 7.5);
    // obstakels voor de auto
    var fx = Math.sin(v.heading), fz = Math.cos(v.heading);
    var brakeDist = 7 + v.speed() * 0.9;
    var block = 999;
    var list = G.vehicles.list;
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (o === v || (o.isHeli && !o.landed)) continue;
      var rx = o.pos.x - v.pos.x, rz = o.pos.z - v.pos.z;
      var al = rx * fx + rz * fz;
      if (al < 0 || al > brakeDist + 6) continue;
      var lat = Math.abs(rx * fz - rz * fx);
      if (lat < 2.3) block = Math.min(block, al - v.halfL - o.halfL);
    }
    for (var k = 0; k < G.actors.length; k++) {
      var a = G.actors[k];
      if (!a.alive || a.vehicle) continue;
      var ax = a.pos.x - v.pos.x, az = a.pos.z - v.pos.z;
      var al2 = ax * fx + az * fz;
      if (al2 < 0 || al2 > brakeDist + 3) continue;
      if (Math.abs(ax * fz - az * fx) < 1.7) block = Math.min(block, al2 - v.halfL);
    }
    var thr;
    var spd = v.forwardSpeed();
    if (block < 3) { thr = spd > 0.3 ? -1 : 0; ai.blocked += dt; }
    else if (block < brakeDist) { thr = spd > block * 0.8 ? -0.7 : 0.2; ai.blocked = 0; }
    else { thr = spd < cruise ? 0.75 : (spd > cruise + 2 ? -0.3 : 0.05); ai.blocked = 0; }
    if (ai.blocked > 3 && (!ai.honk || G.time > ai.honk)) {
      ai.honk = G.time + U.rand(3, 6);
      G.audio.sfx('horn', v.pos, { dur: U.rand(0.3, 0.8) });
    }
    if (ai.mode === 'flee' && ai.blocked > 1.5) { thr = -0.8; steer = -steer; }
    v.update(dt, { throttle: thr, steer: steer, handbrake: false });
  }

  // ---- Geparkeerde auto's -------------------------------------------------------------
  function spawnParkedNear(p) {
    var bl = pickBlockNear(p, 30, 120);
    if (!bl || bl.district === 'park') return;
    var side = U.randInt(4);
    var t = U.rand(-30, 30);
    var off = 42 + 1.6;
    var pos, h;
    if (side === 0) { pos = new T.Vector3(bl.cx + t, 0, bl.cz + off); h = Math.PI / 2; }
    else if (side === 1) { pos = new T.Vector3(bl.cx + t, 0, bl.cz - off); h = -Math.PI / 2; }
    else if (side === 2) { pos = new T.Vector3(bl.cx + off, 0, bl.cz + t); h = Math.PI; }
    else { pos = new T.Vector3(bl.cx - off, 0, bl.cz + t); h = 0; }
    if (pos.distanceTo(p) < 25) return;
    if (G.vehicles.list.some(function (v) { return v.pos.distanceTo(pos) < 7; })) return;
    var v = new G.Vehicle(U.pick(CAR_TYPES));
    v.pos.copy(pos);
    v.pos.y = W.ground(pos.x, pos.z);
    v.heading = h + (Math.random() < 0.5 ? Math.PI : 0);
    v.parked = true;
    v.sync();
    N.parked.push(v);
  }

  // ---- Politie --------------------------------------------------------------------------
  function spawnCopCar() {
    var p = G.player.pos;
    for (var tries = 0; tries < 10; tries++) {
      var ang = Math.random() * Math.PI * 2;
      var r = U.rand(110, 170);
      var n = W.nearestNode(p.x + Math.cos(ang) * r, p.z + Math.sin(ang) * r);
      var pos = new T.Vector3(n.i * W.P, 0, n.j * W.P);
      if (pos.distanceTo(p) < 80) continue;
      var v = new G.Vehicle('politie');
      v.pos.copy(pos);
      v.heading = Math.atan2(p.x - pos.x, p.z - pos.z);
      v.siren = true;
      v.ai = { mode: 'chase', node: n, route: null, routeT: 0, blocked: 0, cops: [] };
      for (var c = 0; c < 2; c++) {
        var cop = spawnPed(pos.clone(), null, 'politie', { health: 120, weapon: wanted.level >= 4 ? 'rifle' : 'pistol' });
        cop.team = 'cop';
        cop.enterVehicle(v, c);
        cop.ai.state = 'incar';
        cop.ai.car = v;
        v.ai.cops.push(cop);
        N.cops.push(cop);
      }
      N.copCars.push(v);
      return v;
    }
    return null;
  }

  var heli = null;
  function spawnCopHeli() {
    var p = G.player.pos;
    var v = new G.Vehicle('politieheli');
    var ang = Math.random() * Math.PI * 2;
    v.pos.set(p.x + Math.cos(ang) * 260, 70, p.z + Math.sin(ang) * 260);
    v.landed = false;
    v.rotor = 1;
    var pilot = spawnPed(v.pos.clone(), null, 'politie', { health: 150, weapon: 'rifle' });
    pilot.team = 'cop';
    pilot.enterVehicle(v, 0);
    pilot.ai.state = 'incar';
    var gunner = spawnPed(v.pos.clone(), null, 'politie', { health: 150, weapon: 'rifle' });
    gunner.team = 'cop';
    gunner.enterVehicle(v, 1);
    gunner.ai.state = 'incar';
    N.cops.push(pilot, gunner);
    v.ai = { mode: 'chase', gunner: gunner, shootT: 2 };
    var spot = new T.SpotLight(0xe8f4ff, 0, 140, 0.32, 0.6, 1.2);
    spot.castShadow = false;
    G.scene.add(spot);
    G.scene.add(spot.target);
    v.spot = spot;
    v.heliSound = G.audio.loop('heli', v.pos);
    heli = v;
  }

  function copCarAI(v, dt) {
    var ai = v.ai;
    var player = G.player;
    var d = v.driver;
    if (v.wrecked || !d || !d.alive) {
      v.update(dt, { throttle: 0, steer: 0, handbrake: true });
      v.siren = false;
      return;
    }
    if (ai.mode === 'leave') {
      v.siren = false;
      v.update(dt, { throttle: 0.6, steer: 0, handbrake: false });
      return;
    }
    var target = player.vehicle ? player.vehicle.pos : player.pos;
    var dist = U.dist2(v.pos.x, v.pos.z, target.x, target.z);
    var aim;
    if (dist > 45) {
      // volg de straten naar de speler
      ai.routeT -= dt;
      if (!ai.route || ai.routeT <= 0) {
        ai.routeT = 2;
        ai.route = W.route(W.nearestNode(v.pos.x, v.pos.z), W.nearestNode(target.x, target.z));
        ai.ri = 0;
      }
      var node = ai.route[Math.min(ai.ri, ai.route.length - 1)];
      aim = new T.Vector3(node.i * W.P, 0, node.j * W.P);
      if (U.dist2(v.pos.x, v.pos.z, aim.x, aim.z) < 12 && ai.ri < ai.route.length - 1) ai.ri++;
      if (ai.ri >= ai.route.length - 1) aim = target;
    } else {
      aim = target;
    }
    var desired = Math.atan2(aim.x - v.pos.x, aim.z - v.pos.z);
    var diff = U.angDiff(v.heading, desired);
    var steer = U.clamp(diff * 2.6, -1, 1);
    var spd = v.forwardSpeed();
    var want = dist > 45 ? 26 : (player.vehicle ? 30 : Math.max(0, (dist - 10) * 1.2));
    var thr = spd < want ? 1 : -0.6;
    if (Math.abs(diff) > 1.6 && spd > 8) thr = -0.4;
    if (v.speed() < 1 && thr > 0) ai.blocked += dt; else ai.blocked = Math.max(0, ai.blocked - dt);
    if (ai.blocked > 2.5) { thr = -1; steer = -steer; if (ai.blocked > 4) ai.blocked = 0; }
    v.update(dt, { throttle: thr, steer: steer, handbrake: Math.abs(diff) > 1.2 && spd > 10 });
    // uitstappen als de speler te voet en dichtbij is
    if (!player.vehicle && dist < 18 && v.speed() < 3) {
      ai.cops.forEach(function (c) {
        if (c.alive && c.vehicle === v) { c.exitVehicle(); c.ai.state = 'pursue'; }
      });
    }
  }

  function copFootAI(c, dt) {
    var ai = c.ai;
    var player = G.player;
    var anim = c.anim;
    anim.aim = false; anim.flee = false; anim.punch = 0; anim.handsUp = false;
    if (!c.alive) { c.sync(dt); return; }
    if (c.vehicle) { c.sync(dt, anim); return; }
    if (ai.mode === 'leave' || wanted.level === 0) {
      // terug naar de auto of rustig weglopen
      if (ai.car && !ai.car.wrecked && c.distTo(ai.car.pos) < 30) {
        if (c.distTo(ai.car.pos) < 3) c.enterVehicle(ai.car, ai.car.driver ? 1 : 0);
        else steerTo(c, ai.car.pos, 3, dt);
      } else c.move(dt, 0, 0, false);
      anim.speed = Math.hypot(c.vel.x, c.vel.z);
      anim.grounded = c.grounded;
      c.sync(dt, anim);
      return;
    }
    var tp = player.vehicle ? player.vehicle.pos : player.pos;
    var dist = c.distTo(tp);
    ai.losT = (ai.losT || 0) - dt;
    if (ai.losT <= 0) {
      ai.losT = 0.4;
      ai.los = dist < 90 && W.lineClear(tmp.set(c.pos.x, c.pos.y + 1.5, c.pos.z), tmp2.set(tp.x, tp.y + 1.2, tp.z));
      if (ai.los) wanted.lastSeen = G.time;
    }
    // terug in de auto als de speler wegrijdt
    if (player.vehicle && dist > 40 && ai.car && !ai.car.wrecked && c.distTo(ai.car.pos) < 25) {
      if (c.distTo(ai.car.pos) < 3) { c.enterVehicle(ai.car, ai.car.driver ? 1 : 0); return; }
      steerTo(c, ai.car.pos, 5.5, dt);
    } else if (wanted.level <= 1 && !player.vehicle) {
      // arresteren
      if (dist > 1.3) steerTo(c, tp, 5.5, dt);
      else {
        c.move(dt, 0, 0, false);
        if (player.speed2d() < 1.8) { ai.grab = (ai.grab || 0) + dt; if (ai.grab > 1.4) G.emit('busted'); }
      }
      c.faceTo(Math.atan2(tp.x - c.pos.x, tp.z - c.pos.z), dt, 8);
    } else {
      var ideal = c.weapon === 'rifle' ? 22 : 14;
      if (!ai.los || dist > ideal + 8) steerTo(c, tp, 5.4, dt);
      else if (dist < 5) steerTo(c, tmp.copy(c.pos).add(tmp2.subVectors(c.pos, tp).setY(0).normalize().multiplyScalar(4)), 4, dt);
      else c.move(dt, 0, 0, false);
      if (ai.los && dist < 70) {
        anim.aim = true;
        anim.weapon = c.holdType();
        c.faceTo(Math.atan2(tp.x - c.pos.x, tp.z - c.pos.z), dt, 10);
        ai.shootT = (ai.shootT || U.rand(0.5, 1.5)) - dt;
        if (ai.shootT <= 0) {
          var w = G.WEAPONS[c.weapon];
          ai.shootT = c.weapon === 'rifle' ? U.rand(0.12, 0.25) : U.rand(0.6, 1.3);
          if (c.weapon === 'rifle' && Math.random() < 0.15) ai.shootT = U.rand(1, 2);
          var aimP = tmp.set(tp.x, tp.y + (player.vehicle ? 0.9 : 1.2), tp.z);
          var acc = 3 + dist / 9 + player.speed2d() / 3;
          G.combat.fire(c, c.weapon, aimP, acc);
          anim.kick = 1;
          void w;
        }
      }
    }
    anim.kick = Math.max(0, (anim.kick || 0) - dt * 8);
    anim.speed = Math.hypot(c.vel.x, c.vel.z);
    anim.grounded = c.grounded;
    c.sync(dt, anim);
  }

  function heliAI(v, dt) {
    var player = G.player;
    if (v.wrecked) {
      v.update(dt, {});
      if (v.spot) v.spot.intensity = 0;
      return;
    }
    var tp = player.vehicle ? player.vehicle.pos : player.pos;
    var leaving = v.ai.mode === 'leave' || wanted.level === 0;
    var goal = leaving ? tmp.set(v.pos.x + 200, 120, v.pos.z + 200) : tmp.set(tp.x + Math.sin(G.time * 0.2) * 30, Math.max(W.surface(tp.x, tp.z, 500) + 45, tp.y + 40), tp.z + Math.cos(G.time * 0.2) * 30);
    var dx = goal.x - v.pos.x, dz = goal.z - v.pos.z, dy = goal.y - v.pos.y;
    var dist = Math.sqrt(dx * dx + dz * dz);
    var desired = Math.atan2(dx, dz);
    var yaw = -U.clamp(U.angDiff(v.heading, desired) * 1.5, -1, 1);
    var fx = Math.sin(v.heading), fz = Math.cos(v.heading);
    var fwdSpeed = v.vel.x * fx + v.vel.z * fz;
    var want = Math.min(30, dist * 0.5);
    var pitch = U.clamp((want - fwdSpeed) * 0.15, -1, 1);
    var lift = U.clamp(dy * 0.15 - v.vel.y * 0.3, -1, 1);
    v.update(dt, { pitch: pitch, roll: 0, yaw: yaw, lift: lift });
    if (v.heliSound) { v.heliSound.setPos(v.pos); v.heliSound.set({ rotor: v.rotor, vol: 1.3 }); }
    var night = G.uniforms.uNight.value;
    if (v.spot) {
      v.spot.position.set(v.pos.x, v.pos.y - 0.5, v.pos.z);
      v.spot.target.position.set(tp.x, tp.y, tp.z);
      v.spot.intensity = leaving ? 0 : night * 40000;
    }
    if (!leaving && U.dist2(v.pos.x, v.pos.z, tp.x, tp.z) < 130) wanted.lastSeen = G.time;
    // scherpschutter vanaf niveau 4
    if (!leaving && wanted.level >= 4 && v.ai.gunner && v.ai.gunner.alive) {
      v.ai.shootT -= dt;
      if (v.ai.shootT <= 0) {
        v.ai.shootT = U.rand(0.8, 2);
        G.combat.fire(v.ai.gunner, 'rifle', tmp2.set(tp.x, tp.y + 1, tp.z), 3 + U.dist2(v.pos.x, v.pos.z, tp.x, tp.z) / 12);
      }
    }
    if (leaving && dist < 30) {
      // weg: opruimen
      v.ai.done = true;
    }
  }

  // ---- Bende -----------------------------------------------------------------------------
  N.spawnGang = function (center, n, hostile) {
    var list = [];
    for (var i = 0; i < n; i++) {
      var p = new T.Vector3(center.x + U.rand(-16, 16), 0.2, center.z + U.rand(-14, 14));
      var g = spawnPed(p, null, 'bende', { health: 110, weapon: U.pick(['pistol', 'smg', 'smg', 'shotgun']) });
      g.team = 'gang';
      g.ai.state = hostile ? 'hostile' : 'guard';
      g.ai.home = p.clone();
      N.gang.push(g);
      list.push(g);
    }
    return list;
  };

  function gangAI(g, dt) {
    var ai = g.ai;
    var player = G.player;
    var anim = g.anim;
    anim.aim = false; anim.punch = 0;
    if (!g.alive) { g.sync(dt); return; }
    var dist = g.distTo(player.pos);
    if (ai.state === 'guard') {
      g.move(dt, 0, 0, false);
      anim.talk = Math.sin(G.time * 0.5 + g.pos.x) > 0.6;
      if (dist < 22 && player.alive) { ai.state = 'hostile'; g.say(U.pick(['Wie ben jij?!', 'Dit is ons terrein!', 'Pak hem!'])); }
    } else if (ai.state === 'hostile') {
      ai.losT = (ai.losT || 0) - dt;
      if (ai.losT <= 0) {
        ai.losT = 0.4;
        ai.los = dist < 70 && W.lineClear(tmp.set(g.pos.x, g.pos.y + 1.5, g.pos.z), tmp2.set(player.pos.x, player.pos.y + 1.2, player.pos.z));
      }
      if (!ai.los || dist > 25) steerTo(g, player.pos, 4.8, dt);
      else {
        // zijwaarts bewegen tijdens het schieten
        var side = Math.sin(G.time * 0.8 + g.pos.z) > 0 ? 1 : -1;
        var dx = player.pos.x - g.pos.x, dz = player.pos.z - g.pos.z;
        var l = Math.sqrt(dx * dx + dz * dz) || 1;
        g.move(dt, -dz / l * 2 * side, dx / l * 2 * side, false);
      }
      if (ai.los && player.alive) {
        anim.aim = true;
        anim.weapon = g.holdType();
        g.faceTo(Math.atan2(player.pos.x - g.pos.x, player.pos.z - g.pos.z), dt, 10);
        ai.shootT = (ai.shootT || U.rand(0.4, 1)) - dt;
        if (ai.shootT <= 0) {
          var auto = g.weapon === 'smg';
          ai.shootT = auto ? U.rand(0.08, 0.15) : U.rand(0.6, 1.2);
          if (auto && Math.random() < 0.12) ai.shootT = U.rand(0.8, 1.6);
          var tp = player.vehicle ? player.vehicle.pos : player.pos;
          G.combat.fire(g, g.weapon, tmp.set(tp.x, tp.y + 1.1, tp.z), 3.5 + dist / 8 + player.speed2d() / 3);
          anim.kick = 1;
        }
      }
    }
    anim.kick = Math.max(0, (anim.kick || 0) - dt * 8);
    anim.speed = Math.hypot(g.vel.x, g.vel.z);
    anim.grounded = g.grounded;
    g.sync(dt, anim);
  }

  // ---- Personeel (winkels, bank) ----------------------------------------------------
  function spawnStaff(pos, heading, kind, opts) {
    var look = G.randomLook(kind === 'bewaker' ? 'beveiliging' : 'medewerker');
    var a = spawnPed(pos, look, 'staff', opts);
    a.heading = heading || 0;
    a.ai.state = 'staff';
    a.ai.kind = kind;
    a.ai.home = pos.clone();
    a.ai.homeH = heading || 0;
    N.staff.push(a);
    return a;
  }
  N.spawnStaff = spawnStaff;

  function staffAI(s, dt) {
    var ai = s.ai;
    var player = G.player;
    var anim = s.anim;
    anim.handsUp = false; anim.aim = false; anim.talk = false;
    if (!s.alive) { s.sync(dt); return; }
    if (ai.kind === 'bewaker' && ai.hostile) {
      gangLikeShoot(s, dt, anim);
    } else if (ai.robbed > 0) {
      ai.robbed -= dt;
      anim.handsUp = true;
      s.move(dt, 0, 0, false);
    } else {
      var back = steerTo(s, ai.home, 1.5, dt);
      if (back < 0.3) s.faceTo(ai.homeH, dt, 4);
      if (s.distTo(player.pos) < 4 && (!ai.greetT || G.time > ai.greetT) && !player.vehicle) {
        ai.greetT = G.time + 40;
        s.say(U.pick(['Welkom! Kan ik u helpen?', 'Goedendag, kijk gerust rond.', 'Hallo daar!']));
      }
      anim.talk = s.talkT > 0;
    }
    anim.speed = Math.hypot(s.vel.x, s.vel.z);
    anim.grounded = s.grounded;
    s.sync(dt, anim);
  }

  function gangLikeShoot(s, dt, anim) {
    var player = G.player;
    var dist = s.distTo(player.pos);
    var ai = s.ai;
    ai.losT = (ai.losT || 0) - dt;
    if (ai.losT <= 0) {
      ai.losT = 0.4;
      ai.los = dist < 60 && W.lineClear(tmp.set(s.pos.x, s.pos.y + 1.5, s.pos.z), tmp2.set(player.pos.x, player.pos.y + 1.2, player.pos.z));
    }
    if (!ai.los) steerTo(s, player.pos, 4.5, dt); else s.move(dt, 0, 0, false);
    if (ai.los && player.alive) {
      anim.aim = true;
      anim.weapon = s.holdType();
      s.faceTo(Math.atan2(player.pos.x - s.pos.x, player.pos.z - s.pos.z), dt, 10);
      ai.shootT = (ai.shootT || 1) - dt;
      if (ai.shootT <= 0) {
        ai.shootT = U.rand(0.5, 1.1);
        G.combat.fire(s, s.weapon || 'pistol', tmp.set(player.pos.x, player.pos.y + 1.2, player.pos.z), 3 + dist / 8);
      }
    }
  }

  // ---- Events: reacties op geweld en misdaad ---------------------------------------------
  function setupEvents() {
    G.on('gunshot', function (e) {
      N.peds.forEach(function (p) { if (p.alive && p.distTo(e.pos) < 45 && p.ai.state !== 'drive') scare(p, e.pos, 2); });
      N.cars.forEach(function (v) { if (v.ai && U.dist2(v.pos.x, v.pos.z, e.pos.x, e.pos.z) < 40) v.ai.mode = 'flee'; });
      if (e.shooter && e.shooter.isPlayer) N.crime(1, e.pos, 'Schieten in het openbaar');
    });
    G.on('explosion', function (e) {
      N.peds.forEach(function (p) { if (p.alive && p.distTo(e.pos) < 90) scare(p, e.pos, 3); });
      N.cars.forEach(function (v) { if (v.ai && U.dist2(v.pos.x, v.pos.z, e.pos.x, e.pos.z) < 80) v.ai.mode = 'flee'; });
      if (e.attacker && e.attacker.isPlayer) N.crime(e.cells > 20 ? 3 : 2, e.pos, 'Explosie');
    });
    G.on('actorDamaged', function (e) {
      var a = e.actor;
      if (!e.attacker || !e.attacker.isPlayer || a.isPlayer) return;
      if (a.team === 'cop') N.addWanted(Math.max(2, wanted.level), 'Agent aangevallen');
      else if (a.team === 'civ') {
        N.crime(1, a.pos, 'Mishandeling');
        if (a.alive && a.ai) {
          if (a.ai.tough && !G.player.weaponDrawn()) { a.ai.state = 'fight'; a.say(U.pick(PED_LINES.fight)); }
          else scare(a, G.player.pos, 3);
        }
      } else if (a.team === 'staff' && a.ai && a.ai.kind === 'bewaker') {
        a.ai.hostile = true;
        N.crime(2, a.pos, 'Bewaker aangevallen');
      }
    });
    G.on('actorKilled', function (e) {
      var a = e.actor;
      if (!e.attacker || !e.attacker.isPlayer) return;
      G.state.stats.kills++;
      if (a.team === 'cop') { wanted.copsKilled++; N.addWanted(Math.min(5, Math.max(3, wanted.level + 1)), 'Agent gedood'); }
      else if (a.team === 'civ' || a.team === 'staff') N.crime(Math.max(2, Math.min(5, wanted.level + (wanted.level >= 2 ? 1 : 0))), a.pos, 'Moord');
      // slachtoffers laten soms geld vallen
      if (a.team !== 'cop' && Math.random() < 0.6) G.emit('dropCash', { pos: a.pos.clone(), amount: U.randInt(60) + 10 });
    });
    G.on('vehicleExploded', function (e) {
      if (e.attacker && e.attacker.isPlayer) N.crime(e.v.spec.police ? 3 : 2, e.v.pos, 'Voertuig opgeblazen');
    });
    G.on('vehicleDamaged', function (e) {
      if (e.v.spec.police && e.attacker && e.attacker.isPlayer && wanted.level === 0) N.addWanted(1, 'Politieauto beschoten');
    });
    G.on('carCrash', function (e) {
      var pv = G.player.vehicle;
      if (!pv) return;
      var other = e.a === pv ? e.b : (e.b === pv ? e.a : null);
      if (!other) return;
      if (other.spec.police && e.force > 4) N.addWanted(Math.max(1, wanted.level), 'Politieauto geramd');
      if (other.ai && other.driver && other.driver.alive && e.force > 6 && (!other.ai.yell || G.time > other.ai.yell)) {
        other.ai.yell = G.time + 8;
        other.driver.say(U.pick(['Kun je niet rijden of zo?!', 'Mijn auto!', 'Idioot!']));
      }
    });
    G.on('carjack', function (e) {
      G.state.stats.carsStolen++;
      N.crime(e.police ? 3 : 1, e.pos, 'Autodiefstal');
    });
  }

  // ---- Aanrijdingen met voetgangers -----------------------------------------------
  function runOver(dt) {
    var vs = G.vehicles.list;
    for (var i = 0; i < vs.length; i++) {
      var v = vs[i];
      if (v.isHeli) continue;
      var sp = v.speed();
      if (sp < 3) continue;
      for (var k = 0; k < G.actors.length; k++) {
        var a = G.actors[k];
        if (!a.alive || a.vehicle || a.hitCooldown > G.time) continue;
        var dx = a.pos.x - v.pos.x, dz = a.pos.z - v.pos.z;
        var fx = Math.sin(v.heading), fz = Math.cos(v.heading);
        var al = dx * fx + dz * fz, lat = dx * fz - dz * fx;
        if (Math.abs(al) > v.halfL + 0.35 || Math.abs(lat) > v.halfW + 0.35 || Math.abs(a.pos.y - v.pos.y) > 1.5) continue;
        a.hitCooldown = G.time + 0.6;
        var dir = new T.Vector3(v.vel.x, 0, v.vel.z).normalize();
        dir.y = 0.35;
        dir.normalize();
        var dmg = sp * sp * 0.45;
        a.damage(dmg, v.driver, dir, 'auto');
        a.vel.addScaledVector(dir, sp * 0.8);
        a.vel.y += sp * 0.25;
        a.grounded = false;
        G.audio.sfx('punch', a.pos);
        v.vel.multiplyScalar(0.9);
        if (a.alive && a.ai && a.team === 'civ') scare(a, v.pos, 3);
      }
    }
  }

  // ---- Hoofd-update ----------------------------------------------------------------------
  var spawnT = 0;
  N.init = function () {
    W = G.world;
    setupEvents();
    // Personeel in winkels en bank
    var bank = W.specials.bank;
    if (bank) {
      for (var t = 0; t < 3; t++) spawnStaff(new T.Vector3(bank.x - 8 + t * 6, 0.2, bank.z - 2.5), 0, 'baliemedewerker');
      N.bankGuards = [
        spawnStaff(new T.Vector3(bank.x - 12, 0.2, bank.z + 7), Math.PI * 0.75, 'bewaker', { weapon: 'pistol', health: 140 }),
        spawnStaff(new T.Vector3(bank.x + 12, 0.2, bank.z + 7), -Math.PI * 0.75, 'bewaker', { weapon: 'pistol', health: 140 })
      ];
    }
    Object.keys(W.spots).forEach(function (k) {
      var s = W.spots[k];
      if (s.clerk) s.clerkActor = spawnStaff(s.clerk.clone(), 0, 'kassa');
    });
    var gun = W.specials.wapens;
    if (gun) W.spots.wapens.clerkActor = spawnStaff(new T.Vector3(gun.x, 0.2, gun.z - 2.2), 0, 'wapenhandelaar');
    var kl = W.specials.kleding;
    if (kl) spawnStaff(new T.Vector3(kl.x + 3, 0.2, kl.z - 0.2), 0, 'verkoper');
    var rm = W.specials.ramen;
    if (rm) spawnStaff(new T.Vector3(rm.x, 0.2, rm.z - 5), 0, 'kok');
    // vaste geparkeerde voertuigen (eigen auto, politie, helikopters)
    W.parkedSpawns.forEach(function (s) {
      var v = new G.Vehicle(s.type, s.color);
      v.pos.set(s.x, W.ground(s.x, s.z), s.z);
      v.heading = s.h;
      v.parked = true;
      v.fixed = true;
      v.owned = !!s.owned;
      v.sync();
    });
    W.heliSpawns.forEach(function (s) {
      var v = new G.Vehicle(s.type);
      v.pos.set(s.x, 0.2, s.z);
      v.heading = s.h;
      v.parked = true;
      v.fixed = true;
      v.sync();
    });
  };

  N.update = function (dt) {
    var player = G.player;
    var pp = player.pos;
    var L = lim();
    // wachtende meldingen van getuigen
    for (var w = wanted.pending.length - 1; w >= 0; w--) {
      if (G.time >= wanted.pending[w].t) {
        N.addWanted(wanted.pending[w].stars, wanted.pending[w].reason);
        wanted.pending.splice(w, 1);
      }
    }
    // spawnen (max één per frame)
    spawnT -= dt;
    if (spawnT <= 0) {
      spawnT = 0.15;
      var alivePeds = N.peds.filter(function (p) { return !p.vehicle; }).length;
      if (alivePeds < L.peds) spawnCivNear(pp);
      else if (N.cars.length < L.cars) spawnCarNear(pp);
      else if (N.parked.length < L.parked) spawnParkedNear(pp);
    }
    // politie bijsturen
    if (wanted.level > 0) {
      var aliveCars = N.copCars.filter(function (c) { return !c.wrecked && c.ai.mode !== 'leave'; }).length;
      if (aliveCars < Math.min(5, wanted.level + (wanted.level >= 3 ? 1 : 0)) && Math.random() < dt * 0.6) spawnCopCar();
      if (wanted.level >= 3 && (!heli || heli.wrecked || heli.ai.done) && Math.random() < dt * 0.2) spawnCopHeli();
      wanted.evade = G.time - wanted.lastSeen;
      var need = 10 + wanted.level * 5;
      if (wanted.evade > need) N.clearWanted('Je bent ontsnapt aan de politie!');
    }
    // updates
    var i;
    for (i = N.peds.length - 1; i >= 0; i--) {
      var p = N.peds[i];
      if (p.vehicle) continue;
      var dpp = p.distTo(pp);
      if (dpp > 160 || (!p.alive && (p.deadTime > 45 || dpp > 100))) {
        p.remove();
        N.peds.splice(i, 1);
        continue;
      }
      updatePed(p, dt);
    }
    for (i = N.cars.length - 1; i >= 0; i--) {
      var v = N.cars[i];
      if (v.removed) { N.cars.splice(i, 1); continue; }
      var dv = U.dist2(v.pos.x, v.pos.z, pp.x, pp.z);
      if (player.vehicle === v || v.stolen) {
        // gestolen auto's horen niet meer bij het verkeer
        N.cars.splice(i, 1);
        continue;
      }
      if (dv > 280 || (v.wrecked && dv > 120)) {
        if (v.driver) { var d = v.driver; d.remove(); var di = N.peds.indexOf(d); if (di >= 0) N.peds.splice(di, 1); }
        v.remove();
        N.cars.splice(i, 1);
        continue;
      }
      trafficDrive(v, dt);
      if (v.driver) v.driver.sync(dt, v.driver.anim);
    }
    for (i = N.parked.length - 1; i >= 0; i--) {
      var pv = N.parked[i];
      if (pv.removed) { N.parked.splice(i, 1); continue; }
      if (player.vehicle === pv || pv.stolen) { N.parked.splice(i, 1); continue; }
      if (U.dist2(pv.pos.x, pv.pos.z, pp.x, pp.z) > 220) { pv.remove(); N.parked.splice(i, 1); continue; }
    }
    // alle overige voertuigen zonder AI (geparkeerd, verlaten) krijgen physics zodat ze geduwd kunnen worden
    G.vehicles.list.forEach(function (veh) {
      if (veh === player.vehicle || veh.ai) return;
      if (veh.isHeli && veh.landed && veh.rotor < 0.02 && veh.vel.lengthSq() < 0.01) { veh.sync(); return; }
      if (!veh.isHeli && veh.vel.lengthSq() < 0.001 && !veh.burn && !veh.burnT) { veh.sync(); return; }
      veh.update(dt, { throttle: 0, steer: 0, handbrake: true });
    });
    for (i = N.copCars.length - 1; i >= 0; i--) {
      var cc = N.copCars[i];
      var dc = U.dist2(cc.pos.x, cc.pos.z, pp.x, pp.z);
      if (cc.removed || player.vehicle === cc) { N.copCars.splice(i, 1); continue; }
      if ((cc.ai.mode === 'leave' || cc.wrecked) && dc > 160) {
        cc.ai.cops.forEach(function (c) { var ci = N.cops.indexOf(c); if (ci >= 0) N.cops.splice(ci, 1); c.remove(); });
        cc.remove();
        N.copCars.splice(i, 1);
        continue;
      }
      copCarAI(cc, dt);
      // sirene-geluid voor de dichtstbijzijnde wagens
      if (cc.siren && dc < 160) {
        if (!cc.sirenSound) cc.sirenSound = G.audio.loop('siren', cc.pos);
        cc.sirenSound.setPos(cc.pos);
        cc.sirenSound.set({ on: true, yelp: dc < 40 });
      } else if (cc.sirenSound) { cc.sirenSound.stop(); cc.sirenSound = null; }
    }
    for (i = N.cops.length - 1; i >= 0; i--) {
      var c = N.cops[i];
      if (c.removed) { N.cops.splice(i, 1); continue; }
      if (!c.alive && c.deadTime > 40) { c.remove(); N.cops.splice(i, 1); continue; }
      if (c.vehicle && c.vehicle.isHeli) { c.sync(dt, c.anim); continue; }
      copFootAI(c, dt);
    }
    if (heli) {
      heliAI(heli, dt);
      if (heli.ai.done || (heli.wrecked && U.dist2(heli.pos.x, heli.pos.z, pp.x, pp.z) > 200)) {
        if (heli.heliSound) heli.heliSound.stop();
        if (heli.spot) { G.scene.remove(heli.spot); G.scene.remove(heli.spot.target); }
        [heli.driver, heli.passenger].forEach(function (a) { if (a) { var ai2 = N.cops.indexOf(a); if (ai2 >= 0) N.cops.splice(ai2, 1); a.remove(); } });
        heli.remove();
        heli = null;
      }
    }
    for (i = N.gang.length - 1; i >= 0; i--) {
      var g = N.gang[i];
      if (g.removed) { N.gang.splice(i, 1); continue; }
      if (!g.alive && g.deadTime > 60) { g.remove(); N.gang.splice(i, 1); continue; }
      gangAI(g, dt);
    }
    for (i = 0; i < N.staff.length; i++) staffAI(N.staff[i], dt);
    G.vehicles.collidePairs();
    runOver(dt);
  };

  // Alles rondom de speler opruimen (bijv. na respawn)
  N.reset = function () {
    N.clearWanted();
    N.peds.slice().forEach(function (p) { p.remove(); });
    N.peds = [];
    N.cars.slice().forEach(function (v) { if (v.driver) v.driver.remove(); v.remove(); });
    N.cars = [];
    N.copCars.slice().forEach(function (v) { v.remove(); });
    N.copCars = [];
    N.cops.slice().forEach(function (c) { c.remove(); });
    N.cops = [];
    if (heli) {
      if (heli.heliSound) heli.heliSound.stop();
      if (heli.spot) { G.scene.remove(heli.spot); G.scene.remove(heli.spot.target); }
      heli.remove();
      heli = null;
    }
  };
})();
