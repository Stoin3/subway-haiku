/*
 * city.js - genereert HAVENSTAD: wegen, wijken, gebouwen (sloopbaar), park, strand, haven,
 * speciale gebouwen met interieur, bomen, lantaarns, botsingen en raycasts.
 */
(function () {
  'use strict';

  var G = window.G, T = G.T, U = G.U;
  var W = G.world = {};

  // ---- Afmetingen ------------------------------------------------------------
  var P = W.P = 100;          // afstand tussen straten
  var RW = W.RW = 16;         // breedte van een straat
  var LOT = 42;               // halve kavel incl. stoep
  var INNER = 38;             // halve kavel zonder stoep
  var CS = W.CS = 4;          // horizontale celgrootte van gebouwen (voor sloop)
  var FH = W.FH = 3.5;        // verdiepingshoogte
  var IMIN = -8, IMAX = 8, JMIN = -8, JMAX = 6;
  var X0 = -808, X1 = 808, Z0 = -808, Z1 = 608;
  var PLINTH = 0.2;
  W.LANE = 3.8;
  W.bounds = { x0: -1150, x1: 1150, z0: -1150, z1: 1400 };
  W.IMIN = IMIN; W.IMAX = IMAX; W.JMIN = JMIN; W.JMAX = JMAX;

  var rng = U.rng(20261123);
  function r(a, b) { return a + rng() * (b - a); }
  function ri(n) { return Math.floor(rng() * n); }
  function rp(arr) { return arr[Math.floor(rng() * arr.length)]; }

  // ---- Terrein ---------------------------------------------------------------
  function vnoise(x, z) {
    var s = Math.sin(x * 0.013 + z * 0.007) * 0.5 + Math.sin(x * 0.031 - z * 0.023) * 0.3 + Math.sin(x * 0.071 + z * 0.053) * 0.2;
    return s;
  }

  function terrain(x, z) {
    var ox = Math.max(0, Math.abs(x) - 840);
    var oz = Math.max(0, -840 - z);
    var e = Math.sqrt(ox * ox + oz * oz);
    var h = 0;
    if (e > 0) h = Math.pow(e, 1.22) * 0.32 + Math.max(0, vnoise(x, z)) * Math.min(1, e / 60) * 14;
    if (z > 640) {
      var b = 0.2 - (z - 640) * 0.012;
      if (e <= 0) h = b; else h = Math.min(h, b + e * 0.3);
    }
    return h;
  }
  W.terrain = terrain;

  function inLots(x, z) {
    if (x < X0 || x > X1 || z < Z0 || z > Z1) return false;
    var fx = x - Math.round(x / P) * P;
    var fz = z - Math.round(z / P) * P;
    return Math.abs(fx) > RW / 2 && Math.abs(fz) > RW / 2;
  }
  W.inLots = inLots;

  W.isRoad = function (x, z) {
    if (x < X0 || x > X1 || z < Z0 || z > Z1) return false;
    var fx = x - Math.round(x / P) * P;
    var fz = z - Math.round(z / P) * P;
    return Math.abs(fx) <= RW / 2 || Math.abs(fz) <= RW / 2;
  };

  // Puinhoogte (ingestorte gebouwen stapelen op)
  var rubble = {};
  function rkey(x, z) { return Math.floor(x / 2) * 100000 + Math.floor(z / 2); }
  W.rubbleAt = function (x, z) { return rubble[rkey(x, z)] || 0; };
  W.addRubble = function (x, z, h) {
    var k = rkey(x, z);
    rubble[k] = Math.min(14, (rubble[k] || 0) + h);
    return rubble[k];
  };

  W.ground = function (x, z) {
    var g;
    if (inLots(x, z)) g = PLINTH;
    else if (z >= Z1 && z <= 640 && Math.abs(x) <= 840) g = PLINTH;
    else g = terrain(x, z);
    var rb = rubble[rkey(x, z)];
    return rb ? g + rb : g;
  };

  W.surfaceType = function (x, z) {
    if (z > 640) return 'zand';
    if (W.isRoad(x, z)) return 'asfalt';
    var b = W.blockAt(x, z);
    if (b && (b.district === 'park' || b.district === 'woon')) return 'gras';
    return 'steen';
  };

  // ---- Colliders en ruimtelijke hash -------------------------------------------
  var HC = 20;
  var hash = {};
  var colliders = W.colliders = [];
  var qid = 1;
  function hk(ix, iz) { return ix * 73856 + iz * 19349663; }

  function addCollider(c) {
    colliders.push(c);
    var x0 = Math.floor(c.minX / HC), x1 = Math.floor(c.maxX / HC);
    var z0 = Math.floor(c.minZ / HC), z1 = Math.floor(c.maxZ / HC);
    for (var ix = x0; ix <= x1; ix++) {
      for (var iz = z0; iz <= z1; iz++) {
        var k = hk(ix, iz);
        (hash[k] || (hash[k] = [])).push(c);
      }
    }
    return c;
  }
  W.addCollider = function (minX, minY, minZ, maxX, maxY, maxZ, kind, b) {
    return addCollider({ minX: minX, minY: minY, minZ: minZ, maxX: maxX, maxY: maxY, maxZ: maxZ, kind: kind || 'wall', b: b || null, off: false });
  };
  W.removeCollider = function (c) { c.off = true; };

  W.query = function (minX, minZ, maxX, maxZ, out) {
    out = out || [];
    out.length = 0;
    qid++;
    var x0 = Math.floor(minX / HC), x1 = Math.floor(maxX / HC);
    var z0 = Math.floor(minZ / HC), z1 = Math.floor(maxZ / HC);
    for (var ix = x0; ix <= x1; ix++) {
      for (var iz = z0; iz <= z1; iz++) {
        var list = hash[hk(ix, iz)];
        if (!list) continue;
        for (var i = 0; i < list.length; i++) {
          var c = list[i];
          if (c.q === qid || c.off) continue;
          c.q = qid;
          if (c.maxX < minX || c.minX > maxX || c.maxZ < minZ || c.minZ > maxZ) continue;
          out.push(c);
        }
      }
    }
    return out;
  };

  var qbuf = [];

  function pushOut(pos, r, minX, maxX, minZ, maxZ, res) {
    var cx = U.clamp(pos.x, minX, maxX);
    var cz = U.clamp(pos.z, minZ, maxZ);
    var dx = pos.x - cx, dz = pos.z - cz;
    var d2 = dx * dx + dz * dz;
    if (d2 >= r * r) return false;
    var nx, nz, push;
    if (d2 > 1e-8) {
      var d = Math.sqrt(d2);
      nx = dx / d; nz = dz / d;
      push = r - d;
    } else {
      // middelpunt zit binnen de doos: kortste weg naar buiten
      var l = pos.x - minX, rr = maxX - pos.x, b = pos.z - minZ, f = maxZ - pos.z;
      var m = Math.min(l, rr, b, f);
      if (m === l) { nx = -1; nz = 0; push = l + r; }
      else if (m === rr) { nx = 1; nz = 0; push = rr + r; }
      else if (m === b) { nx = 0; nz = -1; push = b + r; }
      else { nx = 0; nz = 1; push = f + r; }
    }
    pos.x += nx * push;
    pos.z += nz * push;
    if (res) {
      res.hit = true;
      res.nx = nx; res.nz = nz;
    }
    return true;
  }

  // Cirkel (personage/voertuig) uit gebouwen duwen. y..y+h is de hoogte van het object.
  W.collideCircle = function (pos, r, h, res, step) {
    if (res) { res.hit = false; res.b = null; res.c = null; }
    var stepH = step === undefined ? 0.45 : step;
    var list = W.query(pos.x - r, pos.z - r, pos.x + r, pos.z + r, qbuf);
    var any = false;
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c.maxY <= pos.y + stepH || c.minY >= pos.y + h) continue;
      if (c.b && c.b.chunks) {
        if (collideCells(c.b, pos, r, h, stepH, res)) { any = true; if (res) { res.b = c.b; res.c = c; } }
      } else if (pushOut(pos, r, c.minX, c.maxX, c.minZ, c.maxZ, res)) {
        any = true;
        if (res) { res.b = c.b; res.c = c; }
      }
    }
    return any;
  };

  function collideCells(b, pos, r, h, stepH, res) {
    var ch = b.chunks;
    var any = false;
    var ix0 = Math.max(0, Math.floor((pos.x - r - ch.x0) / CS)), ix1 = Math.min(ch.nx - 1, Math.floor((pos.x + r - ch.x0) / CS));
    var iz0 = Math.max(0, Math.floor((pos.z - r - ch.z0) / CS)), iz1 = Math.min(ch.nz - 1, Math.floor((pos.z + r - ch.z0) / CS));
    var iy0 = Math.max(0, Math.floor((pos.y + stepH - ch.y0) / FH)), iy1 = Math.min(ch.ny - 1, Math.floor((pos.y + h - ch.y0) / FH));
    for (var ix = ix0; ix <= ix1; ix++) {
      for (var iz = iz0; iz <= iz1; iz++) {
        for (var iy = iy0; iy <= iy1; iy++) {
          if (!ch.cells[cellIndex(ch, ix, iy, iz)]) continue;
          var top = ch.y0 + (iy + 1) * FH;
          if (top <= pos.y + stepH) continue;
          if (pushOut(pos, r, ch.x0 + ix * CS, ch.x0 + (ix + 1) * CS, ch.z0 + iz * CS, ch.z0 + (iz + 1) * CS, res)) { any = true; break; }
        }
      }
    }
    return any;
  }

  function cellIndex(ch, ix, iy, iz) { return (iy * ch.nz + iz) * ch.nx + ix; }
  W.cellIndex = cellIndex;

  // Hoogste beloopbare oppervlak onder (x,z) dat niet hoger is dan y + 0.6
  W.surface = function (x, z, y) {
    var g = W.ground(x, z);
    var lim = y + 0.6;
    var list = W.query(x, z, x, z, qbuf);
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (x < c.minX || x > c.maxX || z < c.minZ || z > c.maxZ) continue;
      var top;
      if (c.b && c.b.chunks) {
        top = columnTop(c.b.chunks, x, z, lim);
      } else {
        top = c.maxY;
        if (top > lim) top = -1e9;
      }
      if (top > g) g = top;
    }
    return g;
  };

  function columnTop(ch, x, z, lim) {
    var ix = Math.floor((x - ch.x0) / CS), iz = Math.floor((z - ch.z0) / CS);
    if (ix < 0 || iz < 0 || ix >= ch.nx || iz >= ch.nz) return -1e9;
    for (var iy = ch.ny - 1; iy >= 0; iy--) {
      var top = ch.y0 + (iy + 1) * FH;
      if (top > lim) continue;
      if (ch.cells[cellIndex(ch, ix, iy, iz)]) return top;
    }
    return -1e9;
  }

  // ---- Raycast -----------------------------------------------------------------
  function slab(o, d, minX, minY, minZ, maxX, maxY, maxZ, out) {
    var tmin = 0, tmax = 1e9, n = 0, ax = 0;
    var mins = [minX, minY, minZ], maxs = [maxX, maxY, maxZ];
    var os = [o.x, o.y, o.z], ds = [d.x, d.y, d.z];
    for (var a = 0; a < 3; a++) {
      if (Math.abs(ds[a]) < 1e-9) {
        if (os[a] < mins[a] || os[a] > maxs[a]) return -1;
      } else {
        var inv = 1 / ds[a];
        var t1 = (mins[a] - os[a]) * inv, t2 = (maxs[a] - os[a]) * inv;
        var sgn = -1;
        if (t1 > t2) { var tt = t1; t1 = t2; t2 = tt; sgn = 1; }
        if (t1 > tmin) { tmin = t1; ax = a; n = sgn; }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) return -1;
      }
    }
    if (out) { out.axis = ax; out.sign = n; }
    return tmin;
  }
  W.slab = slab;

  var rayTmp = {};
  var seen = [];
  // Geeft {t, point, normal, c, b} of null. Houdt rekening met gesloopte gebouwen.
  W.raycast = function (o, d, maxD, opts) {
    opts = opts || {};
    var best = maxD, bestC = null, bestAx = 0, bestSign = 0, bestB = null;
    qid++;
    var stamp = qid;
    // DDA door het hash-raster
    var x = o.x, z = o.z;
    var ix = Math.floor(x / HC), iz = Math.floor(z / HC);
    var stepX = d.x > 0 ? 1 : -1, stepZ = d.z > 0 ? 1 : -1;
    var tDX = Math.abs(d.x) > 1e-9 ? Math.abs(HC / d.x) : 1e9;
    var tDZ = Math.abs(d.z) > 1e-9 ? Math.abs(HC / d.z) : 1e9;
    var nbx = (stepX > 0 ? (ix + 1) * HC : ix * HC);
    var nbz = (stepZ > 0 ? (iz + 1) * HC : iz * HC);
    var tMX = Math.abs(d.x) > 1e-9 ? (nbx - x) / d.x : 1e9;
    var tMZ = Math.abs(d.z) > 1e-9 ? (nbz - z) / d.z : 1e9;
    var tCur = 0;
    for (var guard = 0; guard < 200 && tCur <= best; guard++) {
      var list = hash[hk(ix, iz)];
      if (list) {
        for (var i = 0; i < list.length; i++) {
          var c = list[i];
          if (c.off || c.rq === stamp) continue;
          c.rq = stamp;
          if (opts.ignore && opts.ignore(c)) continue;
          if (c.b && c.b.chunks) {
            var hc = rayCells(c.b, o, d, best);
            if (hc) { best = hc.t; bestC = c; bestB = c.b; bestAx = hc.axis; bestSign = hc.sign; }
          } else {
            var t = slab(o, d, c.minX, c.minY, c.minZ, c.maxX, c.maxY, c.maxZ, rayTmp);
            if (t >= 0 && t < best) { best = t; bestC = c; bestB = c.b; bestAx = rayTmp.axis; bestSign = rayTmp.sign; }
          }
        }
      }
      if (tMX < tMZ) { tCur = tMX; tMX += tDX; ix += stepX; }
      else { tCur = tMZ; tMZ += tDZ; iz += stepZ; }
    }
    // Grond (stapsgewijs, met verfijning)
    var groundT = -1;
    if (!opts.noGround && d.y < 0.3) {
      var stepL = 1.5, tt = 0, prevT = 0;
      while (tt < best) {
        var px = o.x + d.x * tt, py = o.y + d.y * tt, pz = o.z + d.z * tt;
        if (py < W.ground(px, pz)) {
          var lo = prevT, hi = tt;
          for (var k = 0; k < 7; k++) {
            var mid = (lo + hi) / 2;
            if (o.y + d.y * mid < W.ground(o.x + d.x * mid, o.z + d.z * mid)) hi = mid; else lo = mid;
          }
          groundT = hi;
          break;
        }
        prevT = tt;
        tt += stepL;
        if (tt > 60) stepL = 4;
      }
      if (groundT >= 0 && groundT < best) { best = groundT; bestC = null; bestB = null; }
    }
    if (!bestC && groundT < 0) return null;
    var res = { t: best, point: new T.Vector3(o.x + d.x * best, o.y + d.y * best, o.z + d.z * best), normal: new T.Vector3(), c: bestC, b: bestB };
    if (bestC) {
      if (bestAx === 0) res.normal.set(bestSign, 0, 0);
      else if (bestAx === 1) res.normal.set(0, bestSign, 0);
      else res.normal.set(0, 0, bestSign);
    } else {
      res.normal.set(0, 1, 0);
      res.ground = true;
    }
    return res;
  };

  function rayCells(b, o, d, maxT) {
    var ch = b.chunks;
    var t0 = slab(o, d, ch.x0, ch.y0, ch.z0, ch.x0 + ch.nx * CS, ch.y0 + ch.ny * FH, ch.z0 + ch.nz * CS, null);
    if (t0 < 0 || t0 > maxT) return null;
    var best = null;
    var tmp2 = {};
    for (var i = 0; i < ch.cells.length; i++) {
      if (!ch.cells[i]) continue;
      var ix = i % ch.nx, rest = (i - ix) / ch.nx, iz = rest % ch.nz, iy = (rest - iz) / ch.nz;
      var mx = ch.x0 + ix * CS, my = ch.y0 + iy * FH, mz = ch.z0 + iz * CS;
      var t = slab(o, d, mx, my, mz, mx + CS, my + FH, mz + CS, tmp2);
      if (t >= 0 && t < maxT) { maxT = t; best = { t: t, axis: tmp2.axis, sign: tmp2.sign }; }
    }
    return best;
  }

  W.lineClear = function (a, b) {
    var d = new T.Vector3().subVectors(b, a);
    var len = d.length();
    if (len < 0.01) return true;
    d.divideScalar(len);
    return !W.raycast(a, d, len - 0.3, { noGround: true });
  };

  // ---- Wijken ------------------------------------------------------------------
  W.blocks = [];
  var blockMap = {};
  W.blockAt = function (x, z) {
    var bi = Math.floor(x / P), bj = Math.floor(z / P);
    return blockMap[bi + ',' + bj] || null;
  };

  var SPECIAL = {
    '0,0': 'appartement', '1,0': 'kleding', '-1,0': 'bank', '0,-1': 'wapens', '1,-1': 'ramen',
    '-1,-1': 'spuiterij', '-2,0': 'ziekenhuis', '2,0': 'politie', '0,1': 'bouwplaats',
    '3,-1': 'heliport', '2,-1': 'arcade', '-4,-2': 'super', '3,3': 'super', '-5,4': 'super', '4,-5': 'super',
    '-1,1': 'fabriek', '5,3': 'bende', '4,2': 'havengarage',
    '-3,1': 'park', '-2,1': 'park', '-3,2': 'park', '-2,2': 'park'
  };

  function districtOf(bi, bj) {
    var cx = (bi + 0.5) * P, cz = (bj + 0.5) * P;
    var key = bi + ',' + bj;
    if (SPECIAL[key] === 'park') return 'park';
    if (SPECIAL[key]) return 'special';
    if (bi >= 4 && bj >= 1) return 'haven';
    var rr = Math.max(Math.abs(cx), Math.abs(cz));
    if (rr < 260) return 'centrum';
    if (rr < 480) return 'midden';
    return 'woon';
  }

  // ---- Gebouwen ------------------------------------------------------------------
  W.buildings = [];
  var PALETTE = {
    centrum: ['#8fa3b8', '#6d7f91', '#a9b6c2', '#c9c2b6', '#4e6a7d', '#b7c4cf', '#d8d4cc', '#7b8d8f'],
    midden: ['#a0644a', '#c8ad8a', '#d9cbb0', '#8b6f5a', '#e0d6c3', '#b98b6e', '#9e9f8e', '#c4b5a0'],
    woon: ['#e8d8c4', '#f1e3cf', '#d6c1a8', '#e7c6b5', '#cbd5c0', '#e9e2d0', '#d9b99b', '#c9d6df'],
    haven: ['#8c8f93', '#6d7a86', '#9a7b5f', '#7b8f86', '#a8a39a', '#5f6b75']
  };
  var STYLE = { centrum: 2, midden: 1, woon: 0, haven: 3, special: 1 };

  function snap(v, s) { return Math.max(s, Math.round(v / s) * s); }

  function addBuilding(x, z, w, d, floors, district, opts) {
    opts = opts || {};
    w = snap(w, CS); d = snap(d, CS);
    var b = {
      id: W.buildings.length, x: x, z: z, w: w, d: d, h: floors * FH, floors: floors, y0: PLINTH,
      district: district, color: opts.color || rp(PALETTE[district] || PALETTE.midden),
      style: opts.style !== undefined ? opts.style : STYLE[district], seed: rng() * 100,
      destructible: opts.destructible !== false, chunks: null, destroyed: false, props: [], name: opts.name || null
    };
    W.buildings.push(b);
    b.collider = addCollider({
      minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, minY: 0, maxY: PLINTH + b.h, kind: 'building', b: b, off: false
    });
    return b;
  }
  W.addBuilding = addBuilding;

  function genBlock(bi, bj) {
    var cx = (bi + 0.5) * P, cz = (bj + 0.5) * P;
    var district = districtOf(bi, bj);
    var block = { bi: bi, bj: bj, cx: cx, cz: cz, district: district, special: SPECIAL[bi + ',' + bj] || null };
    W.blocks.push(block);
    blockMap[bi + ',' + bj] = block;
    if (district === 'special' || district === 'park') return;

    var pat = rng();
    if (district === 'centrum') {
      if (pat < 0.3) {
        addBuilding(cx, cz, r(40, 64), r(40, 64), 14 + ri(26), district);
      } else if (pat < 0.65) {
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) {
          addBuilding(cx + q[0] * 19, cz + q[1] * 19, r(24, 32), r(24, 32), 8 + ri(24), district);
        });
      } else {
        [-1, 1].forEach(function (s) {
          addBuilding(cx + s * 19, cz, r(28, 32), r(48, 68), 8 + ri(18), district);
        });
      }
    } else if (district === 'midden') {
      if (pat < 0.5) {
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) {
          if (rng() < 0.85) addBuilding(cx + q[0] * 19, cz + q[1] * 19, r(24, 32), r(24, 32), 3 + ri(8), district);
        });
      } else {
        [-1, 1].forEach(function (s) {
          addBuilding(cx + s * 19, cz, r(28, 32), r(40, 68), 4 + ri(8), district);
        });
      }
    } else if (district === 'woon') {
      for (var gx = -1; gx <= 1; gx++) {
        for (var gz = -1; gz <= 1; gz++) {
          if (gx === 0 && gz === 0) { block.garden = true; continue; }
          if (rng() < 0.15) continue;
          addBuilding(cx + gx * 25, cz + gz * 25, r(12, 16), r(12, 16), 1 + ri(3), district);
        }
      }
    } else if (district === 'haven') {
      addBuilding(cx - 14, cz - 10, r(32, 44), r(24, 40), 2 + ri(2), district);
      if (rng() < 0.6) addBuilding(cx + 22, cz + 18, r(20, 28), r(20, 28), 2 + ri(2), district);
      block.containers = true;
    }
  }

  // ---- Materialen ----------------------------------------------------------------
  function facadeMaterial() {
    var m = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, metalness: 0.05 });
    return G.patchWorld(m, {
      key: 'facade',
      vhead: 'attribute vec2 aBld;\nvarying vec2 vBld;\n',
      vmain: 'vBld = aBld;',
      head: 'varying vec2 vBld;\n',
      color: [
        'float owWin = 0.0; float owLit = 0.0;',
        'vec3 an = abs(vWN);',
        'float owRoof = step(0.6, an.y);',
        'vec2 fu = an.x > an.z ? vWP.zy : vWP.xy;',
        'float st = vBld.x;',
        'float colW = st > 1.5 ? (st > 2.5 ? 6.0 : 2.0) : (st > 0.5 ? 3.0 : 3.5);',
        'vec2 cell = vec2(fu.x / colW, (fu.y - 0.2) / 3.5);',
        'vec2 cf = fract(cell);',
        'float mx = st > 1.5 && st < 2.5 ? 0.07 : 0.2;',
        'float y0 = st > 2.5 ? 0.6 : 0.24;',
        'owWin = step(mx, cf.x) * step(cf.x, 1.0 - mx) * step(y0, cf.y) * step(cf.y, 0.86);',
        'owWin *= (1.0 - owRoof) * step(0.6, fu.y);',
        'float gfloor = 1.0 - step(1.0, cell.y);',
        'owWin = max(owWin, gfloor * (1.0 - owRoof) * step(0.12, cf.x) * step(cf.x, 0.88) * step(0.12, cf.y) * step(cf.y, 0.78) * step(st, 2.5));',
        'float hv = owHash(floor(cell) + vBld.y);',
        'vec3 glass = vec3(0.05, 0.08, 0.12) + hv * 0.05;',
        'float dirt = 0.88 + 0.12 * owNoise(fu * vec2(0.4, 0.15) + vBld.y);',
        'diffuseColor.rgb *= dirt;',
        'float band = step(0.9, fract((fu.y - 0.2) / 3.5)) * step(1.5, st) * step(st, 2.5);',
        'diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.75, band);',
        'diffuseColor.rgb = mix(diffuseColor.rgb, glass, owWin);',
        'diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.33, 0.33, 0.34) * (0.8 + 0.3 * owNoise(vWP.xz * 0.5)), owRoof);',
        'owLit = step(0.6, owHash(floor(cell) * 1.37 + vBld.y * 1.7)) * owWin;'
      ].join('\n'),
      rough: 'roughnessFactor = mix(roughnessFactor, 0.06, owWin); metalnessFactor = mix(metalnessFactor, 0.55, owWin);',
      emissive: 'totalEmissiveRadiance += owLit * uNight * vec3(1.0, 0.78, 0.48) * (0.9 + owHash(floor(cell) + 3.1) * 0.9);'
    });
  }

  function pavingMaterial(color, key, grass) {
    var m = new T.MeshStandardMaterial({ color: color, roughness: 0.92 });
    return G.patchWorld(m, {
      key: key,
      color: grass ? [
        'float gn = owFbm(vWP.xz * 0.15);',
        'diffuseColor.rgb *= 0.75 + gn * 0.5;',
        'diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.1, 1.05, 0.7), owNoise(vWP.xz * 0.05));'
      ].join('\n') : [
        'vec2 tp = vWP.xz / 1.5;',
        'vec2 tf = abs(fract(tp) - 0.5);',
        'float joint = step(0.46, max(tf.x, tf.y));',
        'diffuseColor.rgb *= (0.92 + owHash(floor(tp)) * 0.1) * (1.0 - joint * 0.25);',
        'diffuseColor.rgb *= 0.9 + 0.1 * owNoise(vWP.xz * 0.08);'
      ].join('\n')
    });
  }

  function terrainMaterial() {
    var m = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
    return G.patchWorld(m, {
      key: 'terrain',
      color: [
        'vec2 wp = vWP.xz;',
        'vec2 f = wp - floor(wp / 100.0 + 0.5) * 100.0;',
        'float inside = step(-808.0, wp.x) * step(wp.x, 808.0) * step(-808.0, wp.y) * step(wp.y, 608.0);',
        'float rv = step(abs(f.x), 8.0) * inside;',
        'float rh = step(abs(f.y), 8.0) * inside;',
        'float road = max(rv, rh);',
        'float owMark = 0.0;',
        'diffuseColor.rgb *= 0.85 + 0.3 * owFbm(wp * 0.08);',
        'if (road > 0.5) {',
        '  vec3 asphalt = vec3(0.15, 0.155, 0.16) * (0.85 + owNoise(wp * 0.9) * 0.2 + owNoise(wp * 6.0) * 0.1);',
        '  asphalt = mix(asphalt, asphalt * 0.7, smoothstep(0.55, 0.75, owFbm(wp * 0.05)) * 0.6);',
        '  vec3 mcol = vec3(0.92);',
        '  if (rv * rh < 0.5) {',
        '    float across = rv > 0.5 ? f.x : f.y;',
        '    float along = rv > 0.5 ? wp.y : wp.x;',
        '    float toInt = abs(rv > 0.5 ? f.y : f.x);',
        '    if (abs(abs(across) - 0.2) < 0.08 && toInt > 12.0) { owMark = 1.0; mcol = vec3(0.95, 0.72, 0.12); }',
        '    if (abs(abs(across) - 7.3) < 0.09) owMark = 1.0;',
        '    if (abs(abs(across) - 3.8) < 0.08 && fract(along / 6.0) < 0.5 && toInt > 12.0) owMark = 0.0;',
        '    if (toInt > 8.5 && toInt < 11.5 && fract(across * 0.5) < 0.5 && abs(across) < 7.2) owMark = 1.0;',
        '    if (toInt > 11.9 && toInt < 12.3 && abs(across) < 7.2 && across * (rv > 0.5 ? sign(f.y) : -sign(f.x)) > 0.0) owMark = 1.0;',
        '  }',
        '  diffuseColor.rgb = mix(asphalt, mcol, owMark * 0.85);',
        '}'
      ].join('\n'),
      rough: 'if (road > 0.5) roughnessFactor = mix(0.85, 0.55, owMark);'
    });
  }

  // ---- Interieurs en speciale gebouwen -----------------------------------------
  W.specials = {};
  W.spots = {};          // interactiepunten op naam
  W.pois = [];           // kaartsymbolen
  W.interiors = [];      // binnenruimtes (voor licht/spiegel)
  W.signMats = [];
  W.parkedSpawns = [];   // geparkeerde auto's
  W.heliSpawns = [];
  W.copSpawns = [];

  var stdCache = {};
  function std(color, rough, metal) {
    var k = color + '_' + (rough || 0.8) + '_' + (metal || 0);
    if (!stdCache[k]) stdCache[k] = new T.MeshStandardMaterial({ color: color, roughness: rough === undefined ? 0.8 : rough, metalness: metal || 0 });
    return stdCache[k];
  }
  W.std = std;

  var glassMat = null;
  function glass() {
    if (!glassMat) glassMat = new T.MeshStandardMaterial({ color: 0x9fc3d6, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.28, depthWrite: false });
    return glassMat;
  }

  function boxMesh(group, w, h, d, x, y, z, mat, collide, shadows) {
    var m = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    if (shadows !== false) { m.castShadow = true; m.receiveShadow = true; }
    group.add(m);
    if (collide) W.addCollider(x - w / 2, y - h / 2, z - d / 2, x + w / 2, y + h / 2, z + d / 2, collide);
    return m;
  }
  W.boxMesh = boxMesh;

  function signTexture(text, bg, fg, w, h) {
    var c = document.createElement('canvas');
    c.width = w || 512; c.height = h || 128;
    var g = c.getContext('2d');
    g.fillStyle = bg;
    g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = fg;
    g.lineWidth = 6;
    g.strokeRect(8, 8, c.width - 16, c.height - 16);
    g.fillStyle = fg;
    g.font = 'bold ' + Math.floor(c.height * 0.5) + 'px "Bebas Neue", Impact, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, c.width / 2, c.height / 2 + 4);
    var t = new T.CanvasTexture(c);
    t.colorSpace = T.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }
  W.signTexture = signTexture;

  function addSign(group, text, bg, fg, x, y, z, w, h, rotY) {
    var tex = signTexture(text, bg, fg);
    var mat = new T.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.15, roughness: 0.5 });
    var m = new T.Mesh(new T.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    m.rotation.y = rotY || 0;
    group.add(m);
    W.signMats.push(mat);
    return m;
  }

  // Gebouw met deur aan de voorkant (+z) en een echt, beloopbaar interieur
  function shell(def) {
    var g = new T.Group();
    var w = def.w, d = def.d, h = def.h, x = def.x, z = def.z;
    var y = PLINTH;
    var wallMat = std(def.wall || '#d8d2c8', 0.85);
    var t = 0.4;
    var dw = def.doorW || 3;
    // vloer
    var floor = new T.Mesh(new T.BoxGeometry(w - 0.2, 0.06, d - 0.2), std(def.floor || '#c9c3b5', 0.6, 0.05));
    floor.position.set(x, y + 0.03, z);
    floor.receiveShadow = true;
    g.add(floor);
    // muren
    boxMesh(g, w, h, t, x, y + h / 2, z - d / 2 + t / 2, wallMat, 'wall');
    boxMesh(g, t, h, d, x - w / 2 + t / 2, y + h / 2, z, wallMat, 'wall');
    boxMesh(g, t, h, d, x + w / 2 - t / 2, y + h / 2, z, wallMat, 'wall');
    var side = (w - dw) / 2;
    var fz = z + d / 2 - t / 2;
    // voorgevel: onderrand + grote etalageruiten + bovenstuk
    var lintel = def.doorH || 3.2;
    [-1, 1].forEach(function (s) {
      var cx = x + s * (dw / 2 + side / 2);
      boxMesh(g, side, 0.8, t, cx, y + 0.4, fz, wallMat, 'wall');
      boxMesh(g, side, lintel - 0.8, 0.12, cx, y + 0.8 + (lintel - 0.8) / 2, fz, glass(), 'wall', false);
      boxMesh(g, 0.3, lintel, t, x + s * (w / 2 - 0.15), y + lintel / 2, fz, wallMat, false);
    });
    boxMesh(g, w, h - lintel, t, x, y + lintel + (h - lintel) / 2, fz, wallMat, 'wall');
    // dak
    boxMesh(g, w + 0.4, 0.4, d + 0.4, x, y + h + 0.2, z, std('#55575a', 0.9), 'roof');
    // luifel
    if (def.accent) {
      var aw = boxMesh(g, dw + 3, 0.15, 1.6, x, y + lintel + 0.35, fz + 0.9, std(def.accent, 0.6), false);
      aw.castShadow = true;
    }
    if (def.sign) addSign(g, def.sign, def.signBg || '#111', def.signFg || '#ffcc33', x, y + lintel + 1.3, fz + t / 2 + 0.03, Math.min(w - 1, 10), 2.2);
    G.scene.add(g);
    var inter = {
      id: def.id, name: def.name, x: x, z: z, w: w, d: d, h: h,
      minX: x - w / 2 + 0.3, maxX: x + w / 2 - 0.3, minZ: z - d / 2 + 0.3, maxZ: z + d / 2 - 0.3, group: g
    };
    W.interiors.push(inter);
    W.specials[def.id] = inter;
    return inter;
  }

  function spot(name, x, z, r, label, extra) {
    var s = { name: name, pos: new T.Vector3(x, PLINTH, z), r: r || 1.6, label: label };
    if (extra) for (var k in extra) s[k] = extra[k];
    W.spots[name] = s;
    return s;
  }

  function poi(id, name, icon, x, z, color) { W.pois.push({ id: id, name: name, icon: icon, x: x, z: z, color: color || '#ffcc33' }); }

  W.interiorAt = function (p) {
    for (var i = 0; i < W.interiors.length; i++) {
      var it = W.interiors[i];
      if (p.x > it.minX && p.x < it.maxX && p.z > it.minZ && p.z < it.maxZ && p.y < PLINTH + it.h) return it;
    }
    return null;
  };

  function blockCenter(bi, bj) { return { x: (bi + 0.5) * P, z: (bj + 0.5) * P }; }
  function frontZ(c, d) { return c.z + INNER - 4 - d / 2; }

  function buildSpecials() {
    var sc = G.scene;
    // Appartement van de speler
    var c = blockCenter(0, 0);
    addBuilding(c.x, c.z + 10, 24, 20, 10, 'woon', { destructible: false, color: '#d9b99b', style: 1, name: 'Appartement' });
    spot('apartment', c.x, c.z + 23, 2.2, 'Appartement: opslaan / slapen');
    poi('apartment', 'Jouw appartement', '⌂', c.x, c.z + 22, '#7CFC9A');
    W.spawnPoint = new T.Vector3(c.x, PLINTH, c.z + 33);
    W.parkedSpawns.push({ x: c.x + 14, z: c.z + 32, h: Math.PI / 2, type: 'sedan', color: '#1e3a5f', owned: true });

    // Kledingwinkel
    c = blockCenter(1, 0);
    var cl = shell({ id: 'kleding', name: 'Stijlzaak', x: c.x, z: frontZ(c, 16), w: 24, d: 16, h: 6, wall: '#f0e6dc', floor: '#e9dfd3', accent: '#c2185b', sign: 'STIJLZAAK', signBg: '#1a1a1a', signFg: '#ff4fa3', doorW: 3.6 });
    clothingInterior(cl);
    poi('kleding', 'Stijlzaak (kleding)', '👕', cl.x, cl.z + 9, '#ff4fa3');

    // Bank
    c = blockCenter(-1, 0);
    var bk = shell({ id: 'bank', name: 'Goudmunt Bank', x: c.x, z: frontZ(c, 22), w: 32, d: 22, h: 9, wall: '#e8e2d4', floor: '#d9d4cb', accent: '#1b5e20', sign: 'GOUDMUNT BANK', signBg: '#0b2a14', signFg: '#ffd54f', doorW: 4, doorH: 4 });
    bankInterior(bk);
    poi('bank', 'Goudmunt Bank', '$', bk.x, bk.z + 12, '#ffd54f');

    // Wapenwinkel
    c = blockCenter(0, -1);
    var gs = shell({ id: 'wapens', name: 'Kaliber Wapenhandel', x: c.x, z: frontZ(c, 12), w: 16, d: 12, h: 5, wall: '#5d5d5d', floor: '#3c3c3c', accent: '#b71c1c', sign: 'KALIBER', signBg: '#111', signFg: '#ff5252' });
    gunInterior(gs);
    poi('wapens', 'Kaliber Wapenhandel', '⌖', gs.x, gs.z + 7, '#ff5252');

    // Ramen-bar en cadeauwinkel
    c = blockCenter(1, -1);
    var rb = shell({ id: 'ramen', name: 'Ramen Neon', x: c.x - 15, z: frontZ(c, 14), w: 16, d: 14, h: 5, wall: '#3b2a3f', floor: '#5a4636', accent: '#ff7043', sign: 'RAMEN NEON', signBg: '#14061c', signFg: '#ff6ec7' });
    ramenInterior(rb);
    poi('ramen', 'Ramen Neon (date-plek)', '🍜', rb.x, rb.z + 8, '#ff6ec7');
    var gf = shell({ id: 'cadeau', name: 'Cadeauhoek', x: c.x + 15, z: frontZ(c, 10), w: 12, d: 10, h: 5, wall: '#fce4ec', floor: '#f3e5f5', accent: '#ab47bc', sign: 'CADEAUHOEK', signBg: '#4a148c', signFg: '#fce4ec' });
    shopShelves(gf, ['#f48fb1', '#ce93d8', '#fff59d', '#80deea']);
    spot('cadeau', gf.x, gf.z - 1, 2.5, 'Cadeaus kopen');
    poi('cadeau', 'Cadeauhoek', '🎁', gf.x, gf.z + 6, '#ce93d8');

    // Spuiterij (wanted-niveau kwijt)
    c = blockCenter(-1, -1);
    var sp = shell({ id: 'spuiterij', name: 'Spuit & Weg', x: c.x, z: frontZ(c, 14), w: 14, d: 14, h: 6, wall: '#90a4ae', floor: '#607d8b', accent: '#0277bd', sign: 'SPUIT & WEG', signBg: '#01579b', signFg: '#ffffff', doorW: 7, doorH: 4.5 });
    spot('spuiterij', sp.x, sp.z, 4, 'Spuit & Weg: overspuiten');
    poi('spuiterij', 'Spuit & Weg (wanted weg)', '🎨', sp.x, sp.z + 8, '#4fc3f7');

    // Ziekenhuis
    c = blockCenter(-2, 0);
    addBuilding(c.x, c.z + 4, 40, 28, 6, 'midden', { destructible: false, color: '#eef1f2', style: 1, name: 'Ziekenhuis' });
    addSign(sc, 'ZIEKENHUIS SINT-LUCAS', '#ffffff', '#c62828', c.x, PLINTH + 5, c.z + 18.1, 14, 2.4);
    spot('ziekenhuis', c.x, c.z + 21, 2.4, 'Ziekenhuis: genezen (€ 150)');
    poi('ziekenhuis', 'Ziekenhuis', '✚', c.x, c.z + 20, '#ff5252');
    W.hospitalPoint = new T.Vector3(c.x, PLINTH, c.z + 24);

    // Politiebureau
    c = blockCenter(2, 0);
    addBuilding(c.x, c.z - 2, 36, 24, 4, 'midden', { destructible: false, color: '#c5cdd6', style: 1, name: 'Politiebureau' });
    addSign(sc, 'POLITIE', '#0d47a1', '#ffffff', c.x, PLINTH + 6, c.z + 10.1, 10, 2.2);
    poi('politie', 'Politiebureau', '★', c.x, c.z + 12, '#64b5f6');
    W.policePoint = new T.Vector3(c.x, PLINTH, c.z + 16);
    W.parkedSpawns.push({ x: c.x - 10, z: c.z + 22, h: Math.PI / 2, type: 'politie' });
    W.parkedSpawns.push({ x: c.x + 10, z: c.z + 22, h: Math.PI / 2, type: 'politie' });
    W.heliSpawns.push({ x: c.x + 26, z: c.z - 26, h: 0, type: 'politieheli' });
    helipad(c.x + 26, c.z - 26);

    // Bouwplaats
    c = blockCenter(0, 1);
    W.plot = { x0: c.x - 20, z0: c.z - 20, size: 40, cell: 2, y0: PLINTH + 0.01 };
    constructionSite(c);
    spot('bouw', c.x, c.z + 24, 3, 'Bouwplaats: bouwmodus (B)');
    poi('bouw', 'Bouwplaats', '⚒', c.x, c.z + 24, '#ffb300');

    // Heliport
    c = blockCenter(3, -1);
    for (var hi = 0; hi < 3; hi++) {
      var hx = c.x - 22 + hi * 22, hz = c.z;
      helipad(hx, hz);
      W.heliSpawns.push({ x: hx, z: hz, h: 0, type: hi === 1 ? 'luxeheli' : 'heli' });
    }
    addBuilding(c.x, c.z - 28, 16, 12, 2, 'midden', { destructible: false, color: '#b0bec5', style: 1, name: 'Heliport' });
    addSign(sc, 'HELIPORT', '#263238', '#80deea', c.x, PLINTH + 5, c.z - 21.9, 8, 1.8);
    poi('heliport', 'Heliport', 'H', c.x, c.z, '#80deea');

    // Arcade
    c = blockCenter(2, -1);
    var ar = shell({ id: 'arcade', name: 'Metro Rush Arcade', x: c.x, z: frontZ(c, 14), w: 18, d: 14, h: 6, wall: '#1a1030', floor: '#2a1a4a', accent: '#00e5ff', sign: 'ARCADE', signBg: '#12002a', signFg: '#00e5ff' });
    arcadeInterior(ar);
    poi('arcade', 'Metro Rush Arcade', '🕹', ar.x, ar.z + 8, '#00e5ff');

    // Buurtsupers (overvalbaar)
    var supers = [[-4, -2], [3, 3], [-5, 4], [4, -5]];
    supers.forEach(function (sb, i) {
      var cc = blockCenter(sb[0], sb[1]);
      var su = shell({ id: 'super' + i, name: 'Buurtsuper 24/7', x: cc.x, z: frontZ(cc, 12), w: 14, d: 12, h: 4.5, wall: '#fafafa', floor: '#e0e0e0', accent: '#2e7d32', sign: 'BUURTSUPER 24/7', signBg: '#1b5e20', signFg: '#ffffff' });
      shopShelves(su, ['#ef5350', '#ffca28', '#66bb6a', '#42a5f5', '#ab47bc']);
      boxMesh(su.group, 4, 1.1, 1, su.x + 3, PLINTH + 0.55, su.z - 2, std('#795548', 0.6), 'wall');
      spot('super' + i, su.x + 3, su.z, 2.2, 'Buurtsuper: snacks (+gezondheid)', { clerk: new T.Vector3(su.x + 3, PLINTH, su.z - 3.2), store: su });
      poi('super' + i, 'Buurtsuper 24/7', '🛒', su.x, su.z + 7, '#81c784');
      // omliggende gewone gebouwen
      addBuilding(cc.x - 22, cc.z - 18, 28, 28, 3 + ri(4), 'midden');
      addBuilding(cc.x + 22, cc.z - 18, 24, 28, 3 + ri(4), 'midden');
    });

    // Vervallen fabriek (sloopmissie)
    c = blockCenter(-1, 1);
    var fb = addBuilding(c.x, c.z, 36, 28, 8, 'haven', { color: '#7a5a48', style: 3, name: 'Vervallen fabriek' });
    W.factory = fb;
    poi('fabriek', 'Vervallen fabriek', '☠', c.x, c.z, '#ff8a65');
    fence(c.x, c.z, 44, 40);

    // Bendeterrein
    c = blockCenter(5, 3);
    W.gangYard = new T.Vector3(c.x, PLINTH, c.z);
    addBuilding(c.x - 18, c.z - 16, 28, 24, 2, 'haven', { color: '#6d4c41', style: 3 });
    containerYard(c.x + 8, c.z + 10, 9);
    poi('bende', 'Bendeterrein "De Kraaien"', '☣', c.x, c.z, '#e53935');

    // Havengarage (aflevering)
    c = blockCenter(4, 2);
    var hg = shell({ id: 'havengarage', name: 'Havengarage', x: c.x, z: frontZ(c, 14), w: 16, d: 14, h: 6, wall: '#78909c', floor: '#546e7a', accent: '#ff6f00', sign: 'HAVENGARAGE', signBg: '#263238', signFg: '#ffab40', doorW: 8, doorH: 4.5 });
    spot('havengarage', hg.x, hg.z, 5, 'Havengarage');
    poi('havengarage', 'Havengarage', '🔧', hg.x, hg.z + 8, '#ffab40');
    addBuilding(c.x - 20, c.z - 22, 28, 20, 3, 'haven');
    containerYard(c.x + 20, c.z - 18, 6);

    // Park
    parkArea();
  }

  function helipad(x, z) {
    var m = new T.Mesh(new T.CylinderGeometry(9, 9, 0.08, 32), std('#3a3d40', 0.7));
    m.position.set(x, PLINTH + 0.04, z);
    m.receiveShadow = true;
    G.scene.add(m);
    var c = document.createElement('canvas');
    c.width = c.height = 256;
    var g = c.getContext('2d');
    g.strokeStyle = '#ffd54f';
    g.lineWidth = 10;
    g.beginPath(); g.arc(128, 128, 110, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#ffffff';
    g.font = 'bold 150px Impact, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('H', 128, 136);
    var tex = new T.CanvasTexture(c);
    tex.colorSpace = T.SRGBColorSpace;
    var p = new T.Mesh(new T.PlaneGeometry(16, 16), new T.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.8 }));
    p.rotation.x = -Math.PI / 2;
    p.position.set(x, PLINTH + 0.09, z);
    G.scene.add(p);
  }

  function fence(x, z, w, d) {
    var mat = std('#8d8d8d', 0.5, 0.6);
    var g = new T.Group();
    [[0, -d / 2, w, 0.1], [0, d / 2, w, 0.1], [-w / 2, 0, 0.1, d], [w / 2, 0, 0.1, d]].forEach(function (s, i) {
      var len = s[2] > 1 ? s[2] : s[3];
      if (i === 1) {
        // opening voor de ingang
        boxMesh(g, len / 2 - 4, 2.4, 0.1, x - len / 4 - 2, PLINTH + 1.2, z + s[1], mat, 'wall', false);
        boxMesh(g, len / 2 - 4, 2.4, 0.1, x + len / 4 + 2, PLINTH + 1.2, z + s[1], mat, 'wall', false);
      } else {
        boxMesh(g, s[2] > 1 ? s[2] : 0.1, 2.4, s[3] > 1 ? s[3] : 0.1, x + s[0], PLINTH + 1.2, z + s[1], mat, 'wall', false);
      }
    });
    G.scene.add(g);
  }

  var containerList = [];
  function containerYard(x, z, n) {
    var cols = ['#c62828', '#1565c0', '#2e7d32', '#ef6c00', '#6a1b9a', '#00838f', '#9e9d24'];
    for (var i = 0; i < n; i++) {
      var cx = x + (i % 3) * 3.2 - 3.2, cz = z + Math.floor(i / 3) * 13 - 14;
      var stack = 1 + ri(2);
      for (var s = 0; s < stack; s++) {
        containerList.push({ x: cx, y: PLINTH + s * 2.6, z: cz, color: rp(cols) });
      }
      W.addCollider(cx - 1.2, 0, cz - 6, cx + 1.2, PLINTH + stack * 2.6, cz + 6, 'container');
    }
  }

  function shopShelves(inter, colors) {
    var g = inter.group;
    for (var i = 0; i < 3; i++) {
      var sx = inter.x - inter.w / 2 + 2.5 + i * 3.2;
      boxMesh(g, 0.8, 1.8, inter.d * 0.5, sx, PLINTH + 0.9, inter.z - 1, std('#d7ccc8', 0.7), 'wall');
      for (var k = 0; k < 8; k++) {
        boxMesh(g, 0.6, 0.3, 0.5, sx + (k % 2 ? 0.1 : -0.1), PLINTH + 0.5 + (k % 4) * 0.4, inter.z - inter.d * 0.2 + Math.floor(k / 4) * 1.6, std(rp(colors), 0.6), false, false);
      }
    }
  }

  function clothingInterior(it) {
    var g = it.group;
    var cols = ['#e53935', '#1e88e5', '#43a047', '#fdd835', '#8e24aa', '#212121', '#f5f5f5', '#ff7043', '#00897b'];
    for (var r2 = 0; r2 < 3; r2++) {
      var rz = it.z - 3 + r2 * 3;
      boxMesh(g, 6, 0.06, 0.06, it.x - 4, PLINTH + 1.6, rz, std('#b0b0b0', 0.3, 0.8), false, false);
      boxMesh(g, 0.08, 1.6, 0.08, it.x - 7, PLINTH + 0.8, rz, std('#b0b0b0', 0.3, 0.8), 'wall', false);
      boxMesh(g, 0.08, 1.6, 0.08, it.x - 1, PLINTH + 0.8, rz, std('#b0b0b0', 0.3, 0.8), false, false);
      for (var k = 0; k < 10; k++) {
        var clothes = new T.Mesh(new T.BoxGeometry(0.5, 0.75, 0.08), std(rp(cols), 0.9));
        clothes.position.set(it.x - 6.6 + k * 0.6, PLINTH + 1.15, rz);
        clothes.rotation.y = Math.PI / 2;
        clothes.castShadow = true;
        g.add(clothes);
      }
    }
    // Paspoppen
    for (var m = 0; m < 2; m++) {
      boxMesh(g, 0.5, 1.2, 0.3, it.x + 6 + m * 2, PLINTH + 1.0, it.z + 5.5, std(rp(cols), 0.9), false);
      var head = new T.Mesh(new T.SphereGeometry(0.16, 12, 8), std('#eeeeee', 0.4));
      head.position.set(it.x + 6 + m * 2, PLINTH + 1.85, it.z + 5.5);
      g.add(head);
    }
    // Pashokje met spiegel
    var bx = it.x + it.w / 2 - 3, bz = it.z - it.d / 2 + 2.2;
    boxMesh(g, 0.1, 2.6, 3.4, bx - 2, PLINTH + 1.3, bz + 0.6, std('#880e4f', 0.8), 'wall');
    boxMesh(g, 4, 0.1, 3.4, bx, PLINTH + 2.6, bz + 0.6, std('#880e4f', 0.8), false);
    if (G.A.Reflector) {
      var mirror = new G.A.Reflector(new T.PlaneGeometry(3.2, 2.4), {
        clipBias: 0.003, textureWidth: 512, textureHeight: 512, color: 0x9a9a9a
      });
      mirror.position.set(bx, PLINTH + 1.35, it.z - it.d / 2 + 0.45);
      g.add(mirror);
      it.mirror = mirror;
      mirror.visible = false;
    } else {
      boxMesh(g, 3.2, 2.4, 0.05, bx, PLINTH + 1.35, it.z - it.d / 2 + 0.45, std('#cfd8dc', 0.02, 1), false);
    }
    boxMesh(g, 3.4, 0.1, 0.12, bx, PLINTH + 2.6, it.z - it.d / 2 + 0.5, std('#b0b0b0', 0.3, 0.9), false);
    spot('kleding', bx, bz + 1.4, 1.8, 'Pashokje: kleding aanpassen');
    boxMesh(g, 3, 1.1, 1, it.x + 3, PLINTH + 0.55, it.z + 1, std('#4e342e', 0.5), 'wall');
  }

  function bankInterior(it) {
    var g = it.group;
    var marble = std('#f2efe9', 0.25, 0.05);
    // zuilen
    for (var i = -1; i <= 1; i += 2) {
      for (var k = 0; k < 2; k++) {
        var col = new T.Mesh(new T.CylinderGeometry(0.45, 0.5, 9, 16), marble);
        col.position.set(it.x + i * 7, PLINTH + 4.5, it.z + 4 - k * 8);
        col.castShadow = true;
        g.add(col);
        W.addCollider(col.position.x - 0.5, 0, col.position.z - 0.5, col.position.x + 0.5, 10, col.position.z + 0.5, 'wall');
      }
    }
    // balie
    boxMesh(g, 20, 1.2, 1.2, it.x - 2, PLINTH + 0.6, it.z - 1, std('#5d4037', 0.4), 'wall');
    boxMesh(g, 20, 1.2, 0.05, it.x - 2, PLINTH + 1.8, it.z - 1, glass(), false, false);
    // kluiswand met deur
    var vz = it.z - it.d / 2 + 6;
    boxMesh(g, it.w - 1, it.h, 0.6, it.x - 4, PLINTH + it.h / 2, vz, std('#9e9e9e', 0.5, 0.6), 'wall');
    var door = new T.Mesh(new T.CylinderGeometry(1.6, 1.6, 0.5, 32), std('#bdbdbd', 0.25, 0.9));
    door.rotation.x = Math.PI / 2;
    door.position.set(it.x + 11, PLINTH + 1.8, vz + 0.4);
    door.castShadow = true;
    g.add(door);
    it.vaultDoor = door;
    W.vaultCollider = W.addCollider(it.x + 9.4, 0, vz - 0.3, it.x + 12.6, 4, vz + 0.7, 'wall');
    // goud en geld in de kluis
    for (var b = 0; b < 12; b++) {
      boxMesh(g, 0.5, 0.2, 0.25, it.x + 8 + (b % 4) * 0.6, PLINTH + 1 + Math.floor(b / 4) * 0.22, vz - 4, std('#ffc107', 0.25, 1), false, false);
    }
    boxMesh(g, 3, 0.9, 1, it.x + 8.9, PLINTH + 0.45, vz - 4, std('#424242', 0.5), 'wall');
    for (var m = 0; m < 6; m++) {
      boxMesh(g, 0.4, 0.15, 0.2, it.x + 13, PLINTH + 0.3 + m * 0.16, vz - 3 + (m % 2) * 0.3, std('#2e7d32', 0.8), false, false);
    }
    spot('bank.vault', it.x + 11, vz + 1.6, 2, 'Kluis kraken (overval!)');
    spot('bank.loot', it.x + 11, vz - 3, 2.2, 'Buit pakken');
    spot('bank.teller', it.x - 2, it.z + 1, 2, 'Bank: info');
    it.vaultZ = vz;
  }

  function gunInterior(it) {
    var g = it.group;
    boxMesh(g, 10, 1.1, 1, it.x, PLINTH + 0.55, it.z - 1, std('#263238', 0.4), 'wall');
    for (var i = 0; i < 8; i++) {
      boxMesh(g, 1.1, 0.25, 0.08, it.x - 4.5 + i * 1.3, PLINTH + 2.5 + (i % 2) * 0.5, it.z - it.d / 2 + 0.5, std('#212121', 0.4, 0.6), false, false);
    }
    spot('wapens', it.x, it.z + 0.6, 2.2, 'Wapens en munitie kopen');
  }

  function ramenInterior(it) {
    var g = it.group;
    boxMesh(g, 8, 1.1, 1, it.x, PLINTH + 0.55, it.z - 4, std('#3e2723', 0.4), 'wall');
    for (var i = 0; i < 3; i++) {
      var tx = it.x - 4 + i * 4, tz = it.z + 2;
      var top = new T.Mesh(new T.CylinderGeometry(0.8, 0.8, 0.08, 20), std('#8d6e63', 0.5));
      top.position.set(tx, PLINTH + 0.8, tz);
      top.castShadow = true;
      g.add(top);
      boxMesh(g, 0.12, 0.8, 0.12, tx, PLINTH + 0.4, tz, std('#3e2723', 0.5), false);
    }
    // neon-lampjes
    for (var l = 0; l < 6; l++) {
      var lamp = new T.Mesh(new T.SphereGeometry(0.25, 12, 8), new T.MeshBasicMaterial({ color: new T.Color(3, 0.8, 2) }));
      lamp.position.set(it.x - 6 + l * 2.4, PLINTH + 4.2, it.z);
      g.add(lamp);
    }
    spot('ramen', it.x, it.z - 2.8, 2.2, 'Ramen eten (€ 25, +gezondheid)');
    spot('ramen.table', it.x, it.z + 2, 2.4, 'Date-tafel');
  }

  function arcadeInterior(it) {
    var g = it.group;
    for (var i = 0; i < 5; i++) {
      var ax = it.x - 6 + i * 3;
      boxMesh(g, 1.2, 2, 0.9, ax, PLINTH + 1, it.z - it.d / 2 + 1.2, std('#1a237e', 0.5), 'wall');
      var scr = new T.Mesh(new T.PlaneGeometry(0.9, 0.7), new T.MeshBasicMaterial({ color: new T.Color(0.3 + i * 0.2, 1.2, 2.2 - i * 0.3) }));
      scr.position.set(ax, PLINTH + 1.5, it.z - it.d / 2 + 1.66);
      g.add(scr);
    }
    spot('arcade', it.x, it.z - it.d / 2 + 2.6, 2.4, 'Speel Metro Rush');
  }

  function constructionSite(c) {
    var g = new T.Group();
    // hekwerk rond de bouwplaats
    fence(c.x, c.z, 70, 70);
    // bouwkeet
    boxMesh(g, 8, 2.8, 3, c.x - 28, PLINTH + 1.4, c.z + 28, std('#f9a825', 0.6), 'wall');
    // torenkraan (draait langzaam)
    var yellow = std('#fbc02d', 0.5, 0.3);
    var cx = c.x + 26, cz = c.z - 26;
    for (var s = 0; s < 14; s++) {
      boxMesh(g, 2, 3, 2, cx, PLINTH + 1.5 + s * 3, cz, yellow, false);
      boxMesh(g, 2.05, 0.15, 2.05, cx, PLINTH + s * 3, cz, std('#5d4037', 0.6), false, false);
    }
    W.addCollider(cx - 1, 0, cz - 1, cx + 1, 44, cz + 1, 'wall');
    var jib = new T.Group();
    jib.position.set(cx, PLINTH + 43, cz);
    boxMesh(jib, 44, 1.2, 1.2, -12, 0, 0, yellow, false);
    boxMesh(jib, 4, 2.4, 2.4, 10, -0.6, 0, std('#616161', 0.7), false);
    boxMesh(jib, 2.2, 2, 2.2, 0, -1.6, 0, std('#eceff1', 0.4), false);
    var cable = new T.Mesh(new T.BoxGeometry(0.05, 20, 0.05), std('#212121', 0.5));
    cable.position.set(-24, -10, 0);
    jib.add(cable);
    var hook = boxMesh(jib, 1.5, 1.5, 1.5, -24, -20, 0, std('#e64a19', 0.5), false);
    hook.castShadow = true;
    g.add(jib);
    W.craneJib = jib;
    // bouwmaterialen
    for (var p = 0; p < 6; p++) boxMesh(g, 2.4, 0.6, 1.2, c.x - 28 + p * 2.6, PLINTH + 0.3, c.z - 30, std('#8d6e63', 0.8), 'wall');
    // grond van de bouwkavel
    var dirt = new T.Mesh(new T.BoxGeometry(40, 0.02, 40), std('#8a7356', 0.98));
    dirt.position.set(c.x, PLINTH + 0.005, c.z);
    dirt.receiveShadow = true;
    g.add(dirt);
    var grid = new T.GridHelper(40, 20, 0xffffff, 0xffffff);
    grid.material.transparent = true;
    grid.material.opacity = 0.12;
    grid.position.set(c.x, PLINTH + 0.02, c.z);
    g.add(grid);
    G.scene.add(g);
  }

  function parkArea() {
    // vijver in het midden van het park
    var pond = new T.Mesh(new T.CylinderGeometry(22, 22, 0.1, 40), new T.MeshStandardMaterial({ color: 0x2b6f8a, roughness: 0.05, metalness: 0.2 }));
    pond.position.set(-200, PLINTH + 0.03, 200);
    pond.receiveShadow = true;
    // vijver ligt op de kruising, dus verschuif naar binnen het park-blok
    pond.position.set(-150, PLINTH + 0.03, 150);
    G.scene.add(pond);
    W.parkBench = new T.Vector3(-150, PLINTH, 182);
    // bankjes
    for (var i = 0; i < 6; i++) {
      var a = i / 6 * Math.PI * 2;
      var bx = -150 + Math.cos(a) * 27, bz = 150 + Math.sin(a) * 27;
      var bench = new T.Group();
      boxMesh(bench, 1.8, 0.08, 0.5, 0, 0.45, 0, std('#6d4c41', 0.7), false);
      boxMesh(bench, 1.8, 0.5, 0.06, 0, 0.75, -0.22, std('#6d4c41', 0.7), false);
      boxMesh(bench, 0.06, 0.45, 0.4, -0.8, 0.22, 0, std('#37474f', 0.4, 0.6), false);
      boxMesh(bench, 0.06, 0.45, 0.4, 0.8, 0.22, 0, std('#37474f', 0.4, 0.6), false);
      bench.position.set(bx, PLINTH, bz);
      bench.rotation.y = -a - Math.PI / 2;
      G.scene.add(bench);
    }
    spot('park.bench', -150, 177, 3, 'Parkbankje');
    poi('park', 'Stadspark', '🌳', -150, 150, '#81c784');
  }

  // ---- Bomen, lantaarns, props -------------------------------------------------------
  var trees = [], palms = [], lamps = [];

  function placeTrees() {
    W.blocks.forEach(function (bl) {
      if (bl.district === 'park') {
        for (var i = 0; i < 40; i++) {
          var x = bl.cx + r(-34, 34), z = bl.cz + r(-34, 34);
          if (U.dist2(x, z, -150, 150) < 26) continue;
          trees.push({ x: x, z: z, s: r(0.8, 1.5) });
        }
      } else if (bl.district === 'woon') {
        for (var k = 0; k < 10; k++) trees.push({ x: bl.cx + r(-34, 34), z: bl.cz + (rng() < 0.5 ? -1 : 1) * r(34, 36.5), s: r(0.6, 1.1) });
      } else if (bl.district === 'midden' || bl.district === 'centrum') {
        // straatbomen langs de stoep
        for (var s = -1; s <= 1; s += 2) {
          trees.push({ x: bl.cx + s * 20, z: bl.cz + 40, s: r(0.6, 0.85) });
          trees.push({ x: bl.cx + s * 20, z: bl.cz - 40, s: r(0.6, 0.85) });
        }
      }
    });
    // bos op de heuvels
    for (var f = 0; f < 900; f++) {
      var fx = r(-1150, 1150), fz = r(-1150, 640);
      if (Math.abs(fx) < 860 && fz > -860) continue;
      var h = terrain(fx, fz);
      if (h < 1) continue;
      trees.push({ x: fx, z: fz, s: r(1.0, 2.2), y: h });
    }
    // palmen op de boulevard en het strand
    for (var p = -800; p <= 800; p += 22) {
      palms.push({ x: p + r(-3, 3), z: 624 + r(-4, 4), s: r(0.9, 1.2) });
      if (rng() < 0.5) palms.push({ x: p + r(-8, 8), z: r(650, 680), s: r(0.8, 1.2), y: terrain(p, 665) });
    }
  }

  function instTrees() {
    var trunkGeo = new T.CylinderGeometry(0.16, 0.26, 3.2, 6);
    trunkGeo.translate(0, 1.6, 0);
    var crownGeo = new T.IcosahedronGeometry(2.3, 1);
    crownGeo.translate(0, 4.6, 0);
    var trunk = new T.InstancedMesh(trunkGeo, std('#5d4037', 0.9), trees.length);
    var crown = new T.InstancedMesh(crownGeo, new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, flatShading: true }), trees.length);
    var m = new T.Matrix4(), q = new T.Quaternion(), s = new T.Vector3(), p = new T.Vector3(), col = new T.Color();
    var greens = ['#4e8a35', '#5b9a3c', '#3f7a30', '#6aa84f', '#7c9a3a', '#2f6b3a'];
    trees.forEach(function (t, i) {
      var y = t.y !== undefined ? t.y : W.ground(t.x, t.z);
      q.setFromAxisAngle(new T.Vector3(0, 1, 0), rng() * 6.28);
      p.set(t.x, y, t.z);
      s.set(t.s, t.s * r(0.9, 1.2), t.s);
      m.compose(p, q, s);
      trunk.setMatrixAt(i, m);
      crown.setMatrixAt(i, m);
      col.set(rp(greens));
      crown.setColorAt(i, col);
      if (t.y === undefined) W.addCollider(t.x - 0.3 * t.s, 0, t.z - 0.3 * t.s, t.x + 0.3 * t.s, 3 * t.s, t.z + 0.3 * t.s, 'tree');
    });
    [trunk, crown].forEach(function (im) { im.castShadow = true; im.receiveShadow = true; G.scene.add(im); });

    // palmen
    var ptGeo = new T.CylinderGeometry(0.14, 0.24, 7, 6);
    ptGeo.translate(0, 3.5, 0);
    var leafGeos = [];
    for (var l = 0; l < 7; l++) {
      var lg = new T.BoxGeometry(0.6, 0.06, 3.4);
      lg.translate(0, 0, 1.7);
      lg.rotateX(0.35);
      lg.rotateY(l / 7 * Math.PI * 2);
      lg.translate(0, 7, 0);
      leafGeos.push(lg);
    }
    var leafGeo = G.A.BufferGeometryUtils ? G.A.BufferGeometryUtils.mergeGeometries(leafGeos) : leafGeos[0];
    var pt = new T.InstancedMesh(ptGeo, std('#8d6e4a', 0.9), palms.length);
    var pl = new T.InstancedMesh(leafGeo, std('#3f8f3a', 0.8), palms.length);
    palms.forEach(function (t, i) {
      var y = t.y !== undefined ? t.y : W.ground(t.x, t.z);
      q.setFromAxisAngle(new T.Vector3(0, 1, 0), rng() * 6.28);
      p.set(t.x, y, t.z);
      s.set(t.s, t.s, t.s);
      m.compose(p, q, s);
      pt.setMatrixAt(i, m);
      pl.setMatrixAt(i, m);
    });
    [pt, pl].forEach(function (im) { im.castShadow = true; G.scene.add(im); });
  }

  function instLamps() {
    for (var i = IMIN; i <= IMAX; i++) {
      for (var j = JMIN; j <= JMAX; j++) {
        [[1, 1], [-1, -1], [1, -1], [-1, 1]].forEach(function (c, k) {
          if ((i + j + k) % 2) return;
          var x = i * P + c[0] * (RW / 2 + 1.0), z = j * P + c[1] * (RW / 2 + 1.0);
          if (!inLots(x, z)) return;
          lamps.push({ x: x, z: z, dir: k < 2 ? 0 : 1, sx: c[0], sz: c[1] });
        });
      }
    }
    var poleGeo = new T.CylinderGeometry(0.08, 0.13, 7.5, 6);
    poleGeo.translate(0, 3.75, 0);
    var headGeo = new T.BoxGeometry(0.5, 0.18, 1.2);
    headGeo.translate(0, 7.4, -0.9);
    var pole = new T.InstancedMesh(poleGeo, std('#37474f', 0.5, 0.6), lamps.length);
    var lampMat = new T.MeshStandardMaterial({ color: 0x333333, emissive: 0xffd9a0, emissiveIntensity: 0 });
    var head = new T.InstancedMesh(headGeo, lampMat, lamps.length);
    W.lampMat = lampMat;
    var m = new T.Matrix4(), q = new T.Quaternion(), s = new T.Vector3(1, 1, 1), p = new T.Vector3();
    lamps.forEach(function (l, i) {
      // armatuur wijst naar de straat
      var ang = Math.atan2(-l.sx, -l.sz);
      q.setFromAxisAngle(new T.Vector3(0, 1, 0), ang + Math.PI);
      p.set(l.x, PLINTH, l.z);
      m.compose(p, q, s);
      pole.setMatrixAt(i, m);
      head.setMatrixAt(i, m);
      var off = new T.Vector3(0, 0, -0.9).applyQuaternion(q);
      l.lx = l.x + off.x;
      l.lz = l.z + off.z;
    });
    pole.castShadow = true;
    G.scene.add(pole);
    G.scene.add(head);
    W.lamps = lamps;
  }

  function instContainers() {
    if (!containerList.length) return;
    var geo = new T.BoxGeometry(2.4, 2.6, 12);
    geo.translate(0, 1.3, 0);
    var mat = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.4 });
    G.patchWorld(mat, { key: 'container', color: 'diffuseColor.rgb *= 0.8 + 0.2 * step(0.5, fract(dot(vWP.xz, vec2(1.0, 1.0)) * 2.5));' });
    var im = new T.InstancedMesh(geo, mat, containerList.length);
    var m = new T.Matrix4(), c = new T.Color();
    containerList.forEach(function (k, i) {
      m.makeTranslation(k.x, k.y, k.z);
      im.setMatrixAt(i, m);
      c.set(k.color);
      im.setColorAt(i, c);
    });
    im.castShadow = true;
    im.receiveShadow = true;
    G.scene.add(im);
  }

  // ---- Meshes van de stad opbouwen ---------------------------------------------------
  var bldMesh, bldGeo, facadeMat, propMesh;
  var hideM = new T.Matrix4().makeScale(0, 0, 0);

  function buildMeshes() {
    var sc = G.scene;
    // terrein met wegen
    var tg = new T.PlaneGeometry(2600, 2800, 200, 220);
    tg.rotateX(-Math.PI / 2);
    tg.translate(0, 0, 100);
    var pos = tg.attributes.position;
    var cols = new Float32Array(pos.count * 3);
    var cc = new T.Color();
    for (var i = 0; i < pos.count; i++) {
      var x = pos.getX(i), z = pos.getZ(i);
      var h = terrain(x, z);
      pos.setY(i, h);
      if (z > 628 && h < 2) cc.set('#d9c48f');
      else if (h > 40) cc.set('#7d7466');
      else cc.set('#5f8f3f').lerp(new T.Color('#7a8a45'), U.clamp(h / 40, 0, 1));
      if (Math.abs(x) <= 808 && z >= -808 && z <= 608) cc.set('#6a7062');
      cols[i * 3] = cc.r; cols[i * 3 + 1] = cc.g; cols[i * 3 + 2] = cc.b;
    }
    tg.setAttribute('color', new T.BufferAttribute(cols, 3));
    tg.computeVertexNormals();
    var terrainMesh = new T.Mesh(tg, terrainMaterial());
    terrainMesh.receiveShadow = true;
    sc.add(terrainMesh);

    // stoepen en kavels
    var nBlocks = W.blocks.length;
    var unit = new T.BoxGeometry(1, 1, 1);
    unit.translate(0, 0.5, 0);
    var walk = new T.InstancedMesh(unit, pavingMaterial(0x9d9a94, 'walk', false), nBlocks + 1);
    var paved = [], grass = [];
    W.blocks.forEach(function (bl) {
      var g = bl.district === 'park' || bl.district === 'woon';
      (g ? grass : paved).push(bl);
    });
    var pavedM = new T.InstancedMesh(unit, pavingMaterial(0xb3ada3, 'paved', false), paved.length);
    var grassM = new T.InstancedMesh(unit, pavingMaterial(0x5e9440, 'grass', true), grass.length);
    var m = new T.Matrix4(), c = new T.Color();
    W.blocks.forEach(function (bl, i) {
      m.compose(new T.Vector3(bl.cx, 0, bl.cz), new T.Quaternion(), new T.Vector3(LOT * 2, PLINTH, LOT * 2));
      walk.setMatrixAt(i, m);
    });
    m.compose(new T.Vector3(0, 0, 624), new T.Quaternion(), new T.Vector3(1680, PLINTH, 32));
    walk.setMatrixAt(nBlocks, m);
    paved.forEach(function (bl, i) {
      m.compose(new T.Vector3(bl.cx, 0, bl.cz), new T.Quaternion(), new T.Vector3(INNER * 2, PLINTH + 0.01, INNER * 2));
      pavedM.setMatrixAt(i, m);
      c.set(bl.district === 'haven' ? '#8f8b84' : (bl.district === 'centrum' ? '#bdb7ad' : '#aaa59c'));
      pavedM.setColorAt(i, c);
    });
    grass.forEach(function (bl, i) {
      m.compose(new T.Vector3(bl.cx, 0, bl.cz), new T.Quaternion(), new T.Vector3(INNER * 2, PLINTH + 0.01, INNER * 2));
      grassM.setMatrixAt(i, m);
    });
    [walk, pavedM, grassM].forEach(function (im) { im.receiveShadow = true; sc.add(im); });

    // gebouwen (een enkele instanced mesh)
    var n = W.buildings.length;
    bldGeo = new T.BoxGeometry(1, 1, 1);
    bldGeo.translate(0, 0.5, 0);
    var bAttr = new Float32Array(n * 2);
    facadeMat = facadeMaterial();
    bldMesh = new T.InstancedMesh(bldGeo, facadeMat, n);
    W.buildings.forEach(function (b, i) {
      m.compose(new T.Vector3(b.x, b.y0, b.z), new T.Quaternion(), new T.Vector3(b.w, b.h, b.d));
      bldMesh.setMatrixAt(i, m);
      c.set(b.color);
      bldMesh.setColorAt(i, c);
      bAttr[i * 2] = b.style;
      bAttr[i * 2 + 1] = b.seed;
    });
    bldGeo.setAttribute('aBld', new T.InstancedBufferAttribute(bAttr, 2));
    bldMesh.castShadow = true;
    bldMesh.receiveShadow = true;
    bldMesh.frustumCulled = false;
    sc.add(bldMesh);

    // dakdetails (airco, watertanks, liftopbouw)
    var props = [];
    W.buildings.forEach(function (b) {
      if (b.floors < 3) return;
      var k = 1 + ri(3);
      for (var j = 0; j < k; j++) {
        var pw = r(2, Math.min(8, b.w * 0.4)), pd = r(2, Math.min(8, b.d * 0.4)), ph = r(1, 3.5);
        b.props.push(props.length);
        props.push({ x: b.x + r(-b.w / 2 + pw, b.w / 2 - pw) * 0.8, z: b.z + r(-b.d / 2 + pd, b.d / 2 - pd) * 0.8, y: b.y0 + b.h, w: pw, h: ph, d: pd });
      }
    });
    propMesh = new T.InstancedMesh(unit, std('#8a8d90', 0.7, 0.2), Math.max(1, props.length));
    props.forEach(function (p, i) {
      m.compose(new T.Vector3(p.x, p.y, p.z), new T.Quaternion(), new T.Vector3(p.w, p.h, p.d));
      propMesh.setMatrixAt(i, m);
    });
    propMesh.castShadow = true;
    sc.add(propMesh);
  }

  // ---- Sloop: gebouwen breken in cellen ------------------------------------------------
  function toChunks(b) {
    var nx = Math.round(b.w / CS), nz = Math.round(b.d / CS), ny = Math.max(1, Math.round(b.h / FH));
    var count = nx * ny * nz;
    var ch = {
      nx: nx, ny: ny, nz: nz, x0: b.x - b.w / 2, z0: b.z - b.d / 2, y0: b.y0,
      cells: new Uint8Array(count), alive: count, total: count, mesh: null
    };
    ch.cells.fill(1);
    var geo = bldGeo.clone();
    var attr = new Float32Array(count * 2);
    for (var i = 0; i < count; i++) { attr[i * 2] = b.style; attr[i * 2 + 1] = b.seed; }
    geo.setAttribute('aBld', new T.InstancedBufferAttribute(attr, 2));
    var mesh = new T.InstancedMesh(geo, facadeMat, count);
    var m = new T.Matrix4(), col = new T.Color(b.color);
    var sc = new T.Vector3(CS, FH, CS), q = new T.Quaternion(), p = new T.Vector3();
    for (var iy = 0; iy < ny; iy++) {
      for (var iz = 0; iz < nz; iz++) {
        for (var ix = 0; ix < nx; ix++) {
          var idx = cellIndex(ch, ix, iy, iz);
          p.set(ch.x0 + (ix + 0.5) * CS, ch.y0 + iy * FH, ch.z0 + (iz + 0.5) * CS);
          m.compose(p, q, sc);
          mesh.setMatrixAt(idx, m);
          mesh.setColorAt(idx, col);
        }
      }
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    G.scene.add(mesh);
    ch.mesh = mesh;
    b.chunks = ch;
    bldMesh.setMatrixAt(b.id, hideM);
    bldMesh.instanceMatrix.needsUpdate = true;
    b.props.forEach(function (pi) { propMesh.setMatrixAt(pi, hideM); });
    propMesh.instanceMatrix.needsUpdate = true;
  }

  function removeCell(b, idx) {
    var ch = b.chunks;
    if (!ch.cells[idx]) return false;
    ch.cells[idx] = 0;
    ch.alive--;
    ch.mesh.setMatrixAt(idx, hideM);
    return true;
  }

  function cellCenter(ch, idx, out) {
    var ix = idx % ch.nx, rest = (idx - ix) / ch.nx, iz = rest % ch.nz, iy = (rest - iz) / ch.nz;
    return out.set(ch.x0 + (ix + 0.5) * CS, ch.y0 + (iy + 0.5) * FH, ch.z0 + (iz + 0.5) * CS);
  }

  var qb2 = [];
  // Explosie: verwijdert cellen in de straal, laat losse delen instorten. Geeft aantal verwoeste cellen.
  W.damageBuildings = function (center, radius) {
    var list = W.query(center.x - radius - 2, center.z - radius - 2, center.x + radius + 2, center.z + radius + 2, qb2).slice();
    var total = 0;
    var cp = new T.Vector3();
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      var b = c.b;
      if (!b || !b.destructible || b.collapsed) continue;
      var dx = Math.max(c.minX - center.x, 0, center.x - c.maxX);
      var dy = Math.max(c.minY - center.y, 0, center.y - c.maxY);
      var dz = Math.max(c.minZ - center.z, 0, center.z - c.maxZ);
      if (dx * dx + dy * dy + dz * dz > radius * radius) continue;
      if (!b.chunks) toChunks(b);
      var ch = b.chunks;
      var removed = [];
      for (var idx = 0; idx < ch.cells.length; idx++) {
        if (!ch.cells[idx]) continue;
        cellCenter(ch, idx, cp);
        var d = cp.distanceTo(center);
        if (d < radius * (0.55 + rng() * 0.5)) {
          removeCell(b, idx);
          removed.push(cp.clone());
        }
      }
      removed.forEach(function (p) {
        if (G.fx) G.fx.debrisBurst(p, b.color, center, 2);
      });
      total += removed.length;
      if (removed.length) {
        if (G.fx) G.fx.dust(center, radius);
        collapseCheck(b, center);
        ch.mesh.instanceMatrix.needsUpdate = true;
      }
    }
    return total;
  };

  // Draagconstructie: een cel is gedragen als er een pad naar de grond is waarbij hooguit
  // MAX_SPAN cellen horizontaal overhangen (verticaal dragen kost niets). Wat niet gedragen
  // wordt, valt naar beneden - zo stort alles boven een weggeblazen stuk echt in.
  var MAX_SPAN = 1;
  function collapseCheck(b, center) {
    var ch = b.chunks;
    var nx = ch.nx, ny = ch.ny, nz = ch.nz;
    var n = ch.cells.length;
    var foot = nx * nz;
    var groundAlive = 0;
    for (var g0 = 0; g0 < foot; g0++) if (ch.cells[g0]) groundAlive++;
    var falling = [];
    var cp = new T.Vector3();
    var need = Math.min(0.8, 0.45 + b.floors * 0.012);
    if (groundAlive < foot * need) {
      // de begane grond is grotendeels weg: het hele gebouw gaat neer
      for (var a = 0; a < n; a++) if (ch.cells[a]) falling.push(a);
      b.collapsed = true;
    } else {
      var dist = new Uint8Array(n);
      dist.fill(255);
      var q0 = [], q1 = [];
      for (var s = 0; s < foot; s++) if (ch.cells[s]) { dist[s] = 0; q0.push(s); }
      var layer = 0;
      while ((q0.length || q1.length) && layer <= MAX_SPAN) {
        while (q0.length) {
          var idx = q0.pop();
          var d = dist[idx];
          if (d !== layer) continue;
          var ix = idx % nx, rest = (idx - ix) / nx, iz = rest % nz, iy = (rest - iz) / nz;
          // omhoog: kosteloos (kolom draagt)
          if (iy < ny - 1) { var up = idx + nx * nz; if (ch.cells[up] && dist[up] > d) { dist[up] = d; q0.push(up); } }
          var side = [];
          if (ix > 0) side.push(idx - 1);
          if (ix < nx - 1) side.push(idx + 1);
          if (iz > 0) side.push(idx - nx);
          if (iz < nz - 1) side.push(idx + nx);
          if (iy > 0) side.push(idx - nx * nz);
          for (var k = 0; k < side.length; k++) {
            var nb = side[k];
            if (ch.cells[nb] && dist[nb] > d + 1) { dist[nb] = d + 1; q1.push(nb); }
          }
        }
        layer++;
        q0 = q1; q1 = [];
      }
      for (var u = 0; u < n; u++) if (ch.cells[u] && dist[u] > MAX_SPAN) falling.push(u);
    }
    if (!falling.length) { checkDestroyed(b); return; }
    var maxBlocks = 260;
    var step = Math.max(1, Math.ceil(falling.length / maxBlocks));
    var color = new T.Color(b.color);
    for (var f = 0; f < falling.length; f++) {
      var fi = falling[f];
      cellCenter(ch, fi, cp);
      removeCell(b, fi);
      if (f % step === 0 && G.fx) {
        var sz = step > 1 ? Math.min(2, 1 + (step - 1) * 0.12) : 1;
        G.fx.fallingBlock(cp, CS * 0.98 * sz, FH * 0.98, color, center);
      } else {
        W.addRubble(cp.x, cp.z, 0.25);
      }
    }
    ch.mesh.instanceMatrix.needsUpdate = true;
    if (G.fx) G.fx.dust(new T.Vector3(b.x, b.y0 + 2, b.z), Math.max(b.w, b.d) * 0.9, true);
    if (G.audio) G.audio.sfx('collapse', new T.Vector3(b.x, b.y0 + 5, b.z));
    if (G.cam && G.cam.addShake) G.cam.addShake(Math.min(1.2, falling.length / 200));
    checkDestroyed(b);
  }

  function checkDestroyed(b) {
    var ch = b.chunks;
    if (!b.destroyed && ch.alive < ch.total * 0.4) {
      b.destroyed = true;
      G.emit('buildingDestroyed', b);
    }
    if (ch.alive === 0) b.collider.off = true;
  }

  W.destroyedRatio = function (b) {
    if (!b.chunks) return 0;
    return 1 - b.chunks.alive / b.chunks.total;
  };

  // ---- Lampen 's nachts ----------------------------------------------------------------
  var lampLights = [];
  var interiorLight = null;
  var lampTimer = 0;

  function setupLights() {
    for (var i = 0; i < 4; i++) {
      var l = new T.PointLight(0xffc78a, 0, 26, 1.6);
      l.position.set(0, -100, 0);
      G.scene.add(l);
      lampLights.push(l);
    }
    interiorLight = new T.PointLight(0xfff1dd, 0, 30, 1.2);
    interiorLight.position.set(0, -100, 0);
    G.scene.add(interiorLight);
  }

  W.update = function (dt, focus) {
    var night = G.uniforms.uNight.value;
    if (W.lampMat) W.lampMat.emissiveIntensity = night * 6;
    for (var s = 0; s < W.signMats.length; s++) W.signMats[s].emissiveIntensity = 0.25 + night * 1.6;
    if (W.craneJib) W.craneJib.rotation.y += dt * 0.05;
    lampTimer -= dt;
    if (lampTimer <= 0) {
      lampTimer = 0.4;
      var near = [];
      if (night > 0.05) {
        for (var i = 0; i < lamps.length; i++) {
          var l = lamps[i];
          var d = U.dist2(l.lx, l.lz, focus.x, focus.z);
          if (d < 70) near.push({ l: l, d: d });
        }
        near.sort(function (a, b) { return a.d - b.d; });
      }
      for (var k = 0; k < lampLights.length; k++) {
        var L = lampLights[k];
        if (near[k]) {
          L.position.set(near[k].l.lx, PLINTH + 7.1, near[k].l.lz);
          L.intensity = 90 * night;
        } else {
          L.intensity = 0;
        }
      }
    }
    // Binnenverlichting en spiegel alleen in het gebouw waar je bent
    var inside = W.interiorAt(focus);
    W.inside = inside;
    if (inside) {
      interiorLight.position.set(inside.x, PLINTH + inside.h - 0.8, inside.z);
      interiorLight.intensity = 60;
      interiorLight.distance = Math.max(inside.w, inside.d) * 1.3;
    } else {
      interiorLight.intensity = 0;
    }
    W.interiors.forEach(function (it) { if (it.mirror) it.mirror.visible = inside === it; });
  };

  // ---- Wegen-graaf voor verkeer ------------------------------------------------------
  W.nodeValid = function (i, j) { return i >= IMIN && i <= IMAX && j >= JMIN && j <= JMAX; };
  W.nearestNode = function (x, z) {
    return { i: U.clamp(Math.round(x / P), IMIN, IMAX), j: U.clamp(Math.round(z / P), JMIN, JMAX) };
  };
  W.neighbors = function (i, j) {
    var out = [];
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
      if (W.nodeValid(i + d[0], j + d[1])) out.push({ i: i + d[0], j: j + d[1] });
    });
    return out;
  };
  // Kortste route over het stratenrooster (BFS)
  W.route = function (a, b) {
    if (a.i === b.i && a.j === b.j) return [a];
    var key = function (n) { return n.i + ',' + n.j; };
    var prev = {};
    var q = [a];
    prev[key(a)] = null;
    while (q.length) {
      var n = q.shift();
      if (n.i === b.i && n.j === b.j) break;
      var nb = W.neighbors(n.i, n.j);
      for (var k = 0; k < nb.length; k++) {
        var kk = key(nb[k]);
        if (!(kk in prev)) { prev[kk] = n; q.push(nb[k]); }
      }
    }
    var path = [];
    var cur = b;
    while (cur) { path.unshift(cur); cur = prev[key(cur)]; }
    return path;
  };

  // ---- Opbouw ---------------------------------------------------------------------
  W.build = function () {
    for (var bi = IMIN; bi < IMAX; bi++) {
      for (var bj = JMIN; bj < JMAX; bj++) genBlock(bi, bj);
    }
    buildSpecials();
    placeTrees();
    buildMeshes();
    instTrees();
    instLamps();
    instContainers();
    setupLights();
    // onzichtbare grens van de wereld
    W.size = { x0: -1100, x1: 1100, z0: -1100, z1: 1300 };
  };
})();
