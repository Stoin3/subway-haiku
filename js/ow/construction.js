/*
 * construction.js - bouwsimulatie op de bouwplaats: blokken plaatsen/verwijderen met
 * verschillende materialen, een stabiliteitsberekening (overstek per materiaal),
 * instorten van niet-gedragen delen, waarde + huurinkomsten en bouwopdrachten met blauwdruk.
 */
(function () {
  'use strict';

  var G = window.G, T = G.T, U = G.U;
  var B = G.build = { active: false, mat: 0 };

  B.MATS = [
    { id: 'beton', name: 'Beton', price: 30, strength: 3, color: '#a3a3a0', rough: 0.9, metal: 0 },
    { id: 'baksteen', name: 'Baksteen', price: 20, strength: 2, color: '#b5532f', rough: 0.85, metal: 0 },
    { id: 'hout', name: 'Hout', price: 12, strength: 1, color: '#b98a55', rough: 0.75, metal: 0 },
    { id: 'glas', name: 'Glas', price: 35, strength: 0, color: '#a9d6e5', rough: 0.05, metal: 0.3, glass: true },
    { id: 'staal', name: 'Staalbalk', price: 55, strength: 6, color: '#607d8b', rough: 0.35, metal: 0.9 },
    { id: 'dak', name: 'Dakpannen', price: 25, strength: 2, color: '#5d4037', rough: 0.7, metal: 0 }
  ];

  var CELL = 2, N = 20, MAXY = 16;
  var blocks = [];          // {x,y,z,m,col}
  var map = {};
  var meshes = [];
  var ghost, bpMesh;
  var plot;
  var blueprint = null;
  var hoverInfo = null;
  var hidden = new T.Matrix4().makeScale(0, 0, 0);

  function key(x, y, z) { return x + ',' + y + ',' + z; }

  function worldOf(b, out) {
    return out.set(plot.x0 + (b.x + 0.5) * CELL, plot.y0 + b.y * CELL, plot.z0 + (b.z + 0.5) * CELL);
  }

  function rebuildMeshes() {
    var m = new T.Matrix4(), p = new T.Vector3(), q = new T.Quaternion(), s = new T.Vector3(CELL, CELL, CELL);
    var counts = B.MATS.map(function () { return 0; });
    blocks.forEach(function (b) {
      var mi = b.m;
      worldOf(b, p);
      m.compose(p, q, s);
      meshes[mi].setMatrixAt(counts[mi]++, m);
    });
    meshes.forEach(function (im, i) {
      im.count = counts[i];
      im.instanceMatrix.needsUpdate = true;
    });
  }

  function addBlock(x, y, z, mi, silent) {
    var k = key(x, y, z);
    if (map[k]) return null;
    var b = { x: x, y: y, z: z, m: mi };
    var c = new T.Vector3();
    worldOf(b, c);
    b.col = G.world.addCollider(c.x - CELL / 2, c.y, c.z - CELL / 2, c.x + CELL / 2, c.y + CELL, c.z + CELL / 2, 'bouw');
    blocks.push(b);
    map[k] = b;
    if (!silent) rebuildMeshes();
    return b;
  }

  function removeBlock(b, silent) {
    var i = blocks.indexOf(b);
    if (i < 0) return;
    blocks.splice(i, 1);
    delete map[key(b.x, b.y, b.z)];
    G.world.removeCollider(b.col);
    if (!silent) rebuildMeshes();
  }

  // ---- Stabiliteit: overstek-afstand per blok (0-1 BFS) --------------------------------
  function stability() {
    var dist = {};
    var dq = [];
    blocks.forEach(function (b) {
      if (b.y === 0) { dist[key(b.x, b.y, b.z)] = 0; dq.push(b); }
    });
    var head = 0;
    var front = [];
    while (head < dq.length || front.length) {
      var b = front.length ? front.pop() : dq[head++];
      var d = dist[key(b.x, b.y, b.z)];
      var mat = B.MATS[b.m];
      if (d > mat.strength) continue; // dit blok draagt zelf niets
      var nb = [[0, 1, 0, 0], [1, 0, 0, 1], [-1, 0, 0, 1], [0, 0, 1, 1], [0, 0, -1, 1], [0, -1, 0, 1]];
      for (var i = 0; i < nb.length; i++) {
        var n = map[key(b.x + nb[i][0], b.y + nb[i][1], b.z + nb[i][2])];
        if (!n) continue;
        var nd = d + nb[i][3];
        var kk = key(n.x, n.y, n.z);
        if (dist[kk] === undefined || nd < dist[kk]) {
          dist[kk] = nd;
          if (nb[i][3] === 0) front.push(n); else dq.push(n);
        }
      }
    }
    var falling = [];
    blocks.forEach(function (b) {
      var d = dist[key(b.x, b.y, b.z)];
      if (d === undefined || d > B.MATS[b.m].strength) falling.push(b);
    });
    return { dist: dist, falling: falling };
  }

  function settle(origin) {
    var guard = 0;
    var total = 0;
    while (guard++ < 20) {
      var st = stability();
      if (!st.falling.length) break;
      var c = new T.Vector3();
      st.falling.forEach(function (b) {
        worldOf(b, c);
        c.y += CELL / 2;
        var mat = B.MATS[b.m];
        G.fx.fallingBlock(c.clone(), CELL * 0.97, CELL * 0.97, new T.Color(mat.color), origin || c);
        removeBlock(b, true);
      });
      total += st.falling.length;
    }
    if (total) {
      rebuildMeshes();
      G.audio.sfx('collapse', new T.Vector3(plot.x0 + 20, plot.y0 + 3, plot.z0 + 20), { vol: Math.min(1, total / 20) });
      G.emit('toast', { text: '⚠ ' + total + ' blok(ken) stortten in: niet genoeg ondersteuning!', kind: 'bad' });
    }
    return total;
  }

  B.value = function () {
    var v = 0;
    blocks.forEach(function (b) { v += B.MATS[b.m].price * 1.6; });
    // bonus voor hoogte en gesloten ruimtes (glas + dak maken een "woning")
    var hasRoof = blocks.some(function (b) { return b.m === 5 && b.y >= 2; });
    var hasGlass = blocks.some(function (b) { return b.m === 3; });
    if (hasRoof && hasGlass && blocks.length > 40) v *= 1.35;
    return Math.round(v);
  };
  B.count = function () { return blocks.length; };

  // ---- Raycast tegen bouwkavel en blokken --------------------------------------------
  var rayTmp = {};
  function pick(o, d) {
    var best = 1e9, hit = null;
    // grond van de kavel
    if (d.y < -1e-4) {
      var t = (plot.y0 - o.y) / d.y;
      if (t > 0) {
        var px = o.x + d.x * t, pz = o.z + d.z * t;
        var gx = Math.floor((px - plot.x0) / CELL), gz = Math.floor((pz - plot.z0) / CELL);
        if (gx >= 0 && gz >= 0 && gx < N && gz < N) { best = t; hit = { x: gx, y: 0, z: gz, remove: null }; }
      }
    }
    var c = new T.Vector3();
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      worldOf(b, c);
      var tt = G.world.slab(o, d, c.x - CELL / 2, c.y, c.z - CELL / 2, c.x + CELL / 2, c.y + CELL, c.z + CELL / 2, rayTmp);
      if (tt >= 0 && tt < best) {
        best = tt;
        var n = [0, 0, 0];
        n[rayTmp.axis] = rayTmp.sign;
        hit = { x: b.x + n[0], y: b.y + n[1], z: b.z + n[2], remove: b };
      }
    }
    if (hit) hit.t = best;
    return hit;
  }

  B.inPlot = function (p) {
    return p.x > plot.x0 - 6 && p.x < plot.x0 + plot.size + 6 && p.z > plot.z0 - 6 && p.z < plot.z0 + plot.size + 6;
  };

  B.toggle = function (on) {
    B.active = on === undefined ? !B.active : on;
    ghost.visible = B.active;
    G.emit('buildMode', B.active);
  };

  // ---- Blauwdruk-opdrachten ---------------------------------------------------------
  B.setBlueprint = function (cells) {
    blueprint = cells;
    var m = new T.Matrix4(), p = new T.Vector3(), q = new T.Quaternion(), s = new T.Vector3(CELL * 1.002, CELL * 1.002, CELL * 1.002);
    if (!cells) { bpMesh.count = 0; bpMesh.instanceMatrix.needsUpdate = true; return; }
    cells.forEach(function (c, i) {
      worldOf(c, p);
      m.compose(p, q, s);
      bpMesh.setMatrixAt(i, m);
    });
    bpMesh.count = cells.length;
    bpMesh.instanceMatrix.needsUpdate = true;
  };

  B.blueprintProgress = function () {
    if (!blueprint) return 0;
    var ok = 0;
    blueprint.forEach(function (c) {
      var b = map[key(c.x, c.y, c.z)];
      if (b && (c.m === undefined || c.m === b.m || (c.m === 'muur' && b.m !== 3))) ok++;
    });
    return ok / blueprint.length;
  };

  // Een klein huisje: muren met ramen, deur, dak
  B.houseBlueprint = function () {
    var cells = [];
    var x0 = 7, z0 = 7, w = 6, d = 5;
    for (var y = 0; y < 3; y++) {
      for (var x = 0; x < w; x++) {
        for (var z = 0; z < d; z++) {
          var edge = x === 0 || z === 0 || x === w - 1 || z === d - 1;
          if (!edge) continue;
          if (z === d - 1 && x === 2 && y < 2) continue; // deur
          var win = y === 1 && ((x === 0 || x === w - 1) && z === 2 || (z === 0 && (x === 1 || x === 4)));
          cells.push({ x: x0 + x, y: y, z: z0 + z, m: win ? 3 : 'muur' });
        }
      }
    }
    for (var rx = 0; rx < w; rx++) for (var rz = 0; rz < d; rz++) cells.push({ x: x0 + rx, y: 3, z: z0 + rz, m: 5 });
    return cells;
  };

  // ---- Explosieschade ------------------------------------------------------------------
  B.damage = function (pos, radius) {
    if (!plot || !blocks.length) return;
    if (pos.x < plot.x0 - radius || pos.x > plot.x0 + plot.size + radius || pos.z < plot.z0 - radius || pos.z > plot.z0 + plot.size + radius) return;
    var c = new T.Vector3();
    var removed = 0;
    blocks.slice().forEach(function (b) {
      worldOf(b, c);
      c.y += CELL / 2;
      if (c.distanceTo(pos) < radius * (0.6 + Math.random() * 0.5)) {
        G.fx.debrisBurst(c, B.MATS[b.m].color, pos, 2);
        removeBlock(b, true);
        removed++;
      }
    });
    if (removed) {
      rebuildMeshes();
      settle(pos);
    }
  };

  // ---- Update (bouwmodus) -----------------------------------------------------------------
  B.update = function (dt) {
    if (!B.active) return;
    var I = G.input;
    var player = G.player;
    if (!B.inPlot(player.pos) || player.vehicle) { B.toggle(false); return; }
    for (var k = 0; k < B.MATS.length; k++) if (I.hit('Digit' + (k + 1))) B.mat = k;
    if (I.mouse.wheel) B.mat = (B.mat + (I.mouse.wheel > 0 ? 1 : -1) + B.MATS.length) % B.MATS.length;
    var o = G.cam.position.clone();
    var d = new T.Vector3();
    G.cam.getWorldDirection(d);
    var hit = pick(o, d);
    hoverInfo = hit;
    var valid = hit && hit.x >= 0 && hit.z >= 0 && hit.x < N && hit.z < N && hit.y >= 0 && hit.y < MAXY && hit.t < 40;
    var mat = B.MATS[B.mat];
    if (valid) {
      ghost.visible = true;
      var p = new T.Vector3();
      worldOf(hit, p);
      ghost.position.set(p.x, p.y + CELL / 2, p.z);
      // speler mag niet in zijn eigen blok bouwen
      var inside = Math.abs(player.pos.x - p.x) < CELL / 2 + 0.3 && Math.abs(player.pos.z - p.z) < CELL / 2 + 0.3 && player.pos.y < p.y + CELL && player.pos.y + 1.7 > p.y;
      var ok = !inside && G.state.money >= mat.price;
      ghost.material.color.set(ok ? '#66ff99' : '#ff5555');
      if (I.click(0) && ok) {
        G.addMoney(-mat.price, 'Bouwmateriaal');
        addBlock(hit.x, hit.y, hit.z, B.mat);
        G.audio.sfx('build', p);
        settle();
        G.emit('built', { count: blocks.length });
      }
    } else {
      ghost.visible = false;
    }
    if (I.click(2) && hit && hit.remove) {
      var rb = hit.remove;
      G.addMoney(Math.round(B.MATS[rb.m].price * 0.5), 'Sloop (50% terug)');
      var rp = new T.Vector3();
      worldOf(rb, rp);
      removeBlock(rb);
      G.audio.sfx('build', rp);
      settle();
    }
  };

  B.hover = function () { return hoverInfo; };

  // Dagelijkse huurinkomsten
  B.daily = function () {
    var v = B.value();
    if (v < 100) return;
    var rent = Math.round(v * 0.04);
    G.addMoney(rent, 'Huur van je bouwwerk');
    G.emit('toast', { text: '🏠 Huurinkomsten van je bouwwerk: ' + U.money(rent), kind: 'good' });
  };

  B.init = function () {
    plot = G.world.plot;
    meshes = B.MATS.map(function (m) {
      var mat = new T.MeshStandardMaterial({ color: m.color, roughness: m.rough, metalness: m.metal, transparent: !!m.glass, opacity: m.glass ? 0.45 : 1 });
      if (!m.glass) {
        G.patchWorld(mat, {
          key: 'bouw_' + m.id,
          color: m.id === 'baksteen' ? [
            'vec2 bp = vec2(dot(vWP.xz, vec2(1.0)), vWP.y);',
            'vec2 bc = vec2(bp.x / 0.5 + step(0.5, fract(bp.y / 0.5)) * 0.5, bp.y / 0.25);',
            'vec2 bf = fract(bc);',
            'float mortar = step(bf.x, 0.06) + step(bf.y, 0.1);',
            'diffuseColor.rgb *= (0.85 + owHash(floor(bc)) * 0.25) * (1.0 - min(1.0, mortar) * 0.35);'
          ].join('\n') : 'diffuseColor.rgb *= 0.88 + 0.18 * owNoise(vWP.xz * 1.3 + vWP.y * 2.1);'
        });
      }
      var im = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), mat, 3000);
      im.count = 0;
      im.castShadow = !m.glass;
      im.receiveShadow = true;
      im.frustumCulled = false;
      G.scene.add(im);
      return im;
    });
    ghost = new T.Mesh(new T.BoxGeometry(CELL * 1.02, CELL * 1.02, CELL * 1.02), new T.MeshBasicMaterial({ color: '#66ff99', transparent: true, opacity: 0.35, depthWrite: false }));
    ghost.visible = false;
    G.scene.add(ghost);
    bpMesh = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new T.MeshBasicMaterial({ color: '#4fc3f7', transparent: true, opacity: 0.18, depthWrite: false, wireframe: false }), 400);
    bpMesh.count = 0;
    bpMesh.frustumCulled = false;
    G.scene.add(bpMesh);
    // opgeslagen bouwwerk herstellen
    blocks.slice().forEach(function (b) { removeBlock(b, true); });
    (G.state.build.blocks || []).forEach(function (a) { addBlock(a[0], a[1], a[2], a[3], true); });
    rebuildMeshes();
  };

  G.on('save', function (s) {
    s.build.blocks = blocks.map(function (b) { return [b.x, b.y, b.z, b.m]; });
  });
})();
