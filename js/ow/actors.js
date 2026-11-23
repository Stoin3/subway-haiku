/*
 * actors.js - gedeelde gameplay-laag voor alle personages (speler, NPC's, politie, bende,
 * vriendin): lopen met zwaartekracht en botsingen, zwemmen, valschade, gezondheid,
 * pantser, sterven met een ragdoll-achtige val, in- en uitstappen en praten.
 */
(function () {
  'use strict';

  var G = window.G, T = G.T, U = G.U;
  G.actors = [];

  var res = { hit: false };

  function Actor(o) {
    this.look = o.look || G.randomLook();
    this.char = new G.Character(this.look);
    G.scene.add(this.char.root);
    this.pos = new T.Vector3();
    if (o.pos) this.pos.copy(o.pos);
    this.vel = new T.Vector3();
    this.heading = o.heading || 0;
    this.team = o.team || 'civ';
    this.health = o.health || 100;
    this.maxHealth = this.health;
    this.armor = o.armor || 0;
    this.alive = true;
    this.grounded = true;
    this.vehicle = null;
    this.seat = 0;
    this.isPlayer = !!o.player;
    this.voice = G.voiceFor(this.look);
    this.anim = { speed: 0, grounded: true };
    this.weapon = o.weapon || null;
    this.radius = 0.32;
    this.deadTime = 0;
    this.swimming = false;
    this.lastHitBy = null;
    this.sayTimer = 0;
    this.name = o.name || null;
    if (this.weapon) this.setWeapon(this.weapon);
    G.actors.push(this);
  }
  G.Actor = Actor;

  Actor.prototype.setWeapon = function (id) {
    this.weapon = id;
    var w = id && G.WEAPONS[id];
    this.char.setWeapon(w && w.hold !== 'none' && !w.throw ? G.weaponModel(id) : null);
  };

  Actor.prototype.holdType = function () {
    var w = this.weapon && G.WEAPONS[this.weapon];
    return w ? w.hold : 'none';
  };

  // Gewenste horizontale snelheid (wx, wz) toepassen met zwaartekracht en botsingen
  Actor.prototype.move = function (dt, wx, wz, jump) {
    var W = G.world;
    var acc = this.grounded ? 12 : 2.5;
    if (this.swimming) { acc = 3; wx *= 0.4; wz *= 0.4; }
    this.vel.x = U.damp(this.vel.x, wx, acc, dt);
    this.vel.z = U.damp(this.vel.z, wz, acc, dt);
    if (jump && this.grounded && !this.swimming) {
      this.vel.y = 6.4;
      this.grounded = false;
    }
    this.vel.y -= 22 * dt;
    if (this.vel.y < -50) this.vel.y = -50;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y += this.vel.y * dt;
    W.collideCircle(this.pos, this.radius, 1.75 * this.char.scale, res, 0.45);
    if (res.hit) {
      var vn = this.vel.x * res.nx + this.vel.z * res.nz;
      if (vn < 0) { this.vel.x -= vn * res.nx; this.vel.z -= vn * res.nz; }
    }
    var b = W.size || W.bounds;
    this.pos.x = U.clamp(this.pos.x, b.x0, b.x1);
    this.pos.z = U.clamp(this.pos.z, b.z0, b.z1);
    var g = W.surface(this.pos.x, this.pos.z, this.pos.y);
    var waterY = G.env.WATER_Y;
    if (g < waterY - 1.25 && this.pos.y < waterY - 1.1) {
      // zwemmen: hoofd boven water
      if (!this.swimming && this.vel.y < -4) { G.fx.splash(this.pos); G.audio.sfx('splash', this.pos); }
      this.swimming = true;
      this.pos.y = waterY - 1.2;
      this.vel.y = 0;
      this.grounded = false;
      return;
    }
    this.swimming = false;
    if (this.pos.y <= g) {
      if (!this.grounded && this.vel.y < -15) this.damage((-this.vel.y - 15) * 7, null, null, 'val');
      if (g - this.pos.y > 0.6 && this.vel.y > -1) {
        // stap is te hoog: blijf staan (de botsing duwt ons al terug)
        this.pos.y = g;
      } else {
        this.pos.y = g;
      }
      if (this.vel.y < 0) this.vel.y = 0;
      this.grounded = true;
    } else if (this.pos.y - g < 0.25 && this.vel.y <= 0 && this.grounded) {
      // trapjes af lopen zonder te "zweven"
      this.pos.y = g;
      this.vel.y = 0;
    } else {
      this.grounded = false;
    }
  };

  Actor.prototype.faceTo = function (angle, dt, rate) {
    this.heading += U.angDiff(this.heading, angle) * Math.min(1, (rate || 10) * dt);
  };

  Actor.prototype.distTo = function (p) { return U.dist2(this.pos.x, this.pos.z, p.x, p.z); };

  Actor.prototype.damage = function (amount, attacker, dir, part) {
    if (!this.alive) return;
    if (this.invulnerable) return;
    if (part === 'hoofd') amount *= 2.5;
    if (this.armor > 0 && part !== 'val') {
      var a = Math.min(this.armor, amount * 0.7);
      this.armor -= a;
      amount -= a;
    }
    this.health -= amount;
    this.lastHitBy = attacker || this.lastHitBy;
    this.hurtT = 0.25;
    G.emit('actorDamaged', { actor: this, amount: amount, attacker: attacker, part: part });
    if (this.health <= 0) this.die(attacker, dir);
  };

  Actor.prototype.heal = function (n) {
    this.health = Math.min(this.maxHealth, this.health + n);
  };

  Actor.prototype.die = function (attacker, dir, launch) {
    if (!this.alive) return;
    this.alive = false;
    this.health = 0;
    this.deadTime = 0;
    if (this.vehicle) this.exitVehicle(true);
    var fall = { rx: 0, rz: 0, t: 0 };
    if (dir) {
      // val in de richting van de klap
      var local = Math.atan2(dir.x, dir.z) - this.heading;
      fall.rx = Math.cos(local) >= 0 ? -Math.PI / 2 : Math.PI / 2;
      fall.rz = Math.sin(local) * 0.4;
      if (launch) this.vel.addScaledVector(dir, launch);
    } else {
      fall.rx = Math.random() < 0.5 ? -Math.PI / 2 : Math.PI / 2;
    }
    this.fall = fall;
    this.grounded = false;
    G.emit('actorKilled', { actor: this, attacker: attacker });
  };

  Actor.prototype.updateDead = function (dt) {
    this.deadTime += dt;
    var f = this.fall;
    f.t = Math.min(1, f.t + dt * 2.6);
    var e = 1 - Math.pow(1 - f.t, 3);
    this.vel.x *= Math.exp(-2 * dt);
    this.vel.z *= Math.exp(-2 * dt);
    this.vel.y -= 22 * dt;
    this.pos.addScaledVector(this.vel, dt);
    var g = G.world.ground(this.pos.x, this.pos.z);
    if (this.pos.y < g) {
      this.pos.y = g;
      if (this.vel.y < -3) { this.vel.y *= -0.25; this.vel.x *= 0.5; this.vel.z *= 0.5; } else this.vel.y = 0;
    }
    var r = this.char.root;
    r.position.set(this.pos.x, this.pos.y + 0.12 * e, this.pos.z);
    r.rotation.set(f.rx * e, this.heading, f.rz * e, 'YXZ');
    this.char.animate(dt, { dead: true, grounded: true });
  };

  Actor.prototype.enterVehicle = function (v, seat) {
    this.vehicle = v;
    this.seat = seat || 0;
    if (this.seat === 0) v.driver = this; else v.passenger = this;
    this.vel.set(0, 0, 0);
  };

  Actor.prototype.exitVehicle = function (forced) {
    var v = this.vehicle;
    if (!v) return;
    if (v.driver === this) v.driver = null;
    if (v.passenger === this) v.passenger = null;
    var side = this.seat === 0 ? 1 : -1;
    var p = v.doorWorld(side, new T.Vector3());
    var tmp = p.clone();
    G.world.collideCircle(tmp, 0.4, 1.7, null, 0.45);
    if (tmp.distanceTo(p) > 0.5) {
      p = v.doorWorld(-side, new T.Vector3());
    }
    this.pos.copy(p);
    this.pos.y = G.world.surface(p.x, p.z, v.pos.y + 1.5);
    if (v.isHeli && !v.landed) this.pos.y = v.pos.y;
    this.heading = v.heading;
    this.vehicle = null;
    this.vel.set(forced ? v.vel.x * 0.5 : 0, 0, forced ? v.vel.z * 0.5 : 0);
    this.char.root.rotation.set(0, this.heading, 0);
  };

  Actor.prototype.say = function (text, opts) {
    opts = opts || {};
    if (!this.alive) return 0;
    var near = G.player && this.distTo(G.player.pos) < (opts.range || 25);
    if (!near) return 0;
    var dur = G.audio.voice(this.voice, text, this.char.root.position.clone().setY(this.pos.y + 1.6));
    G.emit('subtitle', { who: opts.who || this.name || '', text: text, dur: Math.max(2, dur + 1.2), color: opts.color });
    this.talkT = dur;
    return dur;
  };

  var seatTmp = new T.Vector3();

  Actor.prototype.sync = function (dt, anim) {
    var r = this.char.root;
    if (!this.alive) { this.updateDead(dt); return; }
    if (this.vehicle) {
      var v = this.vehicle;
      v.seatWorld(this.seat, seatTmp);
      var sc = this.char.scale;
      r.position.set(seatTmp.x, seatTmp.y + 0.1 - 0.95 * sc + 0.45 * sc, seatTmp.z);
      r.rotation.set(v.isHeli ? (v.pitchA || 0) : v.pitchV, v.heading, v.isHeli ? (v.rollA || 0) : v.rollV, 'YXZ');
      this.pos.copy(v.pos);
      this.heading = v.heading;
      anim = anim || {};
      anim.seat = this.seat === 0 ? 'driver' : 'passenger';
      anim.steer = v.steer;
      anim.speed = 0;
      anim.grounded = true;
      this.char.animate(dt, anim);
      return;
    }
    r.position.copy(this.pos);
    r.rotation.set(0, this.heading, 0);
    if (this.talkT > 0) this.talkT -= dt;
    this.char.animate(dt, anim || this.anim);
  };

  Actor.prototype.remove = function () {
    if (this.vehicle) this.exitVehicle(true);
    G.scene.remove(this.char.root);
    this.char.dispose();
    var i = G.actors.indexOf(this);
    if (i >= 0) G.actors.splice(i, 1);
    this.removed = true;
  };
})();
