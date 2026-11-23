/*
 * characters.js - procedureel opgebouwde personages met skelet, verwisselbare kleding,
 * gezichtstexturen (normaal en anime-stijl) en procedurele animaties.
 * Alle ontwerpen zijn eigen werk; er worden geen bestaande personages nagebootst.
 */
(function () {
  'use strict';

  var G = window.G, T = G.T, U = G.U;

  var charMat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.02 });
  G.charMat = charMat;

  function merge(list) {
    if (!list.length) return null;
    var BGU = G.A.BufferGeometryUtils;
    var g = BGU && BGU.mergeGeometries ? BGU.mergeGeometries(list, false) : list[0];
    list.forEach(function (x) { if (x !== g) x.dispose(); });
    return g;
  }

  var tmpM = new T.Matrix4(), tmpQ = new T.Quaternion(), tmpE = new T.Euler(), tmpS = new T.Vector3(), tmpP = new T.Vector3();

  // Een gekleurd geometrie-onderdeel in bot-ruimte
  function part(geo, color, x, y, z, rx, ry, rz, sx, sy, sz) {
    tmpE.set(rx || 0, ry || 0, rz || 0);
    tmpQ.setFromEuler(tmpE);
    tmpS.set(sx || 1, sy === undefined ? (sx || 1) : sy, sz === undefined ? (sx || 1) : sz);
    tmpP.set(x || 0, y || 0, z || 0);
    tmpM.compose(tmpP, tmpQ, tmpS);
    geo.applyMatrix4(tmpM);
    var c = new T.Color(color);
    var n = geo.attributes.position.count;
    var arr = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    geo.setAttribute('color', new T.BufferAttribute(arr, 3));
    return geo;
  }

  function cap(r, len, seg) { return new T.CapsuleGeometry(r, len, 3, seg || 10); }
  function sph(r, ws, hs, ts, tl) { return new T.SphereGeometry(r, ws || 14, hs || 10, 0, Math.PI * 2, ts || 0, tl === undefined ? Math.PI : tl); }
  function box(w, h, d) { return new T.BoxGeometry(w, h, d); }
  function cyl(rt, rb, h, s) { return new T.CylinderGeometry(rt, rb, h, s || 12); }

  function darker(c, f) { return new T.Color(c).multiplyScalar(f || 0.75).getStyle(); }

  // ---- Gezichten ---------------------------------------------------------------
  var faceCache = {};
  function faceTexture(look, expr) {
    var key = [look.skin, look.face || 'normaal', look.eyeColor || '#3e2a1e', look.build, expr || 'neutraal', look.lips || ''].join('|');
    if (faceCache[key]) return faceCache[key];
    var c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    var g = c.getContext('2d');
    g.fillStyle = look.skin;
    g.fillRect(0, 0, 512, 256);
    var cx = 128, ey = 122;
    var eyeCol = look.eyeColor || '#3e2a1e';
    var anime = look.face === 'anime';
    function ell(x, y, rx, ry, col) { g.fillStyle = col; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill(); }
    // lichte schaduw onder de wenkbrauwen en wangen
    var sk = new T.Color(look.skin);
    g.fillStyle = 'rgba(0,0,0,0.06)';
    g.fillRect(cx - 40, ey - 18, 80, 8);
    [-1, 1].forEach(function (s) {
      var x = cx + s * (anime ? 23 : 21);
      if (anime) {
        ell(x, ey + 2, 12, 15, '#ffffff');
        var grd = g.createLinearGradient(0, ey - 12, 0, ey + 16);
        grd.addColorStop(0, '#1d1030');
        grd.addColorStop(0.5, eyeCol);
        grd.addColorStop(1, new T.Color(eyeCol).lerp(new T.Color('#ffffff'), 0.5).getStyle());
        g.fillStyle = grd;
        g.beginPath(); g.ellipse(x, ey + 4, 9, 13, 0, 0, Math.PI * 2); g.fill();
        ell(x, ey + 5, 4, 6, '#140a1e');
        ell(x - 3, ey - 2, 3.2, 3.6, '#ffffff');
        ell(x + 3, ey + 9, 1.6, 1.6, '#ffffff');
        g.strokeStyle = '#1a1020';
        g.lineWidth = 3.2;
        g.beginPath(); g.ellipse(x, ey + 2, 13, 15, 0, Math.PI * 1.08, Math.PI * 1.92); g.stroke();
        g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(x + s * 11, ey - 8); g.lineTo(x + s * 16, ey - 12); g.stroke();
        g.strokeStyle = darker(look.hairColor || '#3b2416', 0.8);
        g.lineWidth = 2;
        g.beginPath(); g.arc(x, ey - 8, 12, Math.PI * 1.2, Math.PI * 1.8); g.stroke();
        g.fillStyle = 'rgba(255,120,150,0.35)';
        g.beginPath(); g.ellipse(cx + s * 30, ey + 24, 8, 4, 0, 0, Math.PI * 2); g.fill();
      } else {
        ell(x, ey, 7.5, 4.6, '#f7f3ef');
        ell(x, ey, 3.8, 3.8, eyeCol);
        ell(x, ey, 1.8, 1.8, '#0c0806');
        ell(x - 1.2, ey - 1.4, 0.9, 0.9, '#ffffff');
        g.strokeStyle = 'rgba(30,20,15,0.65)';
        g.lineWidth = 1.2;
        g.beginPath(); g.ellipse(x, ey, 7.5, 4.6, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
        g.strokeStyle = darker(look.hairColor || '#2b1a10', 0.9);
        g.lineWidth = look.build === 'v' ? 2 : 3.2;
        g.beginPath(); g.moveTo(x - 9, ey - 9 + (s > 0 ? 1 : 0)); g.quadraticCurveTo(x, ey - 13, x + 9, ey - 9); g.stroke();
      }
    });
    // neus
    g.strokeStyle = 'rgba(0,0,0,' + (anime ? 0.12 : 0.18) + ')';
    g.lineWidth = 1.4;
    g.beginPath();
    if (anime) { g.moveTo(cx, ey + 20); g.lineTo(cx + 2, ey + 23); }
    else { g.moveTo(cx - 1, ey + 8); g.lineTo(cx - 3, ey + 24); g.lineTo(cx + 3, ey + 25); }
    g.stroke();
    // mond
    var my = anime ? ey + 34 : ey + 36;
    g.strokeStyle = look.lips || (look.build === 'v' ? '#b5485d' : '#8a4b3c');
    g.lineWidth = anime ? 2 : 2.4;
    g.beginPath();
    if (expr === 'blij') { g.arc(cx, my - 5, anime ? 7 : 9, Math.PI * 0.15, Math.PI * 0.85); }
    else if (expr === 'boos') { g.arc(cx, my + 6, 8, Math.PI * 1.2, Math.PI * 1.8); }
    else if (expr === 'bang') { g.ellipse(cx, my, 4, 6, 0, 0, Math.PI * 2); }
    else { g.moveTo(cx - (anime ? 5 : 8), my); g.quadraticCurveTo(cx, my + 2.5, cx + (anime ? 5 : 8), my); }
    g.stroke();
    if (look.beard) {
      g.fillStyle = darker(look.hairColor || '#2b1a10', 0.9);
      g.globalAlpha = 0.85;
      g.beginPath(); g.ellipse(cx, my + 10, 26, 16, 0, 0, Math.PI); g.fill();
      g.fillRect(cx - 14, my - 9, 28, 5);
      g.globalAlpha = 1;
    }
    var tex = new T.CanvasTexture(c);
    tex.colorSpace = T.SRGBColorSpace;
    tex.anisotropy = 4;
    var mat = new T.MeshStandardMaterial({ map: tex, roughness: 0.65 });
    faceCache[key] = mat;
    sk = null;
    return mat;
  }

  // ---- Kledingdefinities -----------------------------------------------------------
  G.CLOTHES = {
    top: [
      { id: 'tshirt', name: 'T-shirt', price: 40 },
      { id: 'longsleeve', name: 'Longsleeve', price: 70 },
      { id: 'hoodie', name: 'Hoodie', price: 120 },
      { id: 'jas', name: 'Leren jas', price: 450 },
      { id: 'pak', name: 'Maatpak', price: 1200 },
      { id: 'tanktop', name: 'Tanktop', price: 35 },
      { id: 'jurk', name: 'Zomerjurk', price: 260 },
      { id: 'vest', name: 'Kogelwerend vest (+50 bepantsering)', price: 2500 }
    ],
    pants: [
      { id: 'jeans', name: 'Spijkerbroek', price: 80 },
      { id: 'chino', name: 'Chino', price: 90 },
      { id: 'short', name: 'Korte broek', price: 45 },
      { id: 'rok', name: 'Plooirok', price: 95 },
      { id: 'joggers', name: 'Joggingbroek', price: 60 }
    ],
    shoes: [
      { id: 'sneakers', name: 'Sneakers', price: 110 },
      { id: 'laarzen', name: 'Laarzen', price: 220 },
      { id: 'nette', name: 'Nette schoenen', price: 320 }
    ],
    hair: [
      { id: 'kort', name: 'Kort', price: 25 },
      { id: 'buzz', name: 'Opgeschoren', price: 15 },
      { id: 'lang', name: 'Lang', price: 45 },
      { id: 'paardenstaart', name: 'Paardenstaart', price: 40 },
      { id: 'staartjes', name: 'Twee staartjes', price: 50 },
      { id: 'knot', name: 'Knot', price: 40 },
      { id: 'afro', name: 'Afro', price: 50 },
      { id: 'hanenkam', name: 'Hanenkam', price: 60 },
      { id: 'kaal', name: 'Kaal', price: 10 }
    ],
    hat: [
      { id: 'geen', name: 'Geen', price: 0 },
      { id: 'pet', name: 'Pet', price: 35 },
      { id: 'muts', name: 'Muts', price: 30 },
      { id: 'hoed', name: 'Gleufhoed', price: 140 }
    ],
    glasses: [
      { id: 'geen', name: 'Geen', price: 0 },
      { id: 'zonnebril', name: 'Zonnebril', price: 90 },
      { id: 'bril', name: 'Bril', price: 120 }
    ]
  };
  G.COLORS = ['#f5f5f5', '#212121', '#e53935', '#1e88e5', '#43a047', '#fdd835', '#8e24aa', '#ff7043',
    '#00897b', '#f8bbd0', '#795548', '#9e9e9e', '#2c4a7a', '#b39ddb', '#ffb300', '#6d4c41'];
  G.HAIR_COLORS = ['#1b120c', '#3b2416', '#6b4423', '#a36a3a', '#d1a35a', '#e6d28a', '#8a8a8a', '#c0392b', '#b39ddb', '#4fc3f7', '#f48fb1'];
  G.SKINS = ['#f5d6c6', '#e8b896', '#e0ac86', '#c98d64', '#a86e48', '#7a4b30', '#5a3622'];

  // ---- Character ----------------------------------------------------------------------
  function Character(look) {
    this.look = Object.assign({}, look);
    this.root = new T.Group();
    this.model = new T.Group();
    this.root.add(this.model);
    this.meshes = [];
    this.phase = Math.random() * 6;
    this.time = Math.random() * 10;
    this.cur = {};
    this.tailState = [];
    this.weaponMesh = null;
    this.expr = 'neutraal';
    this.build();
  }
  G.Character = Character;

  Character.prototype.dispose = function () {
    this.meshes.forEach(function (m) { if (m.geometry) m.geometry.dispose(); });
    this.meshes = [];
  };

  Character.prototype.addMesh = function (bone, geos, mat) {
    var g = merge(geos);
    if (!g) return null;
    var m = new T.Mesh(g, mat || charMat);
    m.castShadow = true;
    m.receiveShadow = true;
    bone.add(m);
    this.meshes.push(m);
    return m;
  };

  Character.prototype.build = function () {
    var L = this.look;
    var self = this;
    this.dispose();
    while (this.model.children.length) this.model.remove(this.model.children[0]);
    var fem = L.build === 'v';
    var sc = L.height || 1;
    this.model.scale.setScalar(sc);
    this.scale = sc;
    var skin = L.skin, top = L.topColor, pantsC = L.pantsColor, shoe = L.shoesColor, hairC = L.hairColor;
    var t = L.top, pa = L.pants;
    var sleeveLong = t === 'longsleeve' || t === 'hoodie' || t === 'jas' || t === 'pak';
    var sleeveColor = t === 'vest' ? '#263238' : top;
    var noSleeve = t === 'tanktop' || t === 'jurk';
    var legSkin = pa === 'short' || pa === 'rok' || t === 'jurk';

    var b = this.b = {};
    b.hips = new T.Group(); b.hips.position.y = 0.95; this.model.add(b.hips);
    b.spine = new T.Group(); b.spine.position.y = 0.08; b.hips.add(b.spine);
    b.chest = new T.Group(); b.chest.position.y = 0.17; b.spine.add(b.chest);
    b.head = new T.Group(); b.head.position.y = 0.36; b.chest.add(b.head);
    var sw = fem ? 0.165 : 0.19;
    b.shL = new T.Group(); b.shL.position.set(sw, 0.24, 0); b.chest.add(b.shL);
    b.shR = new T.Group(); b.shR.position.set(-sw, 0.24, 0); b.chest.add(b.shR);
    b.elL = new T.Group(); b.elL.position.y = -0.28; b.shL.add(b.elL);
    b.elR = new T.Group(); b.elR.position.y = -0.28; b.shR.add(b.elR);
    b.handR = new T.Group(); b.handR.position.set(0, -0.27, 0.01); b.elR.add(b.handR);
    b.handL = new T.Group(); b.handL.position.set(0, -0.27, 0.01); b.elL.add(b.handL);
    var hw = fem ? 0.095 : 0.09;
    b.hipL = new T.Group(); b.hipL.position.set(hw, -0.04, 0); b.hips.add(b.hipL);
    b.hipR = new T.Group(); b.hipR.position.set(-hw, -0.04, 0); b.hips.add(b.hipR);
    b.knL = new T.Group(); b.knL.position.y = -0.43; b.hipL.add(b.knL);
    b.knR = new T.Group(); b.knR.position.y = -0.43; b.hipR.add(b.knR);

    // Heupen / onderlichaam
    var hipGeos = [];
    var pelvisCol = t === 'jurk' ? top : pantsC;
    hipGeos.push(part(sph(0.17, 14, 10), pelvisCol, 0, 0, 0, 0, 0, 0, fem ? 1.02 : 1, 0.68, 0.72));
    if (t !== 'jurk') hipGeos.push(part(cyl(0.162, 0.165, 0.045, 16), '#2a2a2a', 0, 0.075, 0));
    if (pa === 'rok' || t === 'jurk') {
      var skirtLen = t === 'jurk' ? 0.42 : 0.33;
      hipGeos.push(part(cyl(0.165, 0.26, skirtLen, 16), t === 'jurk' ? top : pantsC, 0, -skirtLen / 2 + 0.04, 0));
    }
    this.addMesh(b.hips, hipGeos);

    // Buik en borst
    var torsoCol = t === 'tanktop' ? top : top;
    var spineGeos = [part(cap(0.13, 0.08), torsoCol, 0, 0.03, 0, 0, 0, 0, fem ? 1.08 : 1.22, 1, 0.8)];
    this.addMesh(b.spine, spineGeos);

    var chestGeos = [];
    chestGeos.push(part(cap(0.15, 0.16), torsoCol, 0, 0.12, 0, 0, 0, 0, fem ? 1.08 : 1.3, 1, 0.8));
    chestGeos.push(part(cyl(0.05, 0.058, 0.12, 10), skin, 0, 0.32, 0));
    if (t === 'tanktop') {
      chestGeos.push(part(sph(0.07, 8, 6), skin, sw - 0.03, 0.24, 0));
      chestGeos.push(part(sph(0.07, 8, 6), skin, -sw + 0.03, 0.24, 0));
    }
    if (t === 'hoodie') {
      chestGeos.push(part(new T.TorusGeometry(0.1, 0.045, 6, 14), darker(top, 0.85), 0, 0.28, -0.07, 1.2, 0, 0));
      chestGeos.push(part(box(0.2, 0.08, 0.04), darker(top, 0.85), 0, -0.02, 0.12));
      chestGeos.push(part(cyl(0.006, 0.006, 0.14, 4), '#eeeeee', 0.04, 0.2, 0.13));
      chestGeos.push(part(cyl(0.006, 0.006, 0.14, 4), '#eeeeee', -0.04, 0.2, 0.13));
    }
    if (t === 'jas') {
      chestGeos.push(part(box(0.09, 0.34, 0.02), '#f0f0f0', 0, 0.12, 0.125));
      chestGeos.push(part(box(0.05, 0.2, 0.03), darker(top, 0.8), 0.06, 0.22, 0.12, 0, 0, -0.3));
      chestGeos.push(part(box(0.05, 0.2, 0.03), darker(top, 0.8), -0.06, 0.22, 0.12, 0, 0, 0.3));
    }
    if (t === 'pak') {
      chestGeos.push(part(box(0.1, 0.34, 0.02), '#fafafa', 0, 0.12, 0.125));
      chestGeos.push(part(box(0.035, 0.24, 0.025), L.tieColor || '#b71c1c', 0, 0.12, 0.135));
    }
    if (t === 'vest') {
      chestGeos.push(part(cap(0.16, 0.14), '#263238', 0, 0.1, 0, 0, 0, 0, fem ? 1.12 : 1.34, 1, 0.86));
      chestGeos.push(part(box(0.06, 0.05, 0.02), '#ffd54f', 0.08, 0.2, 0.14));
    }
    if (L.police) {
      chestGeos.push(part(box(0.06, 0.06, 0.02), '#ffd54f', 0.08, 0.2, 0.13));
      chestGeos.push(part(box(0.3, 0.03, 0.02), '#ffffff', 0, 0.05, 0.125));
    }
    if (L.backpack) chestGeos.push(part(box(0.28, 0.32, 0.14), L.backpack, 0, 0.1, -0.17));
    this.addMesh(b.chest, chestGeos);

    // Hoofd (met gezichtstextuur)
    var headGeo = sph(0.115, 24, 18);
    headGeo.scale(1, 1.12, 1.05);
    headGeo.translate(0, 0.11, 0);
    var headMesh = new T.Mesh(headGeo, faceTexture(L, this.expr));
    headMesh.castShadow = true;
    b.head.add(headMesh);
    this.meshes.push(headMesh);
    this.headMesh = headMesh;

    var hg = [];
    hg.push(part(sph(0.026, 8, 6), skin, 0.113, 0.1, -0.005));
    hg.push(part(sph(0.026, 8, 6), skin, -0.113, 0.1, -0.005));
    var hs = L.hair;
    this.tails = [];
    var hairTop = function (r, tl, zoff) { return part(sph(r, 18, 12, 0, tl), hairC, 0, 0.125, zoff || -0.008, -0.12, 0, 0, 1.03, 1.08, 1.1); };
    if (hs === 'kort') hg.push(hairTop(0.123, Math.PI * 0.52));
    if (hs === 'buzz') hg.push(hairTop(0.119, Math.PI * 0.48));
    if (hs === 'lang' || hs === 'paardenstaart' || hs === 'staartjes' || hs === 'knot') {
      hg.push(hairTop(0.125, Math.PI * 0.56));
      // pony
      for (var f = -2; f <= 2; f++) {
        hg.push(part(cap(0.022, 0.06, 6), hairC, f * 0.035, 0.19, 0.095, 0.5, 0, f * 0.15));
      }
    }
    if (hs === 'lang') {
      hg.push(part(cap(0.1, 0.22), hairC, 0, 0.0, -0.065, 0.12, 0, 0, 1.15, 1, 0.55));
      hg.push(part(cap(0.035, 0.2, 6), hairC, 0.1, 0.02, 0.02));
      hg.push(part(cap(0.035, 0.2, 6), hairC, -0.1, 0.02, 0.02));
    }
    if (hs === 'knot') hg.push(part(sph(0.065, 10, 8), hairC, 0, 0.25, -0.06));
    if (hs === 'afro') hg.push(part(sph(0.175, 16, 12), hairC, 0, 0.15, -0.02, 0, 0, 0, 1, 0.92, 1));
    if (hs === 'hanenkam') {
      hg.push(hairTop(0.118, Math.PI * 0.45));
      hg.push(part(box(0.03, 0.09, 0.22), hairC, 0, 0.24, -0.01));
    }
    // Hoofddeksels
    if (L.hat === 'pet') {
      hg.push(part(sph(0.127, 16, 10, 0, Math.PI * 0.5), L.hatColor, 0, 0.14, 0));
      hg.push(part(box(0.2, 0.015, 0.13), L.hatColor, 0, 0.145, 0.15));
    } else if (L.hat === 'muts') {
      hg.push(part(sph(0.13, 16, 10, 0, Math.PI * 0.55), L.hatColor, 0, 0.13, 0, 0, 0, 0, 1, 1.25, 1));
      hg.push(part(new T.TorusGeometry(0.125, 0.025, 6, 18), darker(L.hatColor, 0.85), 0, 0.16, 0, Math.PI / 2, 0, 0));
    } else if (L.hat === 'hoed') {
      hg.push(part(cyl(0.1, 0.12, 0.12, 16), L.hatColor, 0, 0.27, 0));
      hg.push(part(cyl(0.2, 0.2, 0.015, 20), L.hatColor, 0, 0.21, 0));
      hg.push(part(cyl(0.121, 0.121, 0.025, 16), '#222222', 0, 0.225, 0));
    } else if (L.hat === 'politie') {
      hg.push(part(cyl(0.13, 0.12, 0.08, 16), '#1a237e', 0, 0.23, 0));
      hg.push(part(box(0.18, 0.015, 0.1), '#111111', 0, 0.2, 0.12));
      hg.push(part(box(0.04, 0.03, 0.01), '#ffd54f', 0, 0.24, 0.13));
    }
    if (L.glasses === 'zonnebril' || L.glasses === 'bril') {
      var gc = L.glasses === 'zonnebril' ? '#111111' : '#9ec9e8';
      hg.push(part(box(0.045, 0.028, 0.01), gc, 0.042, 0.115, 0.118));
      hg.push(part(box(0.045, 0.028, 0.01), gc, -0.042, 0.115, 0.118));
      hg.push(part(box(0.04, 0.008, 0.008), '#222222', 0, 0.12, 0.12));
    }
    if (L.hairclip) hg.push(part(box(0.034, 0.034, 0.012), L.hairclip, 0.075, 0.21, 0.07, 0, 0, Math.PI / 4));
    this.addMesh(b.head, hg);

    // Verende staarten (secundaire beweging)
    var makeTail = function (x, y, z, len, r, side) {
      var g = new T.Group();
      g.position.set(x, y, z);
      b.head.add(g);
      var geos = [part(cap(r, len, 8), hairC, 0, -len / 2 - r, 0)];
      geos.push(part(sph(r * 1.3, 8, 6), L.hairclip || darker(hairC, 0.7), 0, 0, 0));
      self.addMesh(g, geos);
      self.tails.push({ g: g, a: 0, v: 0, side: side, b: 0, bv: 0 });
    };
    if (hs === 'paardenstaart') makeTail(0, 0.2, -0.11, 0.26, 0.04, 0);
    if (hs === 'staartjes') {
      makeTail(0.12, 0.2, -0.03, 0.34, 0.042, 1);
      makeTail(-0.12, 0.2, -0.03, 0.34, 0.042, -1);
    }

    // Armen
    var self2 = this;
    [['L', 1], ['R', -1]].forEach(function (a) {
      var sh = b['sh' + a[0]], el = b['el' + a[0]];
      var ug = [part(sph(0.062, 10, 8), noSleeve ? skin : sleeveColor, 0, -0.01, 0)];
      if (sleeveLong || t === 'vest') ug.push(part(cap(0.05, 0.19), sleeveColor, 0, -0.14, 0));
      else if (noSleeve) ug.push(part(cap(0.045, 0.19), skin, 0, -0.14, 0));
      else {
        ug.push(part(cap(0.054, 0.07), sleeveColor, 0, -0.06, 0));
        ug.push(part(cap(0.044, 0.15), skin, 0, -0.16, 0));
      }
      self2.addMesh(sh, ug);
      var fg = [];
      fg.push(part(cap(0.042, 0.17), sleeveLong ? sleeveColor : skin, 0, -0.12, 0));
      fg.push(part(sph(0.048, 10, 8), skin, 0, -0.27, 0.005, 0, 0, 0, 0.9, 1.25, 0.65));
      if (t === 'pak' || t === 'jas') fg.push(part(cyl(0.047, 0.047, 0.03, 10), '#fafafa', 0, -0.21, 0));
      self2.addMesh(el, fg);
    });

    // Benen
    [['L', 1], ['R', -1]].forEach(function (a) {
      var hip = b['hip' + a[0]], kn = b['kn' + a[0]];
      var tg = [];
      if (pa === 'short') {
        tg.push(part(cap(0.074, 0.12), pantsC, 0, -0.1, 0));
        tg.push(part(cap(0.062, 0.22), skin, 0, -0.27, 0));
      } else if (legSkin) {
        tg.push(part(cap(0.066, 0.3), L.tights || skin, 0, -0.21, 0));
      } else {
        tg.push(part(cap(0.072, 0.3), pantsC, 0, -0.21, 0, 0, 0, 0, pa === 'joggers' ? 1.08 : 1));
      }
      self2.addMesh(hip, tg);
      var sg = [];
      var shinCol = legSkin ? (L.tights || skin) : pantsC;
      sg.push(part(cap(0.056, 0.3), shinCol, 0, -0.2, 0, 0, 0, 0, pa === 'joggers' ? 1.08 : 1));
      if (L.shoes === 'laarzen') sg.push(part(cyl(0.065, 0.06, 0.22, 10), shoe, 0, -0.33, 0));
      if (L.socks && legSkin) sg.push(part(cyl(0.058, 0.058, 0.08, 10), L.socks, 0, -0.38, 0));
      sg.push(part(cap(0.05, 0.14, 8), shoe, 0, -0.425, 0.045, Math.PI / 2, 0, 0, 1.05, 1, 0.85));
      sg.push(part(box(0.1, 0.022, 0.25), L.shoes === 'sneakers' ? '#f5f5f5' : '#1a1a1a', 0, -0.465, 0.045));
      self2.addMesh(kn, sg);
    });

    // Bestaand wapen opnieuw vastmaken
    if (this.weaponMesh) b.handR.add(this.weaponMesh);
    this.cur = {};
  };

  Character.prototype.setLook = function (look) {
    this.look = Object.assign({}, look);
    this.build();
  };

  Character.prototype.setExpression = function (expr) {
    if (expr === this.expr) return;
    this.expr = expr;
    if (this.headMesh) this.headMesh.material = faceTexture(this.look, expr);
  };

  Character.prototype.setWeapon = function (mesh) {
    if (this.weaponMesh && this.weaponMesh.parent) this.weaponMesh.parent.remove(this.weaponMesh);
    this.weaponMesh = mesh;
    if (mesh) this.b.handR.add(mesh);
  };

  // ---- Animatie ----------------------------------------------------------------------
  var JOINTS = ['hips', 'spine', 'chest', 'head', 'shL', 'shR', 'elL', 'elR', 'hipL', 'hipR', 'knL', 'knR'];

  Character.prototype.animate = function (dt, s) {
    this.time += dt;
    var t = this.time;
    var b = this.b;
    var sp = s.speed || 0;
    var walkW = U.clamp(sp / 1.8, 0, 1);
    var runW = U.clamp((sp - 2.2) / 3.5, 0, 1);
    var freq = 0.85 + sp * 0.3;
    if (sp > 0.05) this.phase += dt * freq * Math.PI * 2 * 0.5;
    var ph = this.phase;
    var sn = Math.sin(ph), cs = Math.cos(ph);
    var P = {};
    var i;
    for (i = 0; i < JOINTS.length; i++) P[JOINTS[i]] = [0, 0, 0];
    var hipsY = 0.95;
    var A = 0.42 * walkW + 0.38 * runW;

    if (s.dead) {
      var sd = this.deadSeed || (this.deadSeed = Math.random() * 10);
      P.shL = [-0.4 + Math.sin(sd) * 0.6, 0, 1.3];
      P.shR = [-0.3 + Math.cos(sd) * 0.6, 0, -1.2];
      P.elL = [-0.3, 0, 0]; P.elR = [-0.5, 0, 0];
      P.hipL = [-0.2 + Math.sin(sd * 2) * 0.3, 0, 0.25]; P.hipR = [0.1, 0, -0.2];
      P.knL = [0.5, 0, 0]; P.knR = [0.2, 0, 0];
      P.head = [0.2, Math.sin(sd) * 0.6, 0];
    } else if (s.seat) {
      P.hipL = [-1.45, 0, 0.08]; P.hipR = [-1.45, 0, -0.08];
      P.knL = [1.35, 0, 0]; P.knR = [1.35, 0, 0];
      if (s.seat === 'driver') {
        P.shL = [-1.05, 0, 0.12]; P.shR = [-1.05, 0, -0.12];
        P.elL = [-0.55, 0, 0]; P.elR = [-0.55, 0, 0];
        P.chest = [0, s.steer ? -s.steer * 0.15 : 0, 0];
      } else {
        P.shL = [-0.3, 0, 0.1]; P.shR = [-0.3, 0, -0.1];
        P.elL = [-0.9, 0, 0]; P.elR = [-0.9, 0, 0];
      }
      hipsY = 0.95;
    } else if (!s.grounded) {
      P.hipL = [-0.7, 0, 0.05]; P.hipR = [-0.15, 0, -0.05];
      P.knL = [1.0, 0, 0]; P.knR = [0.45, 0, 0];
      P.shL = [-0.5, 0, 0.6]; P.shR = [-0.5, 0, -0.6];
      P.elL = [-0.5, 0, 0]; P.elR = [-0.5, 0, 0];
      P.spine = [0.1, 0, 0];
    } else {
      P.hipL = [-sn * A, 0, 0.03];
      P.hipR = [sn * A, 0, -0.03];
      var kn = 0.75 * walkW + 1.15 * runW;
      P.knL = [0.06 + Math.max(0, cs) * kn, 0, 0];
      P.knR = [0.06 + Math.max(0, -cs) * kn, 0, 0];
      var armA = 0.32 * walkW + 0.75 * runW;
      P.shL = [sn * armA + 0.04, 0, 0.07 + runW * 0.1];
      P.shR = [-sn * armA + 0.04, 0, -0.07 - runW * 0.1];
      P.elL = [-(0.22 + 0.3 * walkW + 1.15 * runW) - Math.max(0, -sn) * 0.25 * runW, 0, 0];
      P.elR = [-(0.22 + 0.3 * walkW + 1.15 * runW) - Math.max(0, sn) * 0.25 * runW, 0, 0];
      P.hips = [0, sn * 0.13 * walkW, 0];
      P.chest = [0, -sn * 0.18 * (walkW + runW) * 0.6, 0];
      P.spine = [0.03 + runW * 0.24 + (s.lean || 0), 0, 0];
      P.head = [-runW * 0.15, 0, 0];
      hipsY = 0.95 + (1 - Math.abs(sn)) * 0.035 * (walkW + runW * 0.6) - runW * 0.04;
      if (sp < 0.2) {
        // ademen en gewicht verplaatsen
        P.chest[0] = Math.sin(t * 1.7) * 0.025;
        P.hips[2] = Math.sin(t * 0.45) * 0.03;
        P.head[1] = Math.sin(t * 0.3) * 0.25;
        P.shL = [0.03, 0, 0.09]; P.shR = [0.03, 0, -0.09];
        P.elL = [-0.15, 0, 0]; P.elR = [-0.15, 0, 0];
      }
      if (s.crouch) {
        P.hipL[0] -= 0.8; P.hipR[0] -= 0.8; P.knL[0] += 1.2; P.knR[0] += 1.2; P.spine[0] += 0.35;
        hipsY -= 0.25;
      }
    }

    // Bovenlichaam-overlays
    var pitch = s.aimPitch || 0;
    if (!s.dead && !s.seat) {
      if (s.handsUp) {
        P.shL = [-2.9, 0, 0.35]; P.shR = [-2.9, 0, -0.35]; P.elL = [-0.35, 0, 0]; P.elR = [-0.35, 0, 0];
      } else if (s.flee) {
        P.shL = [-2.4 + Math.sin(t * 9) * 0.35, 0, 0.5]; P.shR = [-2.4 + Math.cos(t * 9) * 0.35, 0, -0.5];
        P.elL = [-0.6, 0, 0]; P.elR = [-0.6, 0, 0];
      } else if (s.dance) {
        var bt = t * 4.2;
        P.hips = [0, Math.sin(bt * 0.5) * 0.3, Math.sin(bt) * 0.12];
        P.shL = [-1.2 + Math.sin(bt) * 0.6, 0, 0.45]; P.shR = [-1.2 + Math.sin(bt + Math.PI) * 0.6, 0, -0.45];
        P.elL = [-1.2, 0, 0]; P.elR = [-1.2, 0, 0];
        P.hipL = [-Math.max(0, Math.sin(bt)) * 0.4, 0, 0.05]; P.hipR = [-Math.max(0, -Math.sin(bt)) * 0.4, 0, -0.05];
        P.knL = [Math.max(0, Math.sin(bt)) * 0.7, 0, 0]; P.knR = [Math.max(0, -Math.sin(bt)) * 0.7, 0, 0];
        P.head = [Math.sin(bt * 2) * 0.12, 0, Math.sin(bt) * 0.1];
        hipsY = 0.93 + Math.abs(Math.sin(bt)) * 0.05;
      } else if (s.wave) {
        P.shR = [-2.6, 0, -0.5 + Math.sin(t * 9) * 0.35]; P.elR = [-0.5, 0, 0];
      } else if (s.talk) {
        P.shR = [-0.55 + Math.sin(t * 2.8) * 0.25, 0, -0.15]; P.elR = [-1.0 + Math.sin(t * 3.7) * 0.2, 0, 0];
        P.shL = [-0.2 + Math.sin(t * 2.1 + 1) * 0.15, 0, 0.12]; P.elL = [-0.6, 0, 0];
        P.head = [Math.sin(t * 2.3) * 0.06, Math.sin(t * 0.9) * 0.15, 0];
      } else if (s.punch > 0) {
        var pc = Math.sin(s.punch * Math.PI);
        P.shR = [-1.55 * pc - 0.2, 0, -0.1]; P.elR = [-1.6 * (1 - pc), 0, 0];
        P.shL = [-0.9, 0, 0.2]; P.elL = [-1.6, 0, 0];
        P.chest = [0, -0.35 * pc, 0];
      } else if (s.aim && (s.weapon === 'pistol')) {
        P.shR = [-Math.PI / 2 - pitch + (s.kick || 0) * 0.3, -0.05, -0.08]; P.elR = [0, 0, 0];
        P.shL = [-Math.PI / 2 - pitch + 0.12, 0, -0.55]; P.elL = [-0.35, 0, 0];
        P.chest = [-pitch * 0.35, 0.15, 0];
      } else if (s.aim && (s.weapon === 'rifle' || s.weapon === 'heavy')) {
        P.shR = [-Math.PI / 2 - pitch + 0.35 + (s.kick || 0) * 0.2, 0, -0.35]; P.elR = [-1.1, 0, 0];
        P.shL = [-Math.PI / 2 - pitch + 0.05, 0, -0.42]; P.elL = [-0.25, 0, 0];
        P.chest = [-pitch * 0.35, 0.3, 0];
      } else if (s.weapon === 'rifle' || s.weapon === 'heavy') {
        P.shR = [-0.5, 0, -0.2]; P.elR = [-1.3, 0, 0];
        P.shL = [-0.7, 0, -0.3]; P.elL = [-1.1, 0, 0];
      } else if (s.throwing > 0) {
        var tc = s.throwing;
        P.shR = [-2.8 + (1 - tc) * 2.4, 0, -0.2]; P.elR = [-0.6 * tc, 0, 0];
      } else if (s.phone) {
        P.shR = [-0.7, 0.2, -0.1]; P.elR = [-1.8, 0, 0]; P.head = [0.3, 0, 0];
      }
    }

    // Dempen naar de doelhouding
    var k = 1 - Math.exp(-dt * (s.dead ? 6 : 16));
    var cur = this.cur;
    for (i = 0; i < JOINTS.length; i++) {
      var jn = JOINTS[i];
      var bone = b[jn];
      var target = P[jn];
      var c = cur[jn] || (cur[jn] = [0, 0, 0]);
      c[0] += (target[0] - c[0]) * k;
      c[1] += (target[1] - c[1]) * k;
      c[2] += (target[2] - c[2]) * k;
      bone.rotation.set(c[0], c[1], c[2]);
    }
    b.hips.position.y += (hipsY - b.hips.position.y) * k;

    // Verende haarstaarten
    var accel = (s.accel || 0);
    for (i = 0; i < this.tails.length; i++) {
      var tl = this.tails[i];
      var tgt = 0.25 + sp * 0.08 + (1 - Math.abs(sn)) * 0.05 * (walkW + runW) + accel * 0.04;
      tl.v += (-(tl.a - tgt) * 70 - tl.v * 7) * dt;
      tl.a += tl.v * dt;
      var sideT = tl.side * (0.25 + Math.sin(t * 2 + i) * 0.05) + Math.sin(ph) * 0.12 * walkW;
      tl.bv += (-(tl.b - sideT) * 60 - tl.bv * 7) * dt;
      tl.b += tl.bv * dt;
      tl.g.rotation.set(-tl.a, 0, tl.b);
    }
  };

  // Hitpunten voor kogels (wereldcoördinaten)
  var hp = [];
  for (var h = 0; h < 5; h++) hp.push({ name: '', pos: new T.Vector3(), r: 0.1 });
  Character.prototype.hitParts = function () {
    var b = this.b, s = this.scale;
    this.root.updateMatrixWorld(true);
    b.head.getWorldPosition(hp[0].pos); hp[0].pos.y += 0.11 * s; hp[0].r = 0.14 * s; hp[0].name = 'hoofd';
    b.chest.getWorldPosition(hp[1].pos); hp[1].pos.y += 0.1 * s; hp[1].r = 0.22 * s; hp[1].name = 'borst';
    b.hips.getWorldPosition(hp[2].pos); hp[2].r = 0.19 * s; hp[2].name = 'heup';
    b.knL.getWorldPosition(hp[3].pos); hp[3].r = 0.12 * s; hp[3].name = 'been';
    b.knR.getWorldPosition(hp[4].pos); hp[4].r = 0.12 * s; hp[4].name = 'been';
    return hp;
  };

  // ---- Willekeurige uiterlijken -----------------------------------------------------
  G.randomLook = function (kind) {
    var fem = Math.random() < 0.5;
    var L = {
      build: fem ? 'v' : 'm',
      skin: U.pick(G.SKINS),
      hair: fem ? U.pick(['lang', 'paardenstaart', 'knot', 'kort', 'afro']) : U.pick(['kort', 'kort', 'buzz', 'afro', 'kaal', 'hanenkam']),
      hairColor: U.pick(G.HAIR_COLORS.slice(0, 7)),
      hat: Math.random() < 0.2 ? U.pick(['pet', 'muts', 'hoed']) : 'geen',
      hatColor: U.pick(G.COLORS),
      top: U.pick(fem ? ['tshirt', 'longsleeve', 'hoodie', 'jas', 'tanktop', 'jurk'] : ['tshirt', 'longsleeve', 'hoodie', 'jas', 'pak', 'tanktop']),
      topColor: U.pick(G.COLORS),
      pants: fem ? U.pick(['jeans', 'rok', 'short', 'chino', 'joggers']) : U.pick(['jeans', 'chino', 'short', 'joggers']),
      pantsColor: U.pick(['#2c4a7a', '#1f2a44', '#3e3e3e', '#6d5a45', '#c9b28c', '#5d6d4a', '#111111']),
      shoes: U.pick(['sneakers', 'sneakers', 'laarzen', 'nette']),
      shoesColor: U.pick(['#f5f5f5', '#111111', '#6d4c41', '#c62828', '#1e88e5']),
      glasses: Math.random() < 0.15 ? U.pick(['zonnebril', 'bril']) : 'geen',
      eyeColor: U.pick(['#3e2a1e', '#2e5a88', '#3c6e47', '#5a4632']),
      beard: !fem && Math.random() < 0.25,
      height: U.rand(0.93, 1.06) * (fem ? 0.95 : 1),
      backpack: Math.random() < 0.12 ? U.pick(G.COLORS) : null
    };
    if (kind === 'politie') {
      L.top = 'longsleeve'; L.topColor = '#1f3a73'; L.pants = 'chino'; L.pantsColor = '#1a2238';
      L.shoes = 'laarzen'; L.shoesColor = '#111111'; L.hat = 'politie'; L.police = true; L.glasses = 'geen'; L.backpack = null;
    } else if (kind === 'bende') {
      L.top = U.pick(['hoodie', 'jas', 'tanktop']); L.topColor = U.pick(['#b71c1c', '#212121', '#3e2723']);
      L.pants = U.pick(['jeans', 'joggers']); L.pantsColor = '#111111'; L.hat = U.pick(['muts', 'pet', 'geen']); L.hatColor = '#b71c1c';
      L.glasses = U.pick(['zonnebril', 'geen']); L.build = 'm'; L.hair = U.pick(['buzz', 'kaal', 'hanenkam', 'kort']); L.backpack = null;
    } else if (kind === 'beveiliging') {
      L.top = 'pak'; L.topColor = '#263238'; L.tieColor = '#111111'; L.pants = 'chino'; L.pantsColor = '#263238';
      L.shoes = 'nette'; L.shoesColor = '#111111'; L.glasses = 'zonnebril'; L.hat = 'geen'; L.backpack = null;
    } else if (kind === 'medewerker') {
      L.top = 'tshirt'; L.topColor = '#2e7d32'; L.hat = 'pet'; L.hatColor = '#2e7d32'; L.backpack = null;
    }
    return L;
  };

  // Stemkenmerken uit het uiterlijk afleiden (elke NPC klinkt net iets anders)
  G.voiceFor = function (look, seed) {
    var fem = look.build === 'v';
    var base = fem ? U.rand(190, 250) : U.rand(95, 145);
    return { pitch: base, rate: U.rand(6.5, 9), formant: fem ? U.rand(1.08, 1.2) : U.rand(0.88, 1.02), seed: seed || Math.random() * 10, vol: 0.7 };
  };
})();
