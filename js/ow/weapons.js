/*
 * weapons.js - wapens (modellen, eigenschappen), schieten (hitscan met spreiding),
 * granaten en raketten met physics, explosies met schade, kettingreacties en sloop.
 */
(function () {
  'use strict';

  var G = window.G, T = G.T, U = G.U;

  G.WEAPONS = {
    fist: { name: 'Vuisten', melee: true, dmg: 18, rate: 2.4, hold: 'none', slot: 1, price: 0 },
    pistol: { name: 'Pistool', dmg: 26, rate: 4.5, spread: 0.012, mag: 12, reload: 1.3, range: 140, price: 600, ammoPrice: 3, ammoPack: 36, sound: 'pistol', hold: 'pistol', slot: 2, recoil: 0.025 },
    smg: { name: 'Machinepistool', dmg: 17, rate: 12, auto: true, spread: 0.032, mag: 30, reload: 1.8, range: 100, price: 1800, ammoPrice: 2, ammoPack: 90, sound: 'smg', hold: 'pistol', slot: 3, recoil: 0.012 },
    shotgun: { name: 'Jachtgeweer', dmg: 13, pellets: 9, rate: 1.1, spread: 0.085, mag: 6, reload: 2.4, range: 50, price: 2400, ammoPrice: 6, ammoPack: 24, sound: 'shotgun', hold: 'rifle', slot: 4, recoil: 0.07 },
    rifle: { name: 'Aanvalsgeweer', dmg: 29, rate: 9, auto: true, spread: 0.018, mag: 30, reload: 2.0, range: 220, price: 4500, ammoPrice: 4, ammoPack: 90, sound: 'rifle', hold: 'rifle', slot: 5, recoil: 0.015 },
    sniper: { name: 'Precisiegeweer', dmg: 110, rate: 0.8, spread: 0.001, mag: 5, reload: 2.6, range: 600, price: 7500, ammoPrice: 15, ammoPack: 15, sound: 'sniper', hold: 'rifle', scope: true, slot: 6, recoil: 0.06 },
    rpg: { name: 'Raketwerper', rocket: true, rate: 0.55, mag: 1, reload: 2.6, range: 500, price: 12000, ammoPrice: 250, ammoPack: 3, sound: 'rpg', hold: 'heavy', slot: 7, recoil: 0.05 },
    grenade: { name: 'Granaat', throw: true, rate: 1, price: 150, hold: 'none', slot: 8 }
  };
  G.WEAPON_ORDER = ['fist', 'pistol', 'smg', 'shotgun', 'rifle', 'sniper', 'rpg', 'grenade'];

  var gunMetal = new T.MeshStandardMaterial({ color: 0x2b2d30, roughness: 0.35, metalness: 0.85 });
  var gunPoly = new T.MeshStandardMaterial({ color: 0x15161a, roughness: 0.6, metalness: 0.2 });
  var wood = new T.MeshStandardMaterial({ color: 0x6b4226, roughness: 0.55 });
  var olive = new T.MeshStandardMaterial({ color: 0x4b5320, roughness: 0.6 });

  function bx(g, w, h, d, x, y, z, m) {
    var mesh = new T.Mesh(new T.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    g.add(mesh);
    return mesh;
  }
  function cy(g, r, len, x, y, z, m) {
    var mesh = new T.Mesh(new T.CylinderGeometry(r, r, len, 10), m);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    g.add(mesh);
    return mesh;
  }

  // Wapens in de hand: de loop wijst langs +z van de hand (onderarm wijst naar -y).
  G.weaponModel = function (id) {
    var g = new T.Group();
    var inner = new T.Group();
    inner.rotation.x = Math.PI / 2;
    g.add(inner);
    if (id === 'pistol') {
      bx(inner, 0.035, 0.05, 0.2, 0, 0.03, 0.06, gunMetal);
      bx(inner, 0.03, 0.11, 0.05, 0, -0.03, -0.01, gunPoly);
    } else if (id === 'smg') {
      bx(inner, 0.045, 0.07, 0.32, 0, 0.03, 0.08, gunMetal);
      bx(inner, 0.03, 0.14, 0.04, 0, -0.06, 0.12, gunPoly);
      bx(inner, 0.03, 0.1, 0.05, 0, -0.04, -0.02, gunPoly);
      cy(inner, 0.015, 0.12, 0, 0.04, 0.29, gunMetal);
    } else if (id === 'shotgun') {
      cy(inner, 0.022, 0.7, 0, 0.04, 0.3, gunMetal);
      bx(inner, 0.05, 0.07, 0.3, 0, 0.02, 0.03, wood);
      bx(inner, 0.045, 0.09, 0.28, 0, -0.02, -0.25, wood);
    } else if (id === 'rifle') {
      bx(inner, 0.05, 0.08, 0.5, 0, 0.03, 0.15, gunPoly);
      cy(inner, 0.014, 0.3, 0, 0.04, 0.53, gunMetal);
      bx(inner, 0.035, 0.16, 0.06, 0, -0.08, 0.16, gunMetal);
      bx(inner, 0.04, 0.1, 0.25, 0, -0.0, -0.22, gunPoly);
      bx(inner, 0.03, 0.04, 0.12, 0, 0.1, 0.1, gunMetal);
    } else if (id === 'sniper') {
      bx(inner, 0.05, 0.08, 0.6, 0, 0.02, 0.12, olive);
      cy(inner, 0.016, 0.5, 0, 0.04, 0.65, gunMetal);
      cy(inner, 0.03, 0.3, 0, 0.11, 0.12, gunMetal);
      bx(inner, 0.04, 0.12, 0.25, 0, -0.02, -0.3, olive);
    } else if (id === 'rpg') {
      cy(inner, 0.06, 1.1, 0, 0.08, 0.15, olive);
      bx(inner, 0.04, 0.15, 0.06, 0, -0.04, 0.05, gunPoly);
      var tip = new T.Mesh(new T.ConeGeometry(0.07, 0.2, 10), olive);
      tip.rotation.x = Math.PI / 2;
      tip.position.set(0, 0.08, 0.78);
      inner.add(tip);
    }
    g.userData.muzzle = { pistol: 0.17, smg: 0.36, shotgun: 0.66, rifle: 0.68, sniper: 0.9, rpg: 0.75 }[id] || 0.2;
    return g;
  };

  // ---- Raycasts tegen personages en voertuigen -------------------------------------
  var tmpV = new T.Vector3(), tmpL = new T.Vector3(), tmpD = new T.Vector3();

  function raySphere(o, d, c, r) {
    var ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
    var b = ox * d.x + oy * d.y + oz * d.z;
    var cc = ox * ox + oy * oy + oz * oz - r * r;
    var h = b * b - cc;
    if (h < 0) return -1;
    var t = -b - Math.sqrt(h);
    return t >= 0 ? t : -1;
  }

  function rayVehicle(o, d, v) {
    var c = Math.cos(-v.heading), s = Math.sin(-v.heading);
    var lx = o.x - v.pos.x, lz = o.z - v.pos.z;
    tmpL.set(lx * c + lz * s, o.y - v.pos.y, -lx * s + lz * c);
    tmpD.set(d.x * c + d.z * s, d.y, -d.x * s + d.z * c);
    var t = G.world.slab(tmpL, tmpD, -v.halfW, 0.15, -v.halfL, v.halfW, v.height, v.halfL, null);
    return t;
  }

  // Dichtstbijzijnde treffer langs een straal: personage, voertuig of wereld
  G.combat = {
    projectiles: [],
    hitscan: function (o, d, range, shooter) {
      var best = range, hit = null;
      var w = G.world.raycast(o, d, range, {});
      if (w) { best = w.t; hit = { kind: 'world', t: w.t, point: w.point, normal: w.normal, b: w.b }; }
      var vs = G.vehicles.list;
      for (var i = 0; i < vs.length; i++) {
        var v = vs[i];
        if (shooter && shooter.vehicle === v) continue;
        tmpV.subVectors(v.pos, o);
        var along = tmpV.dot(d);
        if (along < -5 || along > best + 5) continue;
        var t = rayVehicle(o, d, v);
        if (t >= 0 && t < best) { best = t; hit = { kind: 'vehicle', t: t, v: v }; }
      }
      var as = G.actors;
      for (var k = 0; k < as.length; k++) {
        var a = as[k];
        if (a === shooter || !a.alive) continue;
        tmpV.set(a.pos.x - o.x, a.pos.y + 1 - o.y, a.pos.z - o.z);
        var al = tmpV.dot(d);
        if (al < 0 || al > best + 1) continue;
        var perp2 = tmpV.lengthSq() - al * al;
        if (perp2 > 1.6) continue;
        var parts = a.char.hitParts();
        for (var p = 0; p < parts.length; p++) {
          var tt = raySphere(o, d, parts[p].pos, parts[p].r);
          if (tt >= 0 && tt < best) { best = tt; hit = { kind: 'actor', t: tt, a: a, part: parts[p].name }; }
        }
      }
      if (hit && !hit.point) hit.point = new T.Vector3().copy(o).addScaledVector(d, hit.t);
      return hit;
    },

    // Een schot afvuren vanaf de loop van een personage naar een doelpunt
    fire: function (shooter, wid, target, accuracy) {
      var wd = G.WEAPONS[wid];
      var muzzle = this.muzzlePos(shooter, wid);
      var dir = new T.Vector3().subVectors(target, muzzle).normalize();
      var spreadMul = accuracy === undefined ? 1 : accuracy;
      G.audio.sfx(wd.sound, muzzle);
      G.fx.muzzle(muzzle, dir);
      G.emit('gunshot', { pos: muzzle, shooter: shooter, weapon: wid });
      if (wd.rocket) {
        this.fireRocket(shooter, muzzle, dir);
        return;
      }
      var n = wd.pellets || 1;
      for (var i = 0; i < n; i++) {
        var d = dir.clone();
        var sp = wd.spread * spreadMul;
        d.x += U.rand(-sp, sp); d.y += U.rand(-sp, sp); d.z += U.rand(-sp, sp);
        d.normalize();
        var h = this.hitscan(muzzle, d, wd.range, shooter);
        var end = h ? h.point : new T.Vector3().copy(muzzle).addScaledVector(d, wd.range);
        if (Math.random() < (n > 1 ? 0.3 : 0.6)) G.fx.tracer(muzzle, end);
        if (!h) continue;
        if (h.kind === 'actor') {
          G.fx.impact(h.point, d.clone().negate(), 'flesh');
          G.audio.sfx('hit', h.point);
          h.a.damage(wd.dmg, shooter, d, h.part);
          if (!h.a.alive) h.a.vel.addScaledVector(d, wid === 'shotgun' || wid === 'sniper' ? 6 : 2);
        } else if (h.kind === 'vehicle') {
          G.fx.impact(h.point, d.clone().negate(), 'metal');
          if (Math.random() < 0.3) G.audio.sfx('ricochet', h.point);
          h.v.damage(wd.dmg * 0.9, shooter, 'kogel');
          var occ = h.v.driver;
          if (occ && Math.random() < 0.22) occ.damage(wd.dmg * 0.6, shooter, d, 'borst');
        } else {
          G.fx.impact(h.point, h.normal, h.b ? 'steen' : 'grond');
          if (Math.random() < 0.15) G.audio.sfx('ricochet', h.point);
        }
      }
    },

    muzzlePos: function (a, wid) {
      var out = new T.Vector3();
      if (a.char.weaponMesh) {
        a.char.weaponMesh.updateWorldMatrix(true, false);
        var m = a.char.weaponMesh.userData.muzzle || 0.2;
        out.set(0, -m, 0).applyMatrix4(a.char.weaponMesh.matrixWorld);
        return out;
      }
      a.char.b.handR.getWorldPosition(out);
      return out;
    },

    melee: function (a, dmg) {
      var fx = Math.sin(a.heading), fz = Math.cos(a.heading);
      var hitAny = false;
      for (var i = 0; i < G.actors.length; i++) {
        var o = G.actors[i];
        if (o === a || !o.alive || o.vehicle) continue;
        var dx = o.pos.x - a.pos.x, dz = o.pos.z - a.pos.z;
        var d = Math.sqrt(dx * dx + dz * dz);
        if (d > 1.5 || Math.abs(o.pos.y - a.pos.y) > 1) continue;
        if ((dx * fx + dz * fz) / (d || 1) < 0.4) continue;
        var dir = new T.Vector3(dx, 0.2, dz).normalize();
        o.damage(dmg, a, dir, 'borst');
        o.vel.addScaledVector(dir, 3);
        G.audio.sfx('punch', o.pos);
        hitAny = true;
        break;
      }
      if (!hitAny) G.audio.sfx('swoosh', a.pos);
      G.emit('melee', { attacker: a, hit: hitAny });
      return hitAny;
    },

    // ---- Projectielen ------------------------------------------------------------
    throwGrenade: function (a, target) {
      var hand = new T.Vector3();
      a.char.b.handR.getWorldPosition(hand);
      var dir = new T.Vector3().subVectors(target, hand);
      var dist = Math.min(45, dir.length());
      dir.normalize();
      var speed = U.clamp(dist * 0.9 + 6, 10, 26);
      var vel = dir.multiplyScalar(speed);
      vel.y += 4 + dist * 0.12;
      var mesh = new T.Mesh(new T.SphereGeometry(0.09, 10, 8), new T.MeshStandardMaterial({ color: 0x3b4a2a, roughness: 0.6, metalness: 0.4 }));
      mesh.castShadow = true;
      G.scene.add(mesh);
      this.projectiles.push({ kind: 'grenade', pos: hand.clone(), vel: vel, fuse: 2.4, mesh: mesh, owner: a });
      G.audio.sfx('throw', hand);
    },

    fireRocket: function (a, from, dir) {
      var g = new T.Group();
      var body = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 0.6, 8), new T.MeshStandardMaterial({ color: 0x4b5320 }));
      body.rotation.x = Math.PI / 2;
      g.add(body);
      var flame = new T.Mesh(new T.SphereGeometry(0.12, 8, 6), new T.MeshBasicMaterial({ color: new T.Color(4, 2, 0.5) }));
      flame.position.z = -0.35;
      g.add(flame);
      g.position.copy(from);
      g.lookAt(from.clone().add(dir));
      G.scene.add(g);
      this.projectiles.push({ kind: 'rocket', pos: from.clone().addScaledVector(dir, 0.8), vel: dir.clone().multiplyScalar(60), life: 7, mesh: g, owner: a });
    },

    update: function (dt) {
      var res = { hit: false };
      for (var i = this.projectiles.length - 1; i >= 0; i--) {
        var p = this.projectiles[i];
        var dead = false;
        if (p.kind === 'grenade') {
          p.vel.y -= 20 * dt;
          var next = p.pos.clone().addScaledVector(p.vel, dt);
          var g = G.world.surface(next.x, next.z, p.pos.y);
          if (next.y < g + 0.09) {
            next.y = g + 0.09;
            if (p.vel.y < -2) G.audio.sfx('bounce', next);
            p.vel.y = Math.abs(p.vel.y) * 0.35;
            p.vel.x *= 0.6; p.vel.z *= 0.6;
          }
          var before = next.clone();
          G.world.collideCircle(next, 0.1, 0.2, res, 0.05);
          if (res.hit) {
            var vn = p.vel.x * res.nx + p.vel.z * res.nz;
            if (vn < 0) { p.vel.x -= 1.6 * vn * res.nx; p.vel.z -= 1.6 * vn * res.nz; G.audio.sfx('bounce', next); }
            next.copy(before).add(new T.Vector3(next.x - before.x, 0, next.z - before.z));
          }
          p.pos.copy(next);
          p.mesh.position.copy(p.pos);
          p.mesh.rotation.x += dt * 8;
          p.fuse -= dt;
          if (p.fuse <= 0) {
            this.explosion(p.pos.clone(), 1.0, p.owner);
            dead = true;
          }
        } else if (p.kind === 'rocket') {
          var step = p.vel.length() * dt;
          var dir = p.vel.clone().normalize();
          var h = this.hitscan(p.pos, dir, step + 0.5, p.owner);
          p.life -= dt;
          G.fx.smoke(p.pos, 1, dt * 6);
          if (h || p.life <= 0) {
            var ep = h ? h.point.clone().addScaledVector(dir, -0.4) : p.pos.clone();
            this.explosion(ep, 1.25, p.owner);
            dead = true;
          } else {
            p.pos.addScaledVector(p.vel, dt);
            p.mesh.position.copy(p.pos);
          }
        }
        if (dead) {
          G.scene.remove(p.mesh);
          this.projectiles.splice(i, 1);
        }
      }
    },

    // ---- Explosies -----------------------------------------------------------------
    explosion: function (pos, power, attacker, sourceVehicle) {
      power = power || 1;
      G.fx.explosion(pos, power);
      G.audio.sfx('explosion', pos, { size: power });
      if (G.cam) {
        var dcam = G.cam.position.distanceTo(pos);
        G.cam.addShake(U.clamp(1.6 * power * (1 - dcam / 120), 0, 1.6));
      }
      var radius = 9 * power;
      var i;
      // personages
      for (i = 0; i < G.actors.length; i++) {
        var a = G.actors[i];
        var dx = a.pos.x - pos.x, dy = a.pos.y + 0.9 - pos.y, dz = a.pos.z - pos.z;
        var d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d > radius) continue;
        if (!G.world.lineClear(pos, new T.Vector3(a.pos.x, a.pos.y + 1, a.pos.z)) && d > 2.5) continue;
        var f = 1 - d / radius;
        var dir = new T.Vector3(dx, Math.abs(dy) + 1.5, dz).normalize();
        if (a.vehicle && !a.vehicle.isHeli) { a.damage(30 * f * power, attacker, dir, 'borst'); continue; }
        a.damage(190 * Math.pow(f, 0.7) * power, attacker, dir, 'explosie');
        if (!a.alive) a.vel.addScaledVector(dir, 6 + 14 * f * power);
        else a.vel.addScaledVector(dir, 4 * f);
      }
      // voertuigen (kettingreacties)
      var vs = G.vehicles.list.slice();
      for (i = 0; i < vs.length; i++) {
        var v = vs[i];
        if (v === sourceVehicle) continue;
        var vd = v.pos.distanceTo(pos);
        if (vd > radius * 1.1) continue;
        var vf = 1 - vd / (radius * 1.1);
        v.damage(1100 * vf * power, attacker, 'explosie');
        var push = new T.Vector3(v.pos.x - pos.x, 0, v.pos.z - pos.z).normalize().multiplyScalar(10 * vf * power);
        v.vel.add(push);
        v.yawRate += U.rand(-2, 2) * vf;
      }
      // gebouwen en bouwwerken echt kapot
      var destroyed = G.world.damageBuildings(pos, 7.5 * power);
      if (G.build) G.build.damage(pos, 5 * power);
      G.emit('explosion', { pos: pos, power: power, attacker: attacker, cells: destroyed });
    },

    // Vallend puin verplettert wat eronder staat
    crush: function (pos, radius, speed) {
      for (var i = 0; i < G.actors.length; i++) {
        var a = G.actors[i];
        if (!a.alive || a.vehicle) continue;
        if (U.dist2(a.pos.x, a.pos.z, pos.x, pos.z) < radius + 0.4 && Math.abs(a.pos.y - pos.y) < 3) {
          a.damage(speed * 6, null, new T.Vector3(0, -1, 0), 'puin');
        }
      }
      for (var k = 0; k < G.vehicles.list.length; k++) {
        var v = G.vehicles.list[k];
        if (U.dist2(v.pos.x, v.pos.z, pos.x, pos.z) < radius + 1.5) v.damage(speed * 25, null, 'puin');
      }
    }
  };
})();
