/*
 * fx.js - visuele effecten: deeltjes (vuur, rook, vonken, stof), puin met eenvoudige
 * rigid-body physics (stuiteren, rollen, opstapelen), vallende gebouwdelen,
 * kogelsporen, schroeiplekken en lichtflitsen.
 */
(function () {
  'use strict';

  var G = window.G, T = G.T, U = G.U;
  var F = G.fx = {};

  // ---- Deeltjessysteem (GPU points, CPU simulatie) ------------------------------
  var PVS = [
    'attribute vec4 aCol;',
    'attribute float aSize;',
    'attribute float aSeed;',
    'varying vec4 vCol;',
    'varying float vSeed;',
    'uniform float uScale;',
    'void main(){',
    '  vCol = aCol; vSeed = aSeed;',
    '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
    '  gl_PointSize = clamp(aSize * uScale / max(0.5, -mv.z), 1.0, 600.0);',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');

  var PFS = [
    'varying vec4 vCol;',
    'varying float vSeed;',
    'uniform float uSoft;',
    'float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }',
    'float n2(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f);',
    '  return mix(mix(h(i),h(i+vec2(1.0,0.0)),f.x), mix(h(i+vec2(0.0,1.0)),h(i+vec2(1.0,1.0)),f.x), f.y); }',
    'void main(){',
    '  vec2 p = gl_PointCoord - 0.5;',
    '  float r = length(p);',
    '  if (r > 0.5) discard;',
    '  float a = smoothstep(0.5, 0.1, r);',
    '  if (uSoft > 0.5) { a *= 0.55 + 0.6 * n2(p * 5.0 + vSeed * 17.0); }',
    '  gl_FragColor = vec4(vCol.rgb, vCol.a * a);',
    '}'
  ].join('\n');

  function PSys(max, additive, soft) {
    this.max = max;
    this.n = 0;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.seed = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.c0 = new Float32Array(max * 4);
    this.c1 = new Float32Array(max * 4);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    var geo = new T.BufferGeometry();
    this.aPos = new T.BufferAttribute(this.pos, 3);
    this.aCol = new T.BufferAttribute(this.col, 4);
    this.aSize = new T.BufferAttribute(this.size, 1);
    this.aPos.setUsage(T.DynamicDrawUsage);
    this.aCol.setUsage(T.DynamicDrawUsage);
    this.aSize.setUsage(T.DynamicDrawUsage);
    geo.setAttribute('position', this.aPos);
    geo.setAttribute('aCol', this.aCol);
    geo.setAttribute('aSize', this.aSize);
    geo.setAttribute('aSeed', new T.BufferAttribute(this.seed, 1));
    geo.setDrawRange(0, 0);
    this.uniforms = { uScale: F.scaleUniform, uSoft: { value: soft ? 1 : 0 } };
    var mat = new T.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: PVS,
      fragmentShader: PFS,
      transparent: true,
      depthWrite: false,
      blending: additive ? T.AdditiveBlending : T.NormalBlending
    });
    this.points = new T.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 20 : 10;
    this.geo = geo;
  }

  PSys.prototype.emit = function (px, py, pz, vx, vy, vz, life, s0, s1, c0, c1, grav, drag) {
    var i = this.n < this.max ? this.n++ : Math.floor(Math.random() * this.max);
    var i3 = i * 3, i4 = i * 4;
    this.pos[i3] = px; this.pos[i3 + 1] = py; this.pos[i3 + 2] = pz;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life;
    this.s0[i] = s0; this.s1[i] = s1; this.size[i] = s0;
    for (var k = 0; k < 4; k++) { this.c0[i4 + k] = c0[k]; this.c1[i4 + k] = c1[k]; this.col[i4 + k] = c0[k]; }
    this.grav[i] = grav || 0;
    this.drag[i] = drag || 0;
    this.seed[i] = Math.random();
  };

  PSys.prototype.update = function (dt) {
    var n = this.n;
    for (var i = 0; i < n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        n--;
        this.copy(n, i);
        i--;
        continue;
      }
      var i3 = i * 3, i4 = i * 4;
      var t = 1 - this.life[i] / this.maxLife[i];
      var dr = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i3] *= dr; this.vel[i3 + 1] *= dr; this.vel[i3 + 2] *= dr;
      this.vel[i3 + 1] -= this.grav[i] * dt;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      if (this.pos[i3 + 1] < 0.05 && this.grav[i] > 0) {
        this.pos[i3 + 1] = 0.05;
        this.vel[i3 + 1] *= -0.3;
        this.vel[i3] *= 0.6; this.vel[i3 + 2] *= 0.6;
      }
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      for (var k = 0; k < 4; k++) this.col[i4 + k] = this.c0[i4 + k] + (this.c1[i4 + k] - this.c0[i4 + k]) * t;
    }
    this.n = n;
    this.geo.setDrawRange(0, n);
    this.aPos.needsUpdate = true;
    this.aCol.needsUpdate = true;
    this.aSize.needsUpdate = true;
  };

  PSys.prototype.copy = function (from, to) {
    var a3 = from * 3, b3 = to * 3, a4 = from * 4, b4 = to * 4, k;
    for (k = 0; k < 3; k++) { this.pos[b3 + k] = this.pos[a3 + k]; this.vel[b3 + k] = this.vel[a3 + k]; }
    for (k = 0; k < 4; k++) { this.col[b4 + k] = this.col[a4 + k]; this.c0[b4 + k] = this.c0[a4 + k]; this.c1[b4 + k] = this.c1[a4 + k]; }
    this.size[to] = this.size[from]; this.s0[to] = this.s0[from]; this.s1[to] = this.s1[from];
    this.life[to] = this.life[from]; this.maxLife[to] = this.maxLife[from];
    this.grav[to] = this.grav[from]; this.drag[to] = this.drag[from]; this.seed[to] = this.seed[from];
  };

  var add, smoke;
  F.scaleUniform = { value: 600 };

  // ---- Puin (instanced dozen met physics) ---------------------------------------
  var MAXD = 900;
  var debris = [];
  var debrisMesh;
  var dm = new T.Matrix4(), dq = new T.Quaternion(), de = new T.Euler(), dp = new T.Vector3(), ds = new T.Vector3();
  var hidden = new T.Matrix4().makeScale(0, 0, 0);
  var dCursor = 0;

  function allocDebris() {
    // eerst een vrije plek, anders de oudste kleine brokstukken hergebruiken
    for (var k = 0; k < MAXD; k++) {
      var i = (dCursor + k) % MAXD;
      if (!debris[i].active) { dCursor = i + 1; return debris[i]; }
    }
    var j = dCursor % MAXD;
    dCursor++;
    return debris[j];
  }

  function spawnDebris(p, v, sx, sy, sz, color, big) {
    var d = allocDebris();
    d.active = true;
    d.pos.copy(p);
    d.vel.copy(v);
    d.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    d.ang.set(U.rand(-6, 6), U.rand(-6, 6), U.rand(-6, 6));
    if (big) d.ang.multiplyScalar(0.15);
    d.sx = sx; d.sy = sy; d.sz = sz;
    d.big = big;
    d.rest = false;
    d.life = big ? 120 : U.rand(14, 22);
    d.fade = 1;
    debrisMesh.setColorAt(debris.indexOf(d), color);
    debrisMesh.instanceColor.needsUpdate = true;
    return d;
  }

  F.debrisBurst = function (p, color, from, n) {
    var col = new T.Color(color);
    for (var i = 0; i < n; i++) {
      var dir = new T.Vector3().subVectors(p, from);
      dir.y = Math.abs(dir.y) + 1;
      dir.normalize().multiplyScalar(U.rand(6, 18));
      dir.x += U.rand(-4, 4); dir.z += U.rand(-4, 4); dir.y += U.rand(0, 6);
      var s = U.rand(0.4, 1.4);
      var c2 = col.clone().multiplyScalar(U.rand(0.6, 1));
      spawnDebris(new T.Vector3(p.x + U.rand(-1, 1), p.y + U.rand(-1, 1), p.z + U.rand(-1, 1)), dir, s, s * U.rand(0.4, 1), s * U.rand(0.5, 1.2), c2, false);
    }
  };

  F.fallingBlock = function (center, sxz, sy, color, from) {
    var v = new T.Vector3(U.rand(-1.5, 1.5), U.rand(-1, 1), U.rand(-1.5, 1.5));
    if (from) {
      var away = new T.Vector3(center.x - from.x, 0, center.z - from.z);
      if (away.lengthSq() > 0.01) v.add(away.normalize().multiplyScalar(U.rand(0.5, 3)));
    }
    var d = spawnDebris(center, v, sxz, sy, sxz, color.clone().multiplyScalar(U.rand(0.75, 1)), true);
    d.rot.set(U.rand(-0.1, 0.1), U.rand(-0.3, 0.3), U.rand(-0.1, 0.1));
  };

  function updateDebris(dt) {
    var W = G.world;
    var any = false;
    for (var i = 0; i < MAXD; i++) {
      var d = debris[i];
      if (!d.active) continue;
      any = true;
      d.life -= dt;
      if (d.life <= 0) {
        d.fade -= dt * 0.8;
        if (d.fade <= 0) { d.active = false; debrisMesh.setMatrixAt(i, hidden); continue; }
      }
      if (!d.rest) {
        d.vel.y -= 25 * dt;
        d.pos.addScaledVector(d.vel, dt);
        d.rot.x += d.ang.x * dt; d.rot.y += d.ang.y * dt; d.rot.z += d.ang.z * dt;
        var g = W.ground(d.pos.x, d.pos.z);
        var half = Math.min(d.sx, d.sy, d.sz) * 0.5;
        if (d.pos.y - half < g) {
          d.pos.y = g + half;
          if (d.big && d.vel.y < -8 && G.combat) G.combat.crush(d.pos, Math.max(d.sx, d.sz) * 0.7, -d.vel.y);
          if (d.vel.y < -3) {
            d.vel.y *= -0.22;
            d.vel.x *= 0.55; d.vel.z *= 0.55;
            d.ang.multiplyScalar(0.5);
            if (d.big && Math.random() < 0.3) F.dust(d.pos, 3);
          } else {
            d.vel.set(0, 0, 0);
            d.rest = true;
            if (d.big) {
              // puin opstapelen zodat volgende blokken er bovenop landen
              var hx = d.sx * 0.5, hz = d.sz * 0.5;
              for (var ox = -hx + 1; ox < hx; ox += 2) {
                for (var oz = -hz + 1; oz < hz; oz += 2) W.addRubble(d.pos.x + ox, d.pos.z + oz, d.sy * 0.45);
              }
              d.rot.x = Math.round(d.rot.x / (Math.PI / 2)) * (Math.PI / 2) + U.rand(-0.15, 0.15);
              d.rot.z = Math.round(d.rot.z / (Math.PI / 2)) * (Math.PI / 2) + U.rand(-0.15, 0.15);
            }
          }
        }
      }
      de.set(d.rot.x, d.rot.y, d.rot.z);
      dq.setFromEuler(de);
      var f = Math.max(0.001, d.fade);
      ds.set(d.sx * f, d.sy * f, d.sz * f);
      dm.compose(d.pos, dq, ds);
      debrisMesh.setMatrixAt(i, dm);
    }
    if (any) debrisMesh.instanceMatrix.needsUpdate = true;
  }

  // ---- Kogelsporen ------------------------------------------------------------------
  var TR = 64;
  var tracers = [];
  var trGeo, trPos, trCol;
  F.tracer = function (a, b) {
    var t = tracers.shift();
    t.a.copy(a); t.b.copy(b); t.life = 0.07;
    tracers.push(t);
  };
  function updateTracers(dt) {
    for (var i = 0; i < TR; i++) {
      var t = tracers[i];
      t.life -= dt;
      var k = Math.max(0, t.life / 0.07);
      trPos[i * 6] = t.a.x; trPos[i * 6 + 1] = t.a.y; trPos[i * 6 + 2] = t.a.z;
      trPos[i * 6 + 3] = t.b.x; trPos[i * 6 + 4] = t.b.y; trPos[i * 6 + 5] = t.b.z;
      for (var v = 0; v < 2; v++) {
        trCol[i * 6 + v * 3] = 2.5 * k;
        trCol[i * 6 + v * 3 + 1] = 2.0 * k;
        trCol[i * 6 + v * 3 + 2] = 1.0 * k;
      }
    }
    trGeo.attributes.position.needsUpdate = true;
    trGeo.attributes.color.needsUpdate = true;
  }

  // ---- Lichtflitsen en schroeiplekken -----------------------------------------------
  var flashes = [];
  var scorch, scorchI = 0;
  var rings = [];

  F.flash = function (pos, intensity, dur, color) {
    var f = flashes[0];
    for (var i = 1; i < flashes.length; i++) if (flashes[i].t < f.t) f = flashes[i];
    f.light.position.copy(pos);
    f.light.color.set(color || 0xffa040);
    f.peak = intensity;
    f.dur = dur;
    f.t = dur;
  };

  F.scorch = function (pos, radius) {
    var m = new T.Matrix4().compose(new T.Vector3(pos.x, G.world.ground(pos.x, pos.z) + 0.03, pos.z),
      new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), Math.random() * 6),
      new T.Vector3(radius, 1, radius));
    scorch.setMatrixAt(scorchI % 60, m);
    scorch.instanceMatrix.needsUpdate = true;
    scorchI++;
  };

  // ---- Publieke effecten -----------------------------------------------------------
  F.spark = function (p, n, speed) {
    for (var i = 0; i < n; i++) {
      add.emit(p.x, p.y, p.z, U.rand(-1, 1) * speed, U.rand(0, 1.2) * speed, U.rand(-1, 1) * speed,
        U.rand(0.2, 0.5), 0.18, 0.05, [3, 2.2, 1, 1], [2, 0.6, 0.1, 0], 18, 0.5);
    }
  };

  F.muzzle = function (p, dir) {
    for (var i = 0; i < 4; i++) {
      add.emit(p.x + dir.x * 0.1 * i, p.y + dir.y * 0.1 * i, p.z + dir.z * 0.1 * i,
        dir.x * 4, dir.y * 4, dir.z * 4, 0.05, 0.6 - i * 0.1, 0.2, [3, 2.2, 0.9, 1], [2, 0.8, 0.2, 0], 0, 0);
    }
    smoke.emit(p.x, p.y, p.z, dir.x * 1.5, 0.6, dir.z * 1.5, 0.6, 0.2, 0.9, [0.6, 0.6, 0.6, 0.25], [0.7, 0.7, 0.7, 0], -0.5, 1);
    F.flash(p, 25, 0.05, 0xffc070);
  };

  F.impact = function (p, n, kind) {
    if (kind === 'flesh') {
      for (var i = 0; i < 6; i++) {
        smoke.emit(p.x, p.y, p.z, n.x * 2 + U.rand(-1, 1), U.rand(0, 1.5), n.z * 2 + U.rand(-1, 1), 0.35, 0.15, 0.45,
          [0.45, 0.04, 0.04, 0.85], [0.3, 0.02, 0.02, 0], 6, 1);
      }
      return;
    }
    if (kind === 'metal') {
      F.spark(p, 8, 5);
    }
    for (var k = 0; k < 4; k++) {
      smoke.emit(p.x, p.y, p.z, n.x * 2 + U.rand(-0.6, 0.6), n.y * 2 + U.rand(0, 0.8), n.z * 2 + U.rand(-0.6, 0.6),
        U.rand(0.5, 0.9), 0.2, 1.0, [0.55, 0.52, 0.48, 0.6], [0.6, 0.58, 0.55, 0], 1, 2);
    }
    if (kind !== 'metal') add.emit(p.x, p.y, p.z, 0, 0, 0, 0.05, 0.3, 0.1, [2, 1.6, 1, 1], [1, 0.5, 0.2, 0], 0, 0);
  };

  F.explosion = function (pos, power) {
    power = power || 1;
    var i;
    for (i = 0; i < 6; i++) {
      add.emit(pos.x, pos.y + 0.5, pos.z, 0, 1, 0, 0.18, 8 * power, 16 * power, [6, 5, 4, 1], [3, 1.5, 0.5, 0], 0, 0);
    }
    for (i = 0; i < 50; i++) {
      var a = Math.random() * Math.PI * 2, el = Math.random() * 1.2;
      var sp = U.rand(3, 11) * power;
      add.emit(pos.x, pos.y + 0.5, pos.z, Math.cos(a) * Math.cos(el) * sp, Math.sin(el) * sp + 2, Math.sin(a) * Math.cos(el) * sp,
        U.rand(0.5, 1.1), 2.5 * power, 6.5 * power, [4, 2.2, 0.6, 1], [1.4, 0.25, 0.05, 0], -2, 3);
    }
    for (i = 0; i < 40; i++) {
      var a2 = Math.random() * Math.PI * 2;
      var sp2 = U.rand(1, 5) * power;
      smoke.emit(pos.x + U.rand(-1, 1), pos.y + 1, pos.z + U.rand(-1, 1), Math.cos(a2) * sp2, U.rand(2, 6), Math.sin(a2) * sp2,
        U.rand(3, 7), 3 * power, U.rand(10, 18) * power, [0.12, 0.11, 0.1, 0.9], [0.35, 0.34, 0.33, 0], -1.2, 0.9);
    }
    F.spark(pos, 50, 18 * power);
    F.flash(new T.Vector3(pos.x, pos.y + 2, pos.z), 6000 * power, 0.45, 0xff9a40);
    F.scorch(pos, 5 * power);
    var ring = rings.shift();
    ring.mesh.position.set(pos.x, pos.y + 0.3, pos.z);
    ring.t = 0;
    ring.power = power;
    ring.mesh.visible = true;
    rings.push(ring);
    var dc = new T.Color(0x3a3532);
    for (i = 0; i < 10; i++) {
      var v = new T.Vector3(U.rand(-8, 8), U.rand(6, 16), U.rand(-8, 8));
      var s = U.rand(0.15, 0.45);
      spawnDebris(new T.Vector3(pos.x, pos.y + 0.5, pos.z), v, s, s, s, dc, false);
    }
  };

  F.dust = function (center, radius, big) {
    var n = big ? 60 : 14;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, r = Math.random() * radius;
      var c = U.rand(0.55, 0.7);
      smoke.emit(center.x + Math.cos(a) * r, Math.max(0.5, center.y + U.rand(-2, 2)), center.z + Math.sin(a) * r,
        Math.cos(a) * U.rand(1, 5), U.rand(0.5, 3), Math.sin(a) * U.rand(1, 5),
        U.rand(4, big ? 10 : 6), U.rand(3, 6), U.rand(12, big ? 26 : 16), [c, c * 0.95, c * 0.88, 0.7], [c, c * 0.95, c * 0.9, 0], -0.2, 0.6);
    }
  };

  F.fire = function (p, level, dt) {
    var n = Math.random() < level * dt * 40 ? 1 + Math.floor(level * 2) : 0;
    for (var i = 0; i < n; i++) {
      add.emit(p.x + U.rand(-0.6, 0.6), p.y, p.z + U.rand(-0.6, 0.6), U.rand(-0.4, 0.4), U.rand(2, 4), U.rand(-0.4, 0.4),
        U.rand(0.4, 0.8), 1.4 * level, 0.3, [3, 1.6, 0.4, 1], [1.5, 0.2, 0.05, 0], -3, 1);
      if (Math.random() < 0.5) {
        smoke.emit(p.x, p.y + 1, p.z, U.rand(-0.4, 0.4), U.rand(2, 3.5), U.rand(-0.4, 0.4),
          U.rand(2.5, 4.5), 1.2, 6 * level + 2, [0.1, 0.1, 0.1, 0.7], [0.25, 0.25, 0.25, 0], -0.8, 0.4);
      }
    }
  };

  F.smoke = function (p, level, dt) {
    if (Math.random() < level * dt * 25) {
      var c = 0.25 + (1 - level) * 0.4;
      smoke.emit(p.x, p.y, p.z, U.rand(-0.3, 0.3), U.rand(1.2, 2.5), U.rand(-0.3, 0.3),
        U.rand(1.5, 3), 0.6, 3.5, [c, c, c, 0.55], [c + 0.1, c + 0.1, c + 0.1, 0], -0.6, 0.4);
    }
  };

  F.tireSmoke = function (p) {
    smoke.emit(p.x, p.y + 0.2, p.z, U.rand(-0.5, 0.5), U.rand(0.3, 1), U.rand(-0.5, 0.5),
      U.rand(1, 2), 0.6, 3.2, [0.85, 0.85, 0.85, 0.35], [0.9, 0.9, 0.9, 0], -0.3, 1);
  };

  F.splash = function (p) {
    for (var i = 0; i < 25; i++) {
      smoke.emit(p.x, p.y, p.z, U.rand(-3, 3), U.rand(3, 8), U.rand(-3, 3), U.rand(0.6, 1.2), 0.4, 1.4,
        [0.85, 0.92, 1, 0.8], [0.9, 0.95, 1, 0], 14, 0.4);
    }
  };

  F.sparkle = function (p, color) {
    var c = new T.Color(color || 0xff6ec7);
    for (var i = 0; i < 12; i++) {
      add.emit(p.x + U.rand(-0.4, 0.4), p.y + U.rand(0, 0.6), p.z + U.rand(-0.4, 0.4), U.rand(-0.4, 0.4), U.rand(0.8, 1.6), U.rand(-0.4, 0.4),
        U.rand(0.8, 1.4), 0.35, 0.05, [c.r * 2.5, c.g * 2.5, c.b * 2.5, 1], [c.r, c.g, c.b, 0], -0.5, 0.5);
    }
  };

  F.cashBurst = function (p) {
    for (var i = 0; i < 16; i++) {
      add.emit(p.x, p.y + 1, p.z, U.rand(-2, 2), U.rand(2, 5), U.rand(-2, 2), U.rand(0.6, 1.1), 0.3, 0.2,
        [0.4, 2.2, 0.6, 1], [0.2, 1, 0.3, 0], 8, 0.5);
    }
  };

  // ---- Init en update ------------------------------------------------------------
  F.init = function (scene) {
    add = new PSys(3000, true, false);
    smoke = new PSys(2500, false, true);
    scene.add(smoke.points);
    scene.add(add.points);

    var box = new T.BoxGeometry(1, 1, 1);
    debrisMesh = new T.InstancedMesh(box, new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), MAXD);
    debrisMesh.castShadow = true;
    debrisMesh.receiveShadow = true;
    debrisMesh.frustumCulled = false;
    var white = new T.Color(1, 1, 1);
    for (var i = 0; i < MAXD; i++) {
      debris.push({ active: false, pos: new T.Vector3(), vel: new T.Vector3(), rot: new T.Vector3(), ang: new T.Vector3(), sx: 1, sy: 1, sz: 1, life: 0, fade: 1, rest: false, big: false });
      debrisMesh.setMatrixAt(i, hidden);
      debrisMesh.setColorAt(i, white);
    }
    scene.add(debrisMesh);

    trGeo = new T.BufferGeometry();
    trPos = new Float32Array(TR * 6);
    trCol = new Float32Array(TR * 6);
    trGeo.setAttribute('position', new T.BufferAttribute(trPos, 3));
    trGeo.setAttribute('color', new T.BufferAttribute(trCol, 3));
    var lines = new T.LineSegments(trGeo, new T.LineBasicMaterial({ vertexColors: true, transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
    lines.frustumCulled = false;
    scene.add(lines);
    for (var t = 0; t < TR; t++) tracers.push({ a: new T.Vector3(), b: new T.Vector3(), life: 0 });

    for (var f = 0; f < 3; f++) {
      var l = new T.PointLight(0xffa040, 0, 70, 1.6);
      l.position.set(0, -200, 0);
      scene.add(l);
      flashes.push({ light: l, t: 0, dur: 1, peak: 0 });
    }

    var c = document.createElement('canvas');
    c.width = c.height = 128;
    var g = c.getContext('2d');
    var grd = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    grd.addColorStop(0, 'rgba(10,8,6,0.9)');
    grd.addColorStop(0.6, 'rgba(20,16,12,0.6)');
    grd.addColorStop(1, 'rgba(20,16,12,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    var tex = new T.CanvasTexture(c);
    var sGeo = new T.PlaneGeometry(2, 2);
    sGeo.rotateX(-Math.PI / 2);
    scorch = new T.InstancedMesh(sGeo, new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), 60);
    for (var s = 0; s < 60; s++) scorch.setMatrixAt(s, hidden);
    scorch.frustumCulled = false;
    scene.add(scorch);

    for (var r = 0; r < 3; r++) {
      var ring = new T.Mesh(new T.RingGeometry(0.8, 1, 48), new T.MeshBasicMaterial({ color: new T.Color(2, 1.4, 0.8), transparent: true, opacity: 0.8, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.visible = false;
      scene.add(ring);
      rings.push({ mesh: ring, t: 9, power: 1 });
    }
  };

  F.update = function (dt) {
    add.update(dt);
    smoke.update(dt);
    updateDebris(dt);
    updateTracers(dt);
    for (var i = 0; i < flashes.length; i++) {
      var f = flashes[i];
      if (f.t > 0) {
        f.t -= dt;
        f.light.intensity = Math.max(0, f.t / f.dur) * f.peak;
      } else {
        f.light.intensity = 0;
      }
    }
    for (var r = 0; r < rings.length; r++) {
      var ring = rings[r];
      if (ring.t < 0.6) {
        ring.t += dt;
        var s = 1 + ring.t * 40 * ring.power;
        ring.mesh.scale.set(s, s, s);
        ring.mesh.material.opacity = Math.max(0, 0.8 - ring.t * 1.4);
      } else {
        ring.mesh.visible = false;
      }
    }
  };

  F.onResize = function (height, fov, pixelRatio) {
    F.scaleUniform.value = height * pixelRatio / (2 * Math.tan(fov * Math.PI / 360));
  };
})();
