/*
 * missions.js - non-lineaire missies (vrij te kiezen via markers), checkpoints/ringen,
 * en vrije activiteiten: winkels en de bank overvallen.
 */
(function () {
  'use strict';

  var G = window.G, T = G.T, U = G.U;
  var M = G.missions = { active: null, markers: [] };
  var W;

  // ---- Visuele markers --------------------------------------------------------------
  function beam(pos, color, h) {
    var g = new T.Group();
    var col = new T.Color(color);
    var m = new T.Mesh(new T.CylinderGeometry(1.4, 1.4, h || 30, 24, 1, true),
      new T.MeshBasicMaterial({ color: col.clone().multiplyScalar(1.2), transparent: true, opacity: 0.22, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
    m.position.y = (h || 30) / 2;
    g.add(m);
    var ring = new T.Mesh(new T.TorusGeometry(1.6, 0.08, 8, 40), new T.MeshBasicMaterial({ color: col.clone().multiplyScalar(2.5) }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.15;
    g.add(ring);
    g.position.copy(pos);
    G.scene.add(g);
    g.userData.ring = ring;
    return g;
  }
  M.beam = beam;

  function airRing(pos, color) {
    var m = new T.Mesh(new T.TorusGeometry(9, 0.6, 10, 48), new T.MeshBasicMaterial({ color: new T.Color(color).multiplyScalar(2.2), transparent: true, opacity: 0.85 }));
    m.position.copy(pos);
    G.scene.add(m);
    return m;
  }

  // ---- Missiedefinities ------------------------------------------------------------
  function hasGun() {
    return ['pistol', 'smg', 'shotgun', 'rifle', 'sniper', 'rpg'].some(function (w) { return G.state.weapons[w]; });
  }

  var DEFS = [];

  DEFS.push({
    id: 'glans', title: 'Gestolen Glans', color: '#ff7043', reward: 2500,
    desc: 'Een verzamelaar wil die knalrode Vortex GT die bij de boulevard staat. Steel hem en lever hem zonder al te veel krassen af bij de Havengarage.',
    pos: function () { return new T.Vector3(-120, 0.2, 92); },
    setup: function (c) {
      var v = new G.Vehicle('vortex', '#d50000');
      v.pos.set(-330, 0.2, 614);
      v.heading = Math.PI / 2;
      v.parked = true;
      v.sync();
      c.car = v;
      c.step = 0;
      c.time = 300;
    },
    update: function (c, dt) {
      c.time -= dt;
      if (c.car.wrecked) return 'De Vortex is vernield.';
      if (c.time <= 0) return 'Te laat! De koper is weg.';
      var p = G.player;
      if (c.step === 0) {
        c.obj('Steel de rode Vortex GT bij de boulevard', c.car.pos);
        if (p.vehicle === c.car) c.step = 1;
      } else if (c.step === 1) {
        var gp = W.spots.havengarage.pos;
        c.obj('Breng de Vortex naar de Havengarage (schade: ' + Math.round(100 - c.car.health / 10) + '%)', gp);
        if (p.vehicle !== c.car) c.obj('Stap weer in de Vortex!', c.car.pos);
        else if (c.car.pos.distanceTo(gp) < 7 && c.car.speed() < 2) {
          if (c.car.health < 450) return 'De auto is te zwaar beschadigd. De verzamelaar weigert.';
          c.bonus = Math.round(c.car.health);
          return true;
        }
      }
      c.timerText = c.time;
    },
    cleanup: function (c) {
      if (c.car && !c.car.removed && G.player.vehicle !== c.car) {
        setTimeout(function () { if (G.player.vehicle !== c.car) c.car.remove(); }, 20000);
      }
    }
  });

  DEFS.push({
    id: 'koerier', title: 'Spoedpakket', color: '#4fc3f7', reward: 900, repeat: true,
    desc: 'Haal een pakket op bij de Buurtsuper en bezorg het op drie adressen voordat de tijd om is. Snelheid loont.',
    pos: function () { return new T.Vector3(W.spots.super0.pos.x, 0.2, W.spots.super0.pos.z + 9); },
    setup: function (c) {
      c.stops = [];
      var base = W.spots.super0.pos;
      for (var i = 0; i < 3; i++) {
        var bl = U.pick(W.blocks.filter(function (b) { return b.district !== 'park' && U.dist2(b.cx, b.cz, base.x, base.z) < 450 && U.dist2(b.cx, b.cz, base.x, base.z) > 120; }));
        c.stops.push(new T.Vector3(bl.cx + U.pick([-41, 41]), 0.2, bl.cz + U.rand(-20, 20)));
      }
      c.idx = 0;
      c.time = 210;
    },
    update: function (c, dt) {
      c.time -= dt;
      if (c.time <= 0) return 'De klanten hebben te lang gewacht.';
      var t = c.stops[c.idx];
      c.obj('Bezorg pakket ' + (c.idx + 1) + ' van 3', t);
      if (G.player.distTo(t) < 4) {
        G.audio.sfx('pickup');
        G.addMoney(150, 'Fooi');
        c.idx++;
        if (c.idx >= 3) { c.bonus = Math.round(c.time * 3); return true; }
      }
      c.timerText = c.time;
    }
  });

  DEFS.push({
    id: 'kraak', title: 'De Goudmunt-kraak', color: '#ffd54f', reward: 15000,
    desc: 'De grote klapper. Kraak de kluis van de Goudmunt Bank, pak de buit en schud de politie af. Je hebt een vuurwapen nodig. Tip: een kogelwerend vest van Stijlzaak helpt.',
    req: function () { return hasGun() ? null : 'Je hebt een vuurwapen nodig (Kaliber Wapenhandel).'; },
    pos: function () { return new T.Vector3(W.specials.bank.x, 0.2, W.specials.bank.z + 16); },
    setup: function (c) { c.step = 0; },
    update: function (c, dt) {
      var R = M.bank;
      if (c.step === 0) {
        c.obj('Ga de bank binnen en kraak de kluis (E bij de kluisdeur)', W.spots['bank.vault'].pos);
        if (R.state === 'drilling') c.step = 1;
      } else if (c.step === 1) {
        c.obj('Houd stand bij de kluis: ' + Math.round(R.progress * 100) + '%', W.spots['bank.vault'].pos);
        if (R.state === 'open') c.step = 2;
        if (R.state === 'idle') c.step = 0;
      } else if (c.step === 2) {
        c.obj('Pak de buit uit de kluis (E)', W.spots['bank.loot'].pos);
        if (R.state === 'looted') c.step = 3;
      } else {
        c.obj('Schud de politie af (' + G.npc.wanted.level + ' ★)', null);
        if (G.npc.wanted.level === 0) return true;
      }
    }
  });

  DEFS.push({
    id: 'sloop', title: 'Sloopbevel', color: '#ff8a65', reward: 6000,
    desc: 'De gemeente wil van de vervallen fabriek af. Je hebt een legale sloopvergunning: blaas hem op met granaten of een raketwerper (Kaliber). Zorg dat minstens 60% verdwenen is.',
    pos: function () { return new T.Vector3(W.factory.x, 0.2, W.factory.z + 24); },
    setup: function (c) { M.legalDemo = W.factory; },
    update: function (c) {
      var r = W.destroyedRatio(W.factory);
      c.obj('Sloop de fabriek: ' + Math.round(r * 100) + '% / 60%', new T.Vector3(W.factory.x, 0.2, W.factory.z));
      if (r >= 0.6) return true;
    },
    cleanup: function () { M.legalDemo = null; }
  });

  DEFS.push({
    id: 'vlieg', title: 'Vliegles', color: '#80deea', reward: 3500, repeat: true,
    desc: 'Pak een helikopter op de Heliport en vlieg door alle ringen boven de stad. Space = omhoog, Shift = omlaag, W/S = voor/achter kantelen, A/D = draaien, Q/E = zijwaarts.',
    pos: function () { return new T.Vector3(350, 0.2, -20); },
    setup: function (c) {
      c.rings = [[350, 30, -150], [200, 60, -250], [0, 90, -200], [-200, 70, -100], [-250, 50, 100], [-100, 120, 200], [100, 80, 150], [300, 40, 0]].map(function (p) {
        return new T.Vector3(p[0], p[1], p[2]);
      });
      c.idx = 0;
      c.time = 240;
      c.mesh = null;
    },
    update: function (c, dt) {
      var p = G.player;
      if (!p.vehicle || !p.vehicle.isHeli) {
        c.obj('Stap in een helikopter op de Heliport', new T.Vector3(350, 0.2, -50));
        return;
      }
      c.time -= dt;
      if (c.time <= 0) return 'De tijd is om.';
      var r = c.rings[c.idx];
      if (!c.mesh) { c.mesh = airRing(r, '#80deea'); c.mesh.lookAt(c.rings[(c.idx + 1) % c.rings.length]); }
      c.mesh.rotation.z += dt;
      c.obj('Vlieg door ring ' + (c.idx + 1) + ' van ' + c.rings.length, r);
      if (p.vehicle.pos.distanceTo(r) < 10) {
        G.audio.sfx('pickup');
        G.scene.remove(c.mesh);
        c.mesh = null;
        c.idx++;
        if (c.idx >= c.rings.length) { c.bonus = Math.round(c.time * 8); return true; }
      }
      c.timerText = c.time;
    },
    cleanup: function (c) { if (c.mesh) G.scene.remove(c.mesh); }
  });

  DEFS.push({
    id: 'race', title: 'Havenrace', color: '#ab47bc', reward: 3000, repeat: true,
    desc: 'Straatrace door de haven en het centrum tegen drie lokale coureurs. Kom aan met een auto en win. Hoe sneller je auto, hoe beter je kansen.',
    req: function () { return G.player.vehicle && !G.player.vehicle.isHeli ? null : 'Je moet in een auto zitten om mee te racen.'; },
    pos: function () { return new T.Vector3(300, 0, 100); },
    vehicle: true,
    setup: function (c) {
      var route = [[300, 100], [400, 100], [400, 300], [600, 300], [600, 500], [200, 500], [200, 300], [0, 300], [0, 100], [300, 100]];
      c.cps = route.map(function (p) { return new T.Vector3(p[0], 0, p[1]); });
      c.idx = 1;
      c.rivals = [];
      var pv = G.player.vehicle;
      pv.pos.set(300, pv.pos.y, 100 - 3.8);
      pv.heading = Math.PI / 2;
      pv.vel.set(0, 0, 0);
      for (var i = 0; i < 3; i++) {
        var v = new G.Vehicle(U.pick(['vortex', 'donder', 'vortex']));
        v.pos.set(300 - 9 - i * 9, 0, 100 + (i % 2 ? 3.8 : -3.8));
        v.heading = Math.PI / 2;
        var drv = G.npc.spawnPed(v.pos.clone(), null, 'civ');
        drv.enterVehicle(v, 0);
        v.race = { idx: 1, done: false, skill: U.rand(0.82, 0.97) };
        c.rivals.push(v);
      }
      c.count = 3;
      c.finished = [];
      c.beam = null;
    },
    update: function (c, dt) {
      var p = G.player;
      if (!p.vehicle) return 'Je hebt je auto verlaten.';
      if (c.count > 0) {
        c.count -= dt;
        c.obj('Start over ' + Math.ceil(c.count) + '…', c.cps[1]);
        p.vehicle.vel.multiplyScalar(0.5);
        c.rivals.forEach(function (v) { v.update(dt, { throttle: 0, handbrake: true }); if (v.driver) v.driver.sync(dt, v.driver.anim); });
        return;
      }
      // rivalen besturen
      c.rivals.forEach(function (v) {
        if (v.race.done || v.wrecked) { v.update(dt, { throttle: 0, handbrake: true }); if (v.driver) v.driver.sync(dt, v.driver.anim); return; }
        var t = c.cps[v.race.idx];
        var desired = Math.atan2(t.x - v.pos.x, t.z - v.pos.z);
        var diff = U.angDiff(v.heading, desired);
        var nxt = c.cps[Math.min(c.cps.length - 1, v.race.idx + 1)];
        var dist = U.dist2(v.pos.x, v.pos.z, t.x, t.z);
        var sharp = Math.abs(U.angDiff(desired, Math.atan2(nxt.x - t.x, nxt.z - t.z)));
        var maxS = (dist < 35 && sharp > 0.8 ? 14 : v.spec.max) * v.race.skill;
        var thr = v.forwardSpeed() < maxS ? 1 : -0.6;
        v.update(dt, { throttle: thr, steer: U.clamp(diff * 2.5, -1, 1), handbrake: Math.abs(diff) > 0.9 && v.speed() > 15 });
        if (v.driver) v.driver.sync(dt, v.driver.anim);
        if (dist < 12) {
          v.race.idx++;
          if (v.race.idx >= c.cps.length) { v.race.done = true; c.finished.push(v); }
        }
      });
      var t = c.cps[c.idx];
      if (!c.beam) c.beam = beam(t, '#ab47bc', 20);
      var pos = 1 + c.rivals.filter(function (v) { return v.race.idx > c.idx || v.race.done; }).length;
      c.obj('Checkpoint ' + c.idx + '/' + (c.cps.length - 1) + ' · Positie ' + pos + '/4', t);
      if (U.dist2(p.vehicle.pos.x, p.vehicle.pos.z, t.x, t.z) < 12) {
        G.audio.sfx('pickup');
        G.scene.remove(c.beam);
        c.beam = null;
        c.idx++;
        if (c.idx >= c.cps.length) {
          if (c.finished.length === 0) return true;
          return 'Je werd ' + (c.finished.length + 1) + 'e. Alleen winnaars krijgen geld!';
        }
      }
    },
    cleanup: function (c) {
      if (c.beam) G.scene.remove(c.beam);
      (c.rivals || []).forEach(function (v) {
        setTimeout(function () { if (v.driver) v.driver.remove(); if (!v.removed && G.player.vehicle !== v) v.remove(); }, 8000);
      });
    }
  });

  DEFS.push({
    id: 'bouw', title: 'Bouwopdracht: tuinhuis', color: '#ffb300', reward: 4500,
    desc: 'Een klant wil een tuinhuisje op de bouwplaats. Bouw het volgens de blauwe blauwdruk: muren van steen/hout/beton, ramen van glas en een dak van dakpannen. Druk op B op de bouwplaats.',
    pos: function () { return new T.Vector3(W.plot.x0 + 20, 0.2, W.plot.z0 + 46); },
    setup: function () { G.build.setBlueprint(G.build.houseBlueprint()); },
    update: function (c) {
      var pr = G.build.blueprintProgress();
      c.obj('Bouw het tuinhuis volgens de blauwdruk: ' + Math.round(pr * 100) + '% (B = bouwmodus)', new T.Vector3(W.plot.x0 + 20, 0.2, W.plot.z0 + 20));
      if (pr >= 1) return true;
    },
    cleanup: function () { G.build.setBlueprint(null); }
  });

  DEFS.push({
    id: 'bende', title: 'Kraaiennest', color: '#e53935', reward: 7000,
    desc: 'De bende "De Kraaien" terroriseert de haven. Ruim hun terrein op. Ze zijn zwaarbewapend, dus neem een stevig wapen en bepantsering mee.',
    req: function () { return hasGun() ? null : 'Je hebt een vuurwapen nodig.'; },
    pos: function () { return new T.Vector3(W.gangYard.x - 60, 0.2, W.gangYard.z + 45); },
    setup: function (c) { c.gang = G.npc.spawnGang(W.gangYard, 8, false); },
    update: function (c) {
      var left = c.gang.filter(function (g) { return g.alive; }).length;
      c.obj('Schakel de Kraaien uit: nog ' + left + ' over', W.gangYard);
      if (left === 0) return true;
    }
  });

  DEFS.push({
    id: 'date', title: 'Een bijzondere ontmoeting', color: '#ff8fc8', reward: 750,
    desc: 'In het stadspark zit vaak een meisje met lavendelkleurig haar te tekenen. Misschien moet je eens hallo zeggen…',
    pos: function () { return new T.Vector3(-150, 0.2, 196); },
    setup: function () {},
    update: function (c) {
      var s = G.gf.state();
      if (!s.met) c.obj('Zeg hallo tegen Mika in het park (tussen 9:00 en 14:00)', W.parkBench);
      else if (s.stage < 2) c.obj('Leer Mika beter kennen: ' + Math.round(s.affection) + '/35 genegenheid (praten, complimenten, cadeaus)', null);
      else if (!s.dates) c.obj(s.pendingDate ? 'Ga naar jullie date: ' + G.gf.DATES[s.pendingDate.place].name : 'Vraag Mika mee op een date', s.pendingDate ? G.gf.placePos(s.pendingDate.place) : null);
      else return true;
    }
  });

  DEFS.push({
    id: 'taxi', title: 'Taxidienst', color: '#ffeb3b', reward: 0, repeat: true,
    desc: 'Rijd met een taxi en vervoer passagiers door de stad. Hoe sneller (en heler) je ze afzet, hoe hoger de fooi. Steel een taxi of zoek er een.',
    req: function () { return G.player.vehicle && G.player.vehicle.type === 'taxi' ? null : 'Je moet in een taxi zitten.'; },
    pos: function () { return new T.Vector3(150, 0, -100); },
    vehicle: true,
    setup: function (c) { c.fares = 0; c.state = 'zoek'; c.earned = 0; },
    update: function (c, dt) {
      var p = G.player;
      if (!p.vehicle || p.vehicle.type !== 'taxi') return c.fares ? true : 'Je bent uit de taxi gestapt.';
      if (c.state === 'zoek') {
        var bl = U.pick(W.blocks.filter(function (b) { return U.dist2(b.cx, b.cz, p.pos.x, p.pos.z) < 300 && U.dist2(b.cx, b.cz, p.pos.x, p.pos.z) > 80; }));
        c.pick = new T.Vector3(bl.cx + U.pick([-41, 41]), 0.2, bl.cz + U.rand(-25, 25));
        c.ped = G.npc.spawnPed(c.pick.clone(), null, 'civ');
        c.ped.ai.state = 'idle';
        c.ped.ai.timer = 999;
        G.npc.peds.push(c.ped);
        c.state = 'ophalen';
      } else if (c.state === 'ophalen') {
        c.obj('Haal de passagier op (' + c.fares + ' ritten, ' + U.money(c.earned) + ')', c.pick);
        if (!c.ped.alive) { c.state = 'zoek'; return; }
        if (p.vehicle.pos.distanceTo(c.pick) < 8 && p.vehicle.speed() < 2) {
          c.ped.enterVehicle(p.vehicle, 1);
          var dest = U.pick(W.blocks.filter(function (b) { return U.dist2(b.cx, b.cz, p.pos.x, p.pos.z) > 250 && U.dist2(b.cx, b.cz, p.pos.x, p.pos.z) < 700; }));
          c.dest = new T.Vector3(dest.cx + U.pick([-41, 41]), 0.2, dest.cz);
          c.time = 30 + c.dest.distanceTo(p.pos) / 9;
          c.hp = p.vehicle.health;
          c.state = 'rijden';
          c.ped.say(U.pick(['Naar dit adres graag, en snel!', 'Goedendag! Ik heb haast.', 'Rijd maar, ik wijs de weg.']));
        }
      } else if (c.state === 'rijden') {
        c.time -= dt;
        c.obj('Breng de passagier naar de bestemming (' + Math.max(0, Math.round(c.time)) + 's voor fooi)', c.dest);
        if (p.vehicle.pos.distanceTo(c.dest) < 9 && p.vehicle.speed() < 2) {
          var base = Math.round(c.dest.distanceTo(c.pick) * 0.9 + 40);
          var tip = c.time > 0 ? Math.round(base * 0.5) : 0;
          if (p.vehicle.health < c.hp - 150) tip = 0;
          G.addMoney(base + tip, 'Taxirit');
          G.audio.sfx('cash');
          G.emit('toast', { text: '🚕 Rit voltooid: ' + U.money(base) + (tip ? ' + fooi ' + U.money(tip) : ''), kind: 'good' });
          c.earned += base + tip;
          c.fares++;
          c.ped.exitVehicle();
          c.ped.ai.state = 'walk';
          c.state = 'zoek';
        }
      }
    }
  });
  M.defs = DEFS;

  // ---- Missiebeheer ----------------------------------------------------------------
  M.available = function (d) {
    if (M.active) return false;
    if (G.state.missions[d.id] && !d.repeat) return false;
    return true;
  };

  M.start = function (d) {
    var why = d.req ? d.req() : null;
    if (why) { G.emit('toast', { text: why, kind: 'bad' }); G.audio.sfx('error'); return; }
    var ctx = {
      def: d, objText: '', wp: null, timerText: null,
      obj: function (text, wp) {
        this.objText = text;
        this.wp = wp || null;
      }
    };
    M.active = ctx;
    d.setup(ctx);
    G.audio.sfx('notify');
    G.emit('missionStart', d);
    refreshMarkers();
  };

  M.end = function (success, reason) {
    var c = M.active;
    if (!c) return;
    var d = c.def;
    if (d.cleanup) d.cleanup(c);
    M.active = null;
    if (success) {
      var total = d.reward + (c.bonus || 0);
      if (total) G.addMoney(total, 'Missie: ' + d.title);
      G.state.missions[d.id] = (G.state.missions[d.id] || 0) + 1;
      G.state.stats.missions++;
      G.audio.sfx('mission');
      G.emit('missionComplete', { def: d, reward: total });
      G.saveGame();
    } else {
      G.audio.sfx('fail');
      G.emit('missionFailed', { def: d, reason: reason });
    }
    refreshMarkers();
  };

  M.abort = function () { if (M.active) M.end(false, 'Missie afgebroken.'); };

  M.update = function (dt) {
    // markers laten pulseren
    M.markers.forEach(function (m) {
      m.mesh.userData.ring.scale.setScalar(1 + Math.sin(G.time * 3) * 0.08);
    });
    var c = M.active;
    if (!c) return;
    var r = c.def.update(c, dt);
    if (r === true) M.end(true);
    else if (typeof r === 'string') M.end(false, r);
  };

  // Welke missie-start is dichtbij (voor de E-prompt)?
  M.nearbyStart = function (p) {
    for (var i = 0; i < M.markers.length; i++) {
      var m = M.markers[i];
      var r = m.def.vehicle ? 7 : 2.6;
      if (U.dist2(p.x, p.z, m.pos.x, m.pos.z) < r && Math.abs(p.y - m.pos.y) < 3) return m.def;
    }
    return null;
  };

  function refreshMarkers() {
    M.markers.forEach(function (m) { G.scene.remove(m.mesh); });
    M.markers = [];
    if (M.active) return;
    DEFS.forEach(function (d) {
      if (!M.available(d)) return;
      var p = d.pos();
      p.y = W.surface(p.x, p.z, 5);
      M.markers.push({ def: d, pos: p, mesh: beam(p, d.color, 40) });
    });
  }
  M.refreshMarkers = refreshMarkers;

  // ---- Overvallen ---------------------------------------------------------------------
  // Buurtsuper: richt een wapen op de kassamedewerker
  M.store = { robbing: null, t: 0 };
  M.bank = { state: 'idle', progress: 0, alarm: null };

  M.updateRobberies = function (dt) {
    var p = G.player;
    var S = M.store;
    // buurtsupers
    if (!S.robbing && p.aiming && p.weaponDrawn() && !p.vehicle) {
      Object.keys(W.spots).forEach(function (k) {
        var sp = W.spots[k];
        if (!sp.clerkActor || !sp.clerkActor.alive || S.robbing) return;
        var cool = G.state.robbed && G.state.robbed[k] === G.state.day;
        if (cool) return;
        if (p.distTo(sp.clerkActor.pos) < 7 && W.interiorAt(p.pos) === sp.store) {
          S.robbing = sp;
          S.t = 0;
          sp.clerkActor.ai.robbed = 999;
          sp.clerkActor.say(U.pick(['Niet schieten! Neem alles maar!', 'Oké, oké! Rustig aan!', 'Ik heb kinderen thuis!']));
          G.emit('toast', { text: 'Overval! Blijf richten tot de kassa leeg is…', kind: 'warn' });
        }
      });
    }
    if (S.robbing) {
      var c = S.robbing.clerkActor;
      if (!c.alive || p.distTo(c.pos) > 10 || p.vehicle) {
        S.robbing.clerkActor.ai.robbed = 3;
        S.robbing = null;
        G.emit('toast', { text: 'Overval mislukt.', kind: 'bad' });
      } else {
        S.t += dt * (p.aiming ? 1 : 0.4);
        G.emit('progress', { label: 'Kassa leeghalen', value: S.t / 6 });
        if (S.t >= 6) {
          var loot = U.randInt(600) + 300;
          G.addMoney(loot, 'Overval');
          G.fx.cashBurst(c.pos);
          G.audio.sfx('cash');
          G.state.robbed = G.state.robbed || {};
          G.state.robbed[Object.keys(W.spots).filter(function (k) { return W.spots[k] === S.robbing; })[0]] = G.state.day;
          G.state.stats.robberies++;
          G.npc.addWanted(2, 'Winkeloverval');
          G.emit('toast', { text: '💰 Buit: ' + U.money(loot) + '. Wegwezen!', kind: 'good' });
          c.ai.robbed = 20;
          S.robbing = null;
          G.emit('progress', null);
        }
      }
    }
    // bank
    var B = M.bank;
    if (B.state === 'drilling') {
      var vs = W.spots['bank.vault'];
      if (p.distTo(vs.pos) < 6 && p.alive) {
        B.progress += dt / 22;
        G.emit('progress', { label: 'Kluis kraken', value: B.progress });
        if (Math.random() < dt * 3) G.fx.spark(W.specials.bank.vaultDoor.getWorldPosition(new T.Vector3()), 6, 4);
      }
      if (B.progress >= 1) {
        B.state = 'open';
        G.emit('progress', null);
        G.world.removeCollider(W.vaultCollider);
        G.audio.sfx('door', vs.pos);
        G.emit('toast', { text: 'De kluis is open! Pak de buit!', kind: 'good' });
      }
    }
    if (B.state === 'open' || B.state === 'looted') {
      var door = W.specials.bank.vaultDoor;
      door.rotation.z = U.damp(door.rotation.z, 1.4, 2, dt);
      door.position.x = U.damp(door.position.x, W.specials.bank.x + 13.2, 2, dt);
    }
    if (B.alarm && G.npc.wanted.level === 0 && B.state === 'looted') { B.alarm.stop(); B.alarm = null; }
  };

  M.startBankJob = function () {
    var B = M.bank;
    if (G.state.bankCooldownDay > G.state.day) { G.emit('toast', { text: 'De bank is nog zwaar beveiligd na de vorige kraak. Kom over een paar dagen terug.', kind: 'bad' }); return; }
    if (!G.player.weaponDrawn()) { G.emit('toast', { text: 'Je hebt een wapen in je hand nodig om de kluis te kraken.', kind: 'bad' }); G.audio.sfx('error'); return; }
    B.state = 'drilling';
    B.progress = 0;
    G.audio.sfx('alarm', W.spots['bank.vault'].pos);
    B.alarm = G.audio.loop('siren', W.spots['bank.vault'].pos);
    B.alarm.set({ on: true, yelp: true });
    G.npc.addWanted(3, 'Bankoverval');
    (G.npc.bankGuards || []).forEach(function (g) { g.ai.hostile = true; });
    G.npc.staff.forEach(function (s) { if (s.ai.kind === 'baliemedewerker') s.ai.robbed = 999; });
    G.emit('toast', { text: '🚨 ALARM! Houd stand bij de kluis tot hij open is.', kind: 'warn' });
  };

  M.lootBank = function () {
    var B = M.bank;
    if (B.state !== 'open') return;
    var loot = 18000 + U.randInt(9000);
    G.addMoney(loot, 'Bankkraak');
    G.fx.cashBurst(G.player.pos);
    G.audio.sfx('cash');
    B.state = 'looted';
    G.state.bankCooldownDay = G.state.day + 3;
    G.state.stats.robberies++;
    G.npc.addWanted(4, 'Bankoverval');
    G.emit('toast', { text: '💰 BUIT: ' + U.money(loot) + '! Ontsnap nu!', kind: 'good' });
  };

  // Na een dag is de bank weer "normaal"
  M.resetBank = function () {
    var B = M.bank;
    if (B.state === 'looted' && G.state.day >= G.state.bankCooldownDay) {
      B.state = 'idle';
      B.progress = 0;
      var it = W.specials.bank;
      it.vaultDoor.rotation.z = 0;
      it.vaultDoor.position.x = it.x + 11;
      W.vaultCollider.off = false;
    }
  };

  M.init = function () {
    W = G.world;
    // legale sloop telt niet als misdaad
    G.on('explosion', function (e) {
      if (M.legalDemo && U.dist2(e.pos.x, e.pos.z, M.legalDemo.x, M.legalDemo.z) < 40) {
        G.npc.wanted.pending = [];
        if (G.npc.wanted.level <= 2) G.npc.clearWanted('Legale sloop: de politie laat je met rust.');
      }
    });
    G.on('busted', function () { if (M.active) M.end(false, 'Gearresteerd.'); });
    G.on('wasted', function () { if (M.active) M.end(false, 'Je bent neergegaan.'); });
    refreshMarkers();
  };
})();
