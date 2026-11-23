/*
 * vehicles.js - auto's en helikopters: procedurele modellen (eigen ontwerpen),
 * rijphysics (grip, drift, gewichtsverplaatsing, botsingen, schade, brand, explosie)
 * en een helikopter-vliegmodel met lift en kantelsturing.
 */
(function () {
  'use strict';

  var G = window.G, T = G.T, U = G.U;

  G.VTYPES = {
    kwiek: { name: 'Kwiek', L: 3.8, w: 1.75, wb: 2.4, hb: 0.95, hr: 1.52, cz0: -1.72, cz1: 0.55, rs: 0.18, fs: 0.65, gc: 0.28, wr: 0.33, accel: 9, max: 38, grip: 9, mass: 1000, value: 9000 },
    sedan: { name: 'Sedana', L: 4.7, w: 1.85, wb: 2.8, hb: 0.92, hr: 1.46, cz0: -1.35, cz1: 0.85, rs: 0.55, fs: 0.72, gc: 0.3, wr: 0.36, accel: 10.5, max: 46, grip: 9.5, mass: 1400, value: 18000 },
    vortex: { name: 'Vortex GT', L: 4.5, w: 1.95, wb: 2.7, hb: 0.78, hr: 1.18, cz0: -1.25, cz1: 0.62, rs: 0.85, fs: 0.78, gc: 0.18, wr: 0.35, accel: 17, max: 70, grip: 12.5, mass: 1250, value: 120000 },
    donder: { name: 'Donder', L: 4.85, w: 1.95, wb: 2.9, hb: 0.9, hr: 1.32, cz0: -1.1, cz1: 0.5, rs: 0.7, fs: 0.62, gc: 0.22, wr: 0.37, accel: 14, max: 60, grip: 9, mass: 1600, value: 45000 },
    mammoet: { name: 'Mammoet', L: 4.9, w: 2.0, wb: 2.9, hb: 1.15, hr: 1.88, cz0: -2.25, cz1: 0.75, rs: 0.12, fs: 0.62, gc: 0.42, wr: 0.42, accel: 9.5, max: 42, grip: 8.5, mass: 2100, value: 38000 },
    bus: { name: 'Pakketbus', L: 5.3, w: 2.05, wb: 3.3, hb: 1.1, hr: 2.35, cz0: -2.6, cz1: 1.45, rs: 0.05, fs: 0.45, gc: 0.38, wr: 0.38, accel: 7, max: 36, grip: 8, mass: 2400, value: 22000, opaque: true },
    taxi: { name: 'Taxi', base: 'sedan', taxi: true, value: 16000 },
    politie: { name: 'Politiewagen', base: 'sedan', police: true, accel: 14, max: 56, grip: 11, value: 30000 },
    heli: { name: 'Libel H2', heli: true, L: 9, w: 2.4, color: '#1e88e5', value: 250000 },
    luxeheli: { name: 'Libel Luxe', heli: true, L: 9, w: 2.4, color: '#111111', accent: '#ffc107', value: 600000 },
    politieheli: { name: 'Politieheli', heli: true, L: 9, w: 2.4, color: '#1a237e', accent: '#ffffff', police: true, value: 400000 }
  };
  // Afgeleide types erven de maten van hun basismodel
  Object.keys(G.VTYPES).forEach(function (k) {
    var s = G.VTYPES[k];
    if (s.base) {
      var b = G.VTYPES[s.base];
      for (var p in b) if (!(p in s)) s[p] = b[p];
    }
  });
  G.CAR_COLORS = ['#e53935', '#1e88e5', '#fafafa', '#212121', '#9e9e9e', '#43a047', '#fdd835', '#6a1b9a', '#ff7043', '#00838f', '#5d4037', '#90a4ae', '#c2185b', '#1a237e'];

  var wheelMat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.4 });
  var darkMat = new T.MeshStandardMaterial({ color: 0x151515, roughness: 0.7 });
  var chromeMat = new T.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.15, metalness: 1 });
  var glassMat = new T.MeshStandardMaterial({ color: 0x0c1720, roughness: 0.03, metalness: 0.65, transparent: true, opacity: 0.82 });
  var burntMat = new T.MeshStandardMaterial({ color: 0x1b1a19, roughness: 1, metalness: 0.2 });

  function colorize(geo, col) {
    var c = new T.Color(col);
    var n = geo.attributes.position.count;
    var a = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    geo.setAttribute('color', new T.BufferAttribute(a, 3));
    return geo;
  }

  var wheelGeoCache = {};
  function wheelGeo(r, w) {
    var k = r + '_' + w;
    if (wheelGeoCache[k]) return wheelGeoCache[k];
    var tire = colorize(new T.CylinderGeometry(r, r, w, 20), '#111111');
    var rim = colorize(new T.CylinderGeometry(r * 0.62, r * 0.62, w + 0.02, 12), '#c0c0c0');
    var hub = colorize(new T.CylinderGeometry(r * 0.2, r * 0.2, w + 0.04, 8), '#555555');
    var g = G.A.BufferGeometryUtils.mergeGeometries([tire, rim, hub]);
    g.rotateZ(Math.PI / 2);
    wheelGeoCache[k] = g;
    return g;
  }

  // Zijaanzicht-profiel uitrekken tot een carrosserie
  function extrudeSide(points, width, bevel) {
    var sh = new T.Shape();
    sh.moveTo(points[0][0], points[0][1]);
    for (var i = 1; i < points.length; i++) {
      var p = points[i];
      if (p.length === 4) sh.quadraticCurveTo(p[2], p[3], p[0], p[1]);
      else sh.lineTo(p[0], p[1]);
    }
    var bt = bevel || 0.06;
    var geo = new T.ExtrudeGeometry(sh, { depth: width - bt * 2, bevelEnabled: true, bevelThickness: bt, bevelSize: bt, bevelSegments: 3, curveSegments: 8 });
    geo.rotateY(-Math.PI / 2);
    geo.translate(width / 2 - bt, 0, 0);
    geo.computeVertexNormals();
    return geo;
  }

  function policeTexture() {
    var c = document.createElement('canvas');
    c.width = 512; c.height = 128;
    var g = c.getContext('2d');
    g.fillStyle = '#f7f7f7'; g.fillRect(0, 0, 512, 128);
    g.fillStyle = '#1e40af'; g.fillRect(0, 46, 512, 34);
    for (var i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#1e40af' : '#fbbf24'; g.fillRect(i * 32, 82, 32, 14); }
    g.fillStyle = '#ffffff';
    g.font = 'bold 30px Impact, sans-serif';
    g.textAlign = 'center';
    g.fillText('POLITIE', 256, 74);
    var t = new T.CanvasTexture(c);
    t.colorSpace = T.SRGBColorSpace;
    return t;
  }
  var policeTex = null;

  // Alle losse onderdelen met hetzelfde materiaal samenvoegen tot één mesh (minder draw calls)
  function mergeByMaterial(group) {
    var BGU = G.A.BufferGeometryUtils;
    if (!BGU || !BGU.mergeGeometries) return;
    var buckets = {};
    var order = [];
    group.children.slice().forEach(function (m) {
      if (!m.isMesh) return;
      var g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      ['color', 'uv1', 'uv2'].forEach(function (a) { if (g.getAttribute(a)) g.deleteAttribute(a); });
      if (!g.getAttribute('uv')) return;
      m.updateMatrix();
      g.applyMatrix4(m.matrix);
      var key = m.material.uuid;
      if (!buckets[key]) { buckets[key] = { mat: m.material, geos: [] }; order.push(key); }
      buckets[key].geos.push(g);
      group.remove(m);
      m.geometry.dispose();
    });
    order.forEach(function (k) {
      var b = buckets[k];
      var merged = b.geos.length > 1 ? BGU.mergeGeometries(b.geos, false) : b.geos[0];
      if (!merged) return;
      var mesh = new T.Mesh(merged, b.mat);
      group.add(mesh);
    });
  }

  // ---- Voertuig -------------------------------------------------------------------
  function Vehicle(type, color) {
    var spec = G.VTYPES[type];
    this.type = type;
    this.spec = spec;
    this.isHeli = !!spec.heli;
    this.group = new T.Group();
    this.body = new T.Group();
    this.group.add(this.body);
    this.pos = new T.Vector3();
    this.vel = new T.Vector3();
    this.heading = 0;
    this.yawRate = 0;
    this.steer = 0;
    this.pitchV = 0; this.rollV = 0;
    this.health = this.isHeli ? 900 : 1000;
    this.maxHealth = this.health;
    this.wrecked = false;
    this.burn = 0;
    this.driver = null;
    this.passenger = null;
    this.color = color || spec.color || U.pick(G.CAR_COLORS);
    this.wheels = [];
    this.lightsOn = false;
    this.siren = false;
    this.brake = false;
    this.rotor = 0;
    this.landed = true;
    this.inWater = 0;
    this.halfL = spec.L / 2;
    this.halfW = spec.w / 2;
    if (this.isHeli) this.buildHeli(); else this.buildCar();
    mergeByMaterial(this.body);
    this.group.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    G.scene.add(this.group);
    G.vehicles.list.push(this);
  }
  G.Vehicle = Vehicle;

  Vehicle.prototype.buildCar = function () {
    var s = this.spec, L = s.L, w = s.w, gc = s.gc, hb = s.hb, hr = s.hr;
    var paint = new T.MeshStandardMaterial({ color: s.taxi ? '#ffc400' : (s.police ? '#f7f7f7' : this.color), roughness: 0.22, metalness: 0.55 });
    this.paint = paint;
    var b = this.body;
    var lower = [
      [-L / 2 + 0.2, gc], [-L / 2, gc + 0.18], [-L / 2 - 0.02, hb - 0.12], [-L / 2 + 0.25, hb, -L / 2 + 0.02, hb],
      [L / 2 - 0.6, hb - 0.06], [L / 2 - 0.02, hb - 0.3, L / 2 - 0.1, hb - 0.12], [L / 2, gc + 0.2], [L / 2 - 0.25, gc]
    ];
    var bodyMesh = new T.Mesh(extrudeSide(lower, w, 0.07), paint);
    b.add(bodyMesh);
    // wielkasten (donker) voor diepte
    var wr = s.wr;
    [-1, 1].forEach(function (zs) {
      [-1, 1].forEach(function (xs) {
        var arch = new T.Mesh(new T.CylinderGeometry(wr + 0.05, wr + 0.05, 0.1, 16, 1, false, 0, Math.PI), darkMat);
        arch.rotation.z = Math.PI / 2;
        arch.rotation.y = Math.PI / 2;
        arch.position.set(xs * (w / 2 + 0.005), wr + 0.02, zs * s.wb / 2);
        b.add(arch);
      });
    });
    // cabine (glas) met dak en stijlen in lakkleur
    var cab = [[s.cz0, hb - 0.02], [s.cz0 + s.rs, hr], [s.cz1 - s.fs, hr], [s.cz1, hb - 0.02]];
    var cabMesh = new T.Mesh(extrudeSide(cab, w - 0.16, 0.04), s.opaque ? paint : glassMat);
    b.add(cabMesh);
    var roofLen = (s.cz1 - s.fs) - (s.cz0 + s.rs);
    var roof = new T.Mesh(new T.BoxGeometry(w - 0.18, 0.07, roofLen + 0.1), paint);
    roof.position.set(0, hr + 0.02, (s.cz1 - s.fs + s.cz0 + s.rs) / 2);
    b.add(roof);
    var bz = (s.cz0 + s.cz1) / 2 + 0.1;
    [-1, 1].forEach(function (xs) {
      var pil = new T.Mesh(new T.BoxGeometry(0.07, hr - hb, 0.1), paint);
      pil.position.set(xs * (w / 2 - 0.1), (hr + hb) / 2, bz);
      b.add(pil);
      var mir = new T.Mesh(new T.BoxGeometry(0.22, 0.12, 0.08), paint);
      mir.position.set(xs * (w / 2 + 0.08), hb + 0.08, s.cz1 - 0.1);
      b.add(mir);
    });
    if (s.opaque) {
      var ws = new T.Mesh(new T.PlaneGeometry(w - 0.3, (hr - hb) * 0.75), glassMat);
      ws.position.set(0, hb + (hr - hb) * 0.45, s.cz1 - s.fs * 0.45);
      ws.rotation.x = -Math.atan2(s.fs, hr - hb);
      b.add(ws);
      [-1, 1].forEach(function (xs) {
        var sw = new T.Mesh(new T.PlaneGeometry(0.9, (hr - hb) * 0.6), glassMat);
        sw.position.set(xs * (w / 2 - 0.07), hb + (hr - hb) * 0.45, s.cz1 - s.fs - 0.5);
        sw.rotation.y = xs * Math.PI / 2;
        b.add(sw);
      });
    }
    // bumpers, grille, kenteken
    var bump = new T.BoxGeometry(w + 0.04, 0.2, 0.16);
    var fb = new T.Mesh(bump, darkMat); fb.position.set(0, gc + 0.14, L / 2 + 0.02); b.add(fb);
    var rb = new T.Mesh(bump, darkMat); rb.position.set(0, gc + 0.14, -L / 2 - 0.02); b.add(rb);
    var grille = new T.Mesh(new T.BoxGeometry(w * 0.5, 0.16, 0.04), darkMat);
    grille.position.set(0, hb - 0.32, L / 2 + 0.01);
    b.add(grille);
    var plate = new T.Mesh(new T.BoxGeometry(0.5, 0.12, 0.02), new T.MeshStandardMaterial({ color: 0xf2c200, roughness: 0.5 }));
    plate.position.set(0, gc + 0.3, -L / 2 - 0.08);
    b.add(plate);
    // lichten
    this.headMat = new T.MeshBasicMaterial({ color: new T.Color(0.9, 0.9, 0.85) });
    this.tailMat = new T.MeshBasicMaterial({ color: new T.Color(0.6, 0.03, 0.03) });
    var self = this;
    [-1, 1].forEach(function (xs) {
      var hl = new T.Mesh(new T.BoxGeometry(0.36, 0.12, 0.05), self.headMat);
      hl.position.set(xs * (w / 2 - 0.3), hb - 0.16, L / 2 - 0.03);
      b.add(hl);
      var tl = new T.Mesh(new T.BoxGeometry(0.4, 0.11, 0.05), self.tailMat);
      tl.position.set(xs * (w / 2 - 0.28), hb - 0.12, -L / 2 + 0.01);
      b.add(tl);
    });
    if (s.taxi) {
      var sign = new T.Mesh(new T.BoxGeometry(0.7, 0.22, 0.25), new T.MeshBasicMaterial({ color: new T.Color(1.6, 1.3, 0.3) }));
      sign.position.set(0, hr + 0.17, (s.cz0 + s.cz1) / 2);
      b.add(sign);
      var chk = new T.Mesh(new T.BoxGeometry(w + 0.01, 0.08, 1.6), darkMat);
      chk.position.set(0, hb - 0.32, 0);
      b.add(chk);
    }
    if (s.police) {
      if (!policeTex) policeTex = policeTexture();
      [-1, 1].forEach(function (xs) {
        var dec = new T.Mesh(new T.PlaneGeometry(L * 0.8, 0.42), new T.MeshStandardMaterial({ map: policeTex, roughness: 0.3, metalness: 0.3, transparent: true }));
        dec.position.set(xs * (w / 2 + 0.075), hb - 0.33, 0);
        dec.rotation.y = xs * Math.PI / 2;
        b.add(dec);
      });
      var bar = new T.Mesh(new T.BoxGeometry(1.2, 0.12, 0.3), darkMat);
      bar.position.set(0, hr + 0.1, (s.cz0 + s.cz1) / 2 + 0.1);
      b.add(bar);
      this.blueMat = new T.MeshBasicMaterial({ color: new T.Color(0.05, 0.1, 0.4) });
      this.redMat = new T.MeshBasicMaterial({ color: new T.Color(0.4, 0.03, 0.03) });
      var bl = new T.Mesh(new T.BoxGeometry(0.5, 0.13, 0.28), this.blueMat);
      bl.position.set(0.32, hr + 0.15, (s.cz0 + s.cz1) / 2 + 0.1);
      b.add(bl);
      var rl = new T.Mesh(new T.BoxGeometry(0.5, 0.13, 0.28), this.redMat);
      rl.position.set(-0.32, hr + 0.15, (s.cz0 + s.cz1) / 2 + 0.1);
      b.add(rl);
    }
    // wielen
    var wg = wheelGeo(wr, 0.26);
    [[1, 1], [-1, 1], [1, -1], [-1, -1]].forEach(function (p) {
      var steerG = new T.Group();
      steerG.position.set(p[0] * (w / 2 - 0.14), wr, p[1] * s.wb / 2);
      var wm = new T.Mesh(wg, wheelMat);
      steerG.add(wm);
      self.group.add(steerG);
      self.wheels.push({ g: steerG, m: wm, front: p[1] > 0, x: steerG.position.x, z: steerG.position.z });
    });
    this.seats = [{ x: 0.36, y: hb - 0.5, z: (s.cz0 + s.cz1) / 2 + 0.05 }, { x: -0.36, y: hb - 0.5, z: (s.cz0 + s.cz1) / 2 + 0.05 }];
    this.height = hr;
  };

  Vehicle.prototype.buildHeli = function () {
    var s = this.spec;
    var paint = new T.MeshStandardMaterial({ color: this.color, roughness: 0.25, metalness: 0.5 });
    this.paint = paint;
    var acc = new T.MeshStandardMaterial({ color: s.accent || '#fafafa', roughness: 0.3, metalness: 0.4 });
    var b = this.body;
    var hull = new T.Mesh(new T.SphereGeometry(1, 24, 16), paint);
    hull.scale.set(1.25, 1.15, 2.4);
    hull.position.set(0, 1.65, 0.3);
    b.add(hull);
    var cock = new T.Mesh(new T.SphereGeometry(1, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), glassMat);
    cock.scale.set(1.15, 1.05, 1.5);
    cock.rotation.x = Math.PI / 2.4;
    cock.position.set(0, 1.75, 1.35);
    b.add(cock);
    var stripe = new T.Mesh(new T.BoxGeometry(2.56, 0.18, 3.5), acc);
    stripe.position.set(0, 1.3, 0.1);
    b.add(stripe);
    var boom = new T.Mesh(new T.CylinderGeometry(0.14, 0.3, 5, 10), paint);
    boom.rotation.x = Math.PI / 2;
    boom.position.set(0, 1.95, -3.6);
    b.add(boom);
    var fin = new T.Mesh(new T.BoxGeometry(0.08, 1.3, 0.9), paint);
    fin.position.set(0, 2.5, -5.9);
    fin.rotation.x = -0.3;
    b.add(fin);
    var stab = new T.Mesh(new T.BoxGeometry(1.6, 0.06, 0.5), paint);
    stab.position.set(0, 2.0, -5.3);
    b.add(stab);
    var mast = new T.Mesh(new T.CylinderGeometry(0.1, 0.16, 0.6, 8), darkMat);
    mast.position.set(0, 2.95, 0.2);
    b.add(mast);
    this.mainRotor = new T.Group();
    this.mainRotor.position.set(0, 3.25, 0.2);
    for (var i = 0; i < 4; i++) {
      var bl = new T.Mesh(new T.BoxGeometry(0.28, 0.04, 5.4), darkMat);
      bl.position.z = 2.7;
      var arm = new T.Group();
      arm.rotation.y = i * Math.PI / 2;
      arm.add(bl);
      this.mainRotor.add(arm);
    }
    b.add(this.mainRotor);
    this.tailRotor = new T.Group();
    this.tailRotor.position.set(0.18, 2.55, -5.95);
    for (var j = 0; j < 2; j++) {
      var tb = new T.Mesh(new T.BoxGeometry(0.04, 1.1, 0.12), darkMat);
      var ta = new T.Group();
      ta.rotation.x = j * Math.PI / 2;
      ta.add(tb);
      this.tailRotor.add(ta);
    }
    b.add(this.tailRotor);
    [-1, 1].forEach(function (xs) {
      var skid = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, 3.6, 8), chromeMat);
      skid.rotation.x = Math.PI / 2;
      skid.position.set(xs * 1.0, 0.1, 0.3);
      b.add(skid);
      [-0.8, 1.2].forEach(function (z) {
        var st = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 0.9, 6), chromeMat);
        st.position.set(xs * 0.85, 0.5, z);
        st.rotation.z = xs * 0.3;
        b.add(st);
      });
    });
    this.headMat = new T.MeshBasicMaterial({ color: new T.Color(0.6, 0.6, 0.5) });
    var lamp = new T.Mesh(new T.SphereGeometry(0.14, 8, 6), this.headMat);
    lamp.position.set(0, 0.85, 2.3);
    b.add(lamp);
    this.tailMat = new T.MeshBasicMaterial({ color: new T.Color(2, 0.1, 0.1) });
    var beacon = new T.Mesh(new T.SphereGeometry(0.1, 8, 6), this.tailMat);
    beacon.position.set(0, 3.0, -5.9);
    b.add(beacon);
    this.seats = [{ x: 0.42, y: 0.95, z: 1.0 }, { x: -0.42, y: 0.95, z: 1.0 }];
    this.height = 3.3;
    this.halfL = 3.2;
    this.halfW = 1.6;
  };

  Vehicle.prototype.forward = function (out) { return out.set(Math.sin(this.heading), 0, Math.cos(this.heading)); };

  Vehicle.prototype.localToWorld = function (x, y, z, out) {
    var c = Math.cos(this.heading), s = Math.sin(this.heading);
    return out.set(this.pos.x + x * c + z * s, this.pos.y + y, this.pos.z - x * s + z * c);
  };

  Vehicle.prototype.speed = function () { return Math.sqrt(this.vel.x * this.vel.x + this.vel.z * this.vel.z); };

  Vehicle.prototype.forwardSpeed = function () {
    return this.vel.x * Math.sin(this.heading) + this.vel.z * Math.cos(this.heading);
  };

  // ---- Auto-physics ----------------------------------------------------------------
  var res = { hit: false, nx: 0, nz: 0 };
  var cTmp = new T.Vector3();

  Vehicle.prototype.carPhysics = function (dt, c) {
    var s = this.spec;
    var h = this.heading;
    var fx = Math.sin(h), fz = Math.cos(h), rx = -Math.cos(h), rz = Math.sin(h);
    var vF = this.vel.x * fx + this.vel.z * fz;
    var vR = this.vel.x * rx + this.vel.z * rz;
    var thr = this.wrecked ? 0 : c.throttle || 0;
    var acc = 0;
    this.brake = false;
    if (thr > 0) {
      if (vF < -0.5) { acc = 15 * thr; this.brake = true; }
      else acc = s.accel * thr * Math.max(0, 1 - vF / s.max) * (this.health < 200 ? 0.5 : 1);
    } else if (thr < 0) {
      if (vF > 0.5) { acc = 17 * thr; this.brake = true; }
      else acc = 6 * thr * Math.max(0, 1 + vF / 12);
    }
    if (c.handbrake && Math.abs(vF) > 0.1) { acc -= Math.sign(vF) * 7; this.brake = true; }
    vF += acc * dt;
    var roll = thr === 0 ? 0.25 + Math.abs(vF) * 0.012 : 0;
    vF -= (0.0016 * vF * Math.abs(vF) + roll * Math.sign(vF) * 0.5) * dt;
    if (thr === 0 && !c.handbrake && Math.abs(vF) < 0.3) vF *= 0.9;
    var grip = c.handbrake ? s.grip * 0.16 : s.grip;
    if (this.surface === 'gras' || this.surface === 'zand') grip *= 0.7;
    var lat = vR * (1 - Math.exp(-grip * dt));
    vR -= lat;
    this.slip = Math.abs(vR);
    this.steer = U.damp(this.steer, c.steer || 0, 8, dt);
    var maxSt = 0.62 * (1 - Math.min(0.65, Math.abs(vF) / s.max * 0.85));
    var yawT = vF / s.wb * Math.tan(this.steer * maxSt);
    if (c.handbrake) yawT *= 1.4;
    this.yawRate = U.damp(this.yawRate, yawT, 9, dt);
    this.heading += this.yawRate * dt;
    h = this.heading;
    fx = Math.sin(h); fz = Math.cos(h); rx = -Math.cos(h); rz = Math.sin(h);
    this.vel.x = fx * vF + rx * vR;
    this.vel.z = fz * vF + rz * vR;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    // gewichtsverplaatsing (visueel)
    this.pitchV = U.damp(this.pitchV, U.clamp(-acc * 0.006, -0.06, 0.06), 6, dt);
    this.rollV = U.damp(this.rollV, U.clamp(this.yawRate * vF * 0.012, -0.09, 0.09), 6, dt);
    this.accel = acc;
    this.vF = vF;

    // botsingen met gebouwen: drie cirkels over de lengte
    var r = s.w / 2;
    var offs = [-(s.L / 2 - r), 0, s.L / 2 - r];
    for (var i = 0; i < 3; i++) {
      cTmp.set(this.pos.x + fx * offs[i], this.pos.y, this.pos.z + fz * offs[i]);
      var ox = cTmp.x, oz = cTmp.z;
      if (G.world.collideCircle(cTmp, r, 1.4, res, 0.5)) {
        this.pos.x += cTmp.x - ox;
        this.pos.z += cTmp.z - oz;
        var imp = -(this.vel.x * res.nx + this.vel.z * res.nz);
        if (imp > 0) {
          this.vel.x += res.nx * imp * 1.25;
          this.vel.z += res.nz * imp * 1.25;
          this.vel.multiplyScalar(0.9);
          this.yawRate *= 0.5;
          this.impact(imp);
        }
      }
    }
    // grond, water
    var g = G.world.ground(this.pos.x, this.pos.z);
    this.surface = G.world.surfaceType(this.pos.x, this.pos.z);
    if (g < G.env.WATER_Y - 0.4) {
      this.inWater += dt;
      this.vel.multiplyScalar(Math.exp(-2 * dt));
      this.pos.y = U.damp(this.pos.y, G.env.WATER_Y - 1.2, 1, dt);
      if (this.inWater > 0.2 && !this.splashed) { this.splashed = true; G.fx.splash(this.pos); G.audio.sfx('splash', this.pos); }
      if (this.inWater > 2.5 && !this.wrecked) { this.wrecked = true; this.health = 0; G.emit('vehicleSunk', this); }
    } else {
      this.pos.y = U.damp(this.pos.y, g, 18, dt);
    }
  };

  Vehicle.prototype.impact = function (imp) {
    if (imp < 3) return;
    var force = U.clamp(imp / 12, 0.3, 2);
    G.audio.sfx('crash', this.pos, { force: force });
    if (imp > 5) this.damage((imp - 4) * 30, null, 'botsing');
    if (this.driver && this.driver.isPlayer) {
      G.cam.addShake(Math.min(0.8, imp / 25));
      if (imp > 14) this.driver.damage((imp - 14) * 3, null, null, 'botsing');
    }
    G.emit('vehicleImpact', { v: this, imp: imp });
  };

  // ---- Helikopter-physics --------------------------------------------------------
  Vehicle.prototype.heliPhysics = function (dt, c) {
    var on = !!this.driver && !this.wrecked;
    this.rotor = U.damp(this.rotor, on ? 1 : 0, on ? 0.7 : 0.35, dt);
    var r = this.rotor;
    var air = !this.landed;
    this.pitchA = U.damp(this.pitchA || 0, (c.pitch || 0) * 0.4 * r, 3, dt);
    this.rollA = U.damp(this.rollA || 0, (c.roll || 0) * 0.4 * r, 3, dt);
    if (r > 0.5) this.heading -= (c.yaw || 0) * 1.4 * dt * (air ? 1 : 0.5);
    var h = this.heading;
    var fx = Math.sin(h), fz = Math.cos(h), rx = -Math.cos(h), rz = Math.sin(h);
    var lift = r > 0.85 ? (c.lift || 0) : -0.4;
    var thrust = 9.81 * r * r * (1 + lift * 0.75);
    var sp = Math.sin(this.pitchA), sr = Math.sin(this.rollA);
    var up = Math.cos(this.pitchA) * Math.cos(this.rollA);
    var ax = (fx * sp + rx * sr) * thrust;
    var az = (fz * sp + rz * sr) * thrust;
    var ay = up * thrust - 9.81;
    this.vel.x += (ax - this.vel.x * 0.28) * dt;
    this.vel.z += (az - this.vel.z * 0.28) * dt;
    this.vel.y += (ay - this.vel.y * 0.7) * dt;
    if (this.wrecked) this.vel.y -= 9.81 * dt;
    this.pos.addScaledVector(this.vel, dt);
    if (this.pos.y > 480) { this.pos.y = 480; this.vel.y = Math.min(0, this.vel.y); }
    // botsingen met gebouwen (romp)
    cTmp.copy(this.pos);
    var ox = cTmp.x, oz = cTmp.z;
    if (G.world.collideCircle(cTmp, 2.4, 3.2, res, 0.3)) {
      this.pos.x += cTmp.x - ox;
      this.pos.z += cTmp.z - oz;
      var imp = -(this.vel.x * res.nx + this.vel.z * res.nz);
      if (imp > 0) {
        this.vel.x += res.nx * imp * 1.3;
        this.vel.z += res.nz * imp * 1.3;
        if (imp > 6) this.damage(imp * 35, null, 'botsing');
        G.audio.sfx('crash', this.pos, { force: imp / 10 });
      }
    }
    var g = G.world.surface(this.pos.x, this.pos.z, this.pos.y + 0.3);
    if (g < G.env.WATER_Y) g = G.env.WATER_Y - 0.5;
    if (this.pos.y <= g) {
      var hs = Math.sqrt(this.vel.x * this.vel.x + this.vel.z * this.vel.z);
      if (!this.landed && (this.vel.y < -9 || hs > 14)) this.damage(Math.max(-this.vel.y, hs) * 45, null, 'crash');
      this.pos.y = g;
      if (this.vel.y < 0) this.vel.y = 0;
      this.vel.x *= Math.exp(-6 * dt);
      this.vel.z *= Math.exp(-6 * dt);
      this.landed = true;
      if (g < G.env.WATER_Y - 0.4 && !this.wrecked) { this.wrecked = true; this.health = 0; G.fx.splash(this.pos); }
    } else if (this.pos.y > g + 0.4) {
      this.landed = false;
    }
    this.vF = fx * this.vel.x + fz * this.vel.z;
  };

  // ---- Update en synchronisatie ---------------------------------------------------
  Vehicle.prototype.update = function (dt, controls) {
    controls = controls || {};
    if (this.isHeli) this.heliPhysics(dt, controls); else this.carPhysics(dt, controls);
    var night = G.uniforms.uNight.value;
    // lichten
    if (!this.isHeli) {
      var hl = (this.driver && !this.wrecked) ? (night > 0.3 ? 2.6 : 1.0) : 0.15;
      this.headMat.color.setRGB(hl, hl, hl * 0.92);
      var tl = this.wrecked ? 0.05 : (this.brake ? 3 : (this.driver ? (night > 0.3 ? 1.2 : 0.6) : 0.25));
      this.tailMat.color.setRGB(tl, tl * 0.05, tl * 0.05);
      if (this.blueMat) {
        var fl = this.siren ? (Math.floor(G.uniforms.uTime.value * 8) % 2) : -1;
        this.blueMat.color.setRGB(0.05, 0.15, fl === 0 ? 5 : 0.4);
        this.redMat.color.setRGB(fl === 1 ? 5 : 0.4, 0.05, 0.05);
      }
      // wielen
      var spin = (this.vF || 0) / this.spec.wr * dt;
      for (var i = 0; i < this.wheels.length; i++) {
        var wl = this.wheels[i];
        wl.m.rotation.x += spin;
        if (wl.front) wl.g.rotation.y = this.steer * 0.55;
      }
      if (this.slip > 4.5 && this.driver && Math.random() < 0.7) {
        var rear = this.localToWorld(0, 0.1, -this.spec.wb / 2, cTmp);
        G.fx.tireSmoke(rear);
        if (this.driver.isPlayer) this.screech = true;
      } else this.screech = false;
    } else {
      this.mainRotor.rotation.y += this.rotor * 40 * dt;
      this.tailRotor.rotation.x += this.rotor * 60 * dt;
      var blink = Math.floor(G.uniforms.uTime.value * 1.5) % 2;
      this.tailMat.color.setRGB(blink ? 3 : 0.2, 0.05, 0.05);
      this.headMat.color.setRGB(night > 0.3 ? 3 : 0.6, night > 0.3 ? 3 : 0.6, night > 0.3 ? 2.6 : 0.5);
    }
    // schade: rook en vuur
    if (!this.wrecked) {
      var hpct = this.health / this.maxHealth;
      var engine = this.localToWorld(0, this.isHeli ? 2.6 : this.spec.hb, this.isHeli ? -1 : this.spec.L / 2 - 0.7, cTmp);
      if (hpct < 0.35) G.fx.smoke(engine, 1 - hpct, dt);
      if (hpct < 0.12 || this.burn > 0) {
        this.burn += dt;
        G.fx.fire(engine, 1, dt);
        if (this.burn > 6) this.explode(this.lastAttacker);
      }
    } else if (this.burnT > 0) {
      this.burnT -= dt;
      var cen = this.localToWorld(0, 1, 0, cTmp);
      if (this.burnT > 20) G.fx.fire(cen, 1.3, dt); else G.fx.smoke(cen, 0.8, dt);
    }
    this.sync();
  };

  Vehicle.prototype.sync = function () {
    this.group.position.copy(this.pos);
    this.group.rotation.set(0, this.heading, 0);
    if (this.isHeli) {
      this.body.rotation.set(this.pitchA || 0, 0, this.rollA || 0);
    } else {
      this.body.rotation.set(this.pitchV, 0, this.rollV);
    }
  };

  Vehicle.prototype.damage = function (amount, attacker, kind) {
    if (this.wrecked) return;
    if (attacker) this.lastAttacker = attacker;
    this.health -= amount;
    if (this.health <= 0) {
      if (kind === 'explosie' || kind === 'crash' || this.isHeli) this.explode(attacker);
      else this.burn = Math.max(this.burn, 3);
    }
    G.emit('vehicleDamaged', { v: this, amount: amount, attacker: attacker });
  };

  Vehicle.prototype.explode = function (attacker) {
    if (this.exploded) return;
    this.exploded = true;
    this.wrecked = true;
    this.health = 0;
    this.burnT = 45;
    var p = this.pos.clone();
    p.y += 1;
    var self = this;
    this.group.traverse(function (o) {
      if (o.isMesh && (o.material === self.paint || o.material === glassMat)) o.material = burntMat;
    });
    this.vel.y += this.isHeli ? 0 : 6;
    this.vel.x += U.rand(-2, 2);
    this.vel.z += U.rand(-2, 2);
    G.combat.explosion(p, this.isHeli ? 1.5 : 1.15, attacker, this);
    G.emit('vehicleExploded', { v: this, attacker: attacker });
  };

  Vehicle.prototype.remove = function () {
    G.scene.remove(this.group);
    var i = G.vehicles.list.indexOf(this);
    if (i >= 0) G.vehicles.list.splice(i, 1);
    this.removed = true;
    if (this.sirenSound) { this.sirenSound.stop(); this.sirenSound = null; }
  };

  // Werelpositie van een stoel
  Vehicle.prototype.seatWorld = function (i, out) {
    var s = this.seats[i] || this.seats[0];
    return this.localToWorld(s.x, s.y, s.z, out);
  };

  // Uitstappunt naast de deur
  Vehicle.prototype.doorWorld = function (side, out) {
    var x = side * (this.halfW + 0.9);
    return this.localToWorld(x, 0, this.isHeli ? 1 : 0, out);
  };

  // ---- Beheer van alle voertuigen ------------------------------------------------
  G.vehicles = {
    list: [],
    // Botsingen tussen voertuigen (cirkel-benadering)
    collidePairs: function () {
      var L = this.list;
      for (var i = 0; i < L.length; i++) {
        var a = L[i];
        if (a.isHeli && !a.landed) continue;
        for (var j = i + 1; j < L.length; j++) {
          var b = L[j];
          if (b.isHeli && !b.landed) continue;
          var dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
          var rr = (a.halfL + b.halfL) * 0.7;
          var d2 = dx * dx + dz * dz;
          if (d2 > rr * rr * 1.6 || d2 < 1e-6) continue;
          if (Math.abs(a.pos.y - b.pos.y) > 2) continue;
          // nauwkeuriger: twee cirkels per auto
          var hit = this.circleHit(a, b);
          if (!hit) continue;
          var nx = hit.nx, nz = hit.nz, pen = hit.pen;
          var ma = a.spec.mass || 1500, mb = b.spec.mass || 1500;
          var ta = mb / (ma + mb), tb = ma / (ma + mb);
          a.pos.x -= nx * pen * ta; a.pos.z -= nz * pen * ta;
          b.pos.x += nx * pen * tb; b.pos.z += nz * pen * tb;
          var rv = (b.vel.x - a.vel.x) * nx + (b.vel.z - a.vel.z) * nz;
          if (rv < 0) {
            var jimp = -1.3 * rv;
            a.vel.x -= nx * jimp * ta; a.vel.z -= nz * jimp * ta;
            b.vel.x += nx * jimp * tb; b.vel.z += nz * jimp * tb;
            if (-rv > 3) {
              a.impact(-rv * ta * 1.4);
              b.impact(-rv * tb * 1.4);
              a.yawRate += U.rand(-1, 1) * -rv * 0.04;
              b.yawRate += U.rand(-1, 1) * -rv * 0.04;
              G.emit('carCrash', { a: a, b: b, force: -rv });
            }
          }
        }
      }
    },
    circleHit: function (a, b) {
      var best = null;
      var pa = [], pb = [];
      [a, b].forEach(function (v, k) {
        var r = v.halfW;
        var off = Math.max(0, v.halfL - r);
        var fx = Math.sin(v.heading), fz = Math.cos(v.heading);
        var arr = k === 0 ? pa : pb;
        arr.push([v.pos.x + fx * off, v.pos.z + fz * off, r]);
        arr.push([v.pos.x - fx * off, v.pos.z - fz * off, r]);
      });
      for (var i = 0; i < 2; i++) {
        for (var j = 0; j < 2; j++) {
          var dx = pb[j][0] - pa[i][0], dz = pb[j][1] - pa[i][1];
          var rr = pa[i][2] + pb[j][2];
          var d2 = dx * dx + dz * dz;
          if (d2 < rr * rr && d2 > 1e-6) {
            var d = Math.sqrt(d2);
            var pen = rr - d;
            if (!best || pen > best.pen) best = { nx: dx / d, nz: dz / d, pen: pen };
          }
        }
      }
      return best;
    },
    nearest: function (p, maxD, filter) {
      var best = null, bd = maxD;
      for (var i = 0; i < this.list.length; i++) {
        var v = this.list[i];
        if (filter && !filter(v)) continue;
        var d = U.dist2(v.pos.x, v.pos.z, p.x, p.z);
        if (Math.abs(v.pos.y - p.y) > 4) continue;
        if (d < bd) { bd = d; best = v; }
      }
      return best;
    }
  };
})();
