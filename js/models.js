/*
 * models.js - procedurele 3D-modellen voor Metro Rush 3D.
 * Alles wordt met Three.js opgebouwd, er zijn geen externe modelbestanden nodig.
 * Eenheid: 1 unit ~ 1 meter (runner ~2 m, metrowagon ~4 m hoog).
 */
(function (global) {
  'use strict';

  var T = global.THREE;

  // ---- Constanten -----------------------------------------------------------
  var LANE_X = [-2.6, 0, 2.6];       // x-positie van de drie banen
  var CAR_LEN = 9;                   // lengte van een wagon (z)
  var CAR_GAP = 0.3;                 // ruimte tussen wagons (overgang)
  var CAR_W = 2.2;                   // breedte van een wagon
  var CAR_H = 2.2;                   // hoogte van de carrosserie (zonder dak)
  var BODY_Y = 0.6;                  // onderkant carrosserie
  var TOP_Y = BODY_Y + CAR_H;        // waar het ronde dak begint

  var ROOF_HEX = '#dfe6ea';
  var UNDER_HEX = '#37474f';
  var DARK_HEX = '#1c1c1c';
  var SKIN = '#f2c29b';
  var HAIR = '#4e2a12';
  var CAP = '#e53935';
  var JACKET = '#ff7a1a';
  var JEANS = '#2f4f8f';
  var PANTS = '#243a6e';

  var LIVERIES = [
    { color: '#e53935', accent: '#ffffff' },   // rood
    { color: '#1e88e5', accent: '#ffd54f' },   // blauw
    { color: '#43a047', accent: '#ffffff' },   // groen
    { color: '#fdd835', accent: '#263238' },   // geel
    { color: '#8e24aa', accent: '#ffffff' },   // paars
    { color: '#fb8c00', accent: '#263238' },   // oranje
    { color: '#00acc1', accent: '#ffffff' }    // turquoise
  ];

  var BUILDING_COLORS = ['#d7ccc8', '#b0bec5', '#ffe0b2', '#c5e1a5', '#f8bbd0', '#cfd8dc', '#ffccbc', '#e0c9a6'];

  // ---- Hulpfuncties ----------------------------------------------------------
  var geoCache = {};
  var matCache = {};

  function cachedGeo(key, make) {
    if (!geoCache[key]) geoCache[key] = make();
    return geoCache[key];
  }
  function boxGeo(w, h, d) {
    return cachedGeo('box_' + w + '_' + h + '_' + d, function () { return new T.BoxGeometry(w, h, d); });
  }
  function sph(r) {
    return cachedGeo('sph_' + r, function () { return new T.SphereGeometry(r, 14, 10); });
  }
  function lam(hex) {
    if (!matCache['L' + hex]) matCache['L' + hex] = new T.MeshLambertMaterial({ color: hex });
    return matCache['L' + hex];
  }
  function glow(hex) {
    if (!matCache['G' + hex]) matCache['G' + hex] = new T.MeshBasicMaterial({ color: hex });
    return matCache['G' + hex];
  }
  function mesh(geometry, material, x, y, z) {
    var m = new T.Mesh(geometry, material);
    m.position.set(x || 0, y || 0, z || 0);
    return m;
  }
  function canvasTexture(w, h, draw) {
    var c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d'), w, h);
    var tex = new T.CanvasTexture(c);
    tex.colorSpace = T.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }

  // ---- Metrowagons -----------------------------------------------------------
  // Zijkant: kleur, ramen, deuren en een "M"-logo.
  function drawSide(g, w, h, L) {
    g.fillStyle = L.color;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#cfd8dc';                        // dakrand
    g.fillRect(0, 0, w, h * 0.09);
    g.fillStyle = L.accent;                         // accentlijnen
    g.fillRect(0, h * 0.11, w, h * 0.035);
    g.fillRect(0, h * 0.67, w, h * 0.03);
    g.fillStyle = '#263238';                        // onderband
    g.fillRect(0, h * 0.93, w, h * 0.07);

    var cells = 10;
    var cw = w / cells;
    for (var k = 0; k < cells; k++) {
      var x0 = k * cw + cw * 0.08;
      var ww = cw * 0.84;
      if (k === 0 || k === 4 || k === 9) {          // deuren
        g.fillStyle = '#eceff1';
        g.fillRect(x0, h * 0.2, ww, h * 0.72);
        g.fillStyle = '#90a4ae';
        g.fillRect(x0 + ww / 2 - 2, h * 0.2, 4, h * 0.72);
      } else {                                      // ramen met glans
        var grd = g.createLinearGradient(0, h * 0.2, 0, h * 0.62);
        grd.addColorStop(0, '#4f7189');
        grd.addColorStop(1, '#14212c');
        g.fillStyle = grd;
        g.fillRect(x0, h * 0.2, ww, h * 0.42);
        g.fillStyle = 'rgba(255,255,255,0.22)';
        g.beginPath();
        g.moveTo(x0 + ww * 0.15, h * 0.62);
        g.lineTo(x0 + ww * 0.4, h * 0.2);
        g.lineTo(x0 + ww * 0.55, h * 0.2);
        g.lineTo(x0 + ww * 0.3, h * 0.62);
        g.closePath();
        g.fill();
      }
    }
    [0.22, 0.78].forEach(function (f) {
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(w * f, h * 0.8, h * 0.085, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = L.color;
      g.font = 'bold ' + Math.round(h * 0.11) + 'px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('M', w * f, h * 0.81);
    });
  }

  // Voorkant van de neuswagon: grote voorruit, koplampen, bumper.
  function drawFront(g, w, h, L) {
    g.fillStyle = L.color;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#cfd8dc';
    g.fillRect(0, 0, w, h * 0.1);
    g.fillStyle = L.accent;
    g.fillRect(0, h * 0.12, w, h * 0.035);
    g.fillStyle = '#1b1b1b';
    g.fillRect(w * 0.12, h * 0.2, w * 0.76, h * 0.5);
    var grd = g.createLinearGradient(0, h * 0.22, 0, h * 0.68);
    grd.addColorStop(0, '#6d8ea5');
    grd.addColorStop(1, '#0f1a22');
    g.fillStyle = grd;
    g.fillRect(w * 0.15, h * 0.23, w * 0.7, h * 0.46);
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.beginPath();
    g.moveTo(w * 0.2, h * 0.66);
    g.lineTo(w * 0.4, h * 0.24);
    g.lineTo(w * 0.5, h * 0.24);
    g.lineTo(w * 0.3, h * 0.66);
    g.closePath();
    g.fill();
    [0.25, 0.75].forEach(function (f) {
      g.fillStyle = '#fff9c4';
      g.beginPath();
      g.arc(w * f, h * 0.82, w * 0.07, 0, Math.PI * 2);
      g.fill();
    });
    g.fillStyle = '#212121';
    g.fillRect(0, h * 0.93, w, h * 0.07);
  }

  var liveryCache = [];
  function liveryMats(i) {
    if (!liveryCache[i]) {
      var L = LIVERIES[i];
      liveryCache[i] = {
        side: new T.MeshLambertMaterial({
          map: canvasTexture(1024, 320, function (g, w, h) { drawSide(g, w, h, L); })
        }),
        front: new T.MeshLambertMaterial({
          map: canvasTexture(512, 512, function (g, w, h) { drawFront(g, w, h, L); })
        })
      };
    }
    return liveryCache[i];
  }

  // Een wagon (origin in het midden). Neus naar +z (richting de speler) als isHead.
  var carTemplates = {};
  function carTemplate(liv, isHead) {
    var key = liv + (isHead ? 'h' : 'm');
    if (carTemplates[key]) return carTemplates[key];

    var lm = liveryMats(liv);
    var car = new T.Group();

    var body = new T.Mesh(boxGeo(CAR_W, CAR_H, CAR_LEN), [
      lm.side,                              // +x (rechterkant)
      lm.side,                              // -x (linkerkant)
      lam(ROOF_HEX),                        // boven (verborgen door dak)
      lam(UNDER_HEX),                       // onder
      isHead ? lm.front : lam(DARK_HEX),    // voor
      lam(DARK_HEX)                         // achter
    ]);
    body.position.y = BODY_Y + CAR_H / 2;
    car.add(body);

    // Ronde dak: halve cilinder langs de wagon
    var roofGeo = cachedGeo('roofHalf', function () {
      var g = new T.CylinderGeometry(CAR_W / 2, CAR_W / 2, CAR_LEN, 18, 1, false, Math.PI / 2, Math.PI);
      g.rotateX(Math.PI / 2);
      return g;
    });
    car.add(mesh(roofGeo, lam(ROOF_HEX), 0, TOP_Y, 0));

    // Airco-units op het dak
    car.add(mesh(boxGeo(1.3, 0.3, 2.4), lam('#b0bec5'), 0, TOP_Y + CAR_W / 2 + 0.15, 2.7));
    car.add(mesh(boxGeo(1.3, 0.3, 2.4), lam('#b0bec5'), 0, TOP_Y + CAR_W / 2 + 0.15, -2.7));

    // Stroomafnemer (pantograaf) op de neuswagon
    if (isHead) {
      car.add(mesh(boxGeo(0.08, 0.5, 0.08), lam('#263238'), -0.45, TOP_Y + CAR_W / 2 + 0.4, 0));
      car.add(mesh(boxGeo(0.08, 0.5, 0.08), lam('#263238'), 0.45, TOP_Y + CAR_W / 2 + 0.4, 0));
      car.add(mesh(boxGeo(1.2, 0.05, 0.08), lam('#263238'), 0, TOP_Y + CAR_W / 2 + 0.67, 0));
    }

    // Draaistellen met wielen
    [-2.7, 2.7].forEach(function (zc) {
      car.add(mesh(boxGeo(CAR_W * 0.8, 0.22, 1.9), lam(UNDER_HEX), 0, BODY_Y - 0.16, zc));
      [-0.72, 0.72].forEach(function (xc) {
        [-0.72, 0.72].forEach(function (dz) {
          var wheelGeo = cachedGeo('wheel', function () {
            var g = new T.CylinderGeometry(0.36, 0.36, 0.2, 14);
            g.rotateZ(Math.PI / 2);
            return g;
          });
          car.add(mesh(wheelGeo, lam('#101010'), xc, 0.52, zc + dz));
        });
      });
    });

    // Koplampen (gloeiend) op de neus
    if (isHead) {
      var glowGeo = cachedGeo('glowSph', function () { return new T.SphereGeometry(0.13, 10, 8); });
      [-0.55, 0.55].forEach(function (x) {
        car.add(mesh(glowGeo, glow('#fffde0'), x, 1.0, CAR_LEN / 2 + 0.04));
      });
    }

    carTemplates[key] = car;
    return car;
  }

  function trainLength(cars) {
    return cars * CAR_LEN + (cars - 1) * CAR_GAP;
  }

  // Trein: origin bij de neus (naar de speler toe), wagons lopen naar -z.
  function buildTrain(liv, cars) {
    var train = new T.Group();
    for (var i = 0; i < cars; i++) {
      var car = carTemplate(liv, i === 0).clone();
      car.position.z = -(i * (CAR_LEN + CAR_GAP) + CAR_LEN / 2);
      train.add(car);
      if (i < cars - 1) {
        var gz = -(i * (CAR_LEN + CAR_GAP) + CAR_LEN + CAR_GAP / 2);
        train.add(mesh(boxGeo(CAR_W * 0.7, 1.7, CAR_GAP + 0.2), lam(DARK_HEX), 0, BODY_Y + 0.85, gz));
      }
    }
    return train;
  }

  // ---- Obstakels en munten ----------------------------------------------------
  // Wegafzetting (barrière): moet je overspringen. Origin bij de voorkant, loopt naar -z.
  var barrierMat = null;
  function buildBarrier() {
    if (!barrierMat) {
      var tex = canvasTexture(256, 128, function (g, w, h) {
        g.fillStyle = '#ffffff';
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#e53935';
        for (var x = -h; x < w + h; x += 64) {
          g.beginPath();
          g.moveTo(x, h);
          g.lineTo(x + 32, h);
          g.lineTo(x + 32 + h, 0);
          g.lineTo(x + h, 0);
          g.closePath();
          g.fill();
        }
      });
      tex.wrapS = T.RepeatWrapping;
      tex.wrapT = T.RepeatWrapping;
      barrierMat = new T.MeshLambertMaterial({ map: tex });
    }
    var g = new T.Group();
    g.add(mesh(boxGeo(2.1, 0.95, 1.0), barrierMat, 0, 0.475, -0.5));
    g.add(mesh(boxGeo(2.2, 0.08, 1.1), lam('#424242'), 0, 0.04, -0.5));
    g.add(mesh(cachedGeo('lampSph', function () { return new T.SphereGeometry(0.12, 10, 8); }),
      glow('#ff9800'), 0, 1.06, -0.5));
    return g;
  }

  // Munt: gouden schijf die om zijn as draait. Het mesh zelf wordt geplaatst.
  var coinMat = null;
  function buildCoin() {
    if (!coinMat) {
      coinMat = new T.MeshPhongMaterial({
        color: '#ffc928',
        emissive: '#5a3d00',
        specular: '#fff6c8',
        shininess: 80
      });
    }
    var geo = cachedGeo('coin', function () {
      var g = new T.CylinderGeometry(0.42, 0.42, 0.12, 22);
      g.rotateX(Math.PI / 2);
      return g;
    });
    return new T.Mesh(geo, coinMat);
  }

  // ---- Omgeving --------------------------------------------------------------
  var windowTex = null;
  var wallMats = {};

  // Gebouw met uv's die meeschalen zodat ramen niet uitrekken.
  function buildBuilding(w, h, d, hex) {
    if (!windowTex) {
      windowTex = canvasTexture(256, 256, function (g, W, H) {
        g.fillStyle = '#f4f4f4';
        g.fillRect(0, 0, W, H);
        for (var r = 0; r < 4; r++) {
          for (var c = 0; c < 4; c++) {
            g.fillStyle = Math.random() < 0.18 ? '#ffe8a3' : '#3d5a6e';
            g.fillRect(c * 64 + 12, r * 64 + 14, 40, 36);
            g.fillStyle = '#d0d0d0';
            g.fillRect(c * 64 + 8, r * 64 + 50, 48, 4);
          }
        }
      });
      windowTex.wrapS = T.RepeatWrapping;
      windowTex.wrapT = T.RepeatWrapping;
    }
    if (!wallMats[hex]) {
      wallMats[hex] = new T.MeshLambertMaterial({ map: windowTex, color: hex });
    }
    var geom = new T.BoxGeometry(w, h, d);
    var uv = geom.attributes.uv;
    var idx = geom.index;
    var TILE = 6; // meter per textuur-tegel
    var faceSize = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    geom.groups.forEach(function (grp, gi) {
      var sx = faceSize[gi][0] / TILE;
      var sy = faceSize[gi][1] / TILE;
      for (var i = grp.start; i < grp.start + grp.count; i++) {
        var vi = idx.getX(i);
        uv.setXY(vi, uv.getX(vi) * sx, uv.getY(vi) * sy);
      }
    });
    return new T.Mesh(geom, wallMats[hex]);
  }

  // Lantaarnpaal. side = -1 (links) of 1 (rechts). Origin op de grond.
  function buildLamp(side) {
    var g = new T.Group();
    g.add(mesh(boxGeo(0.14, 5, 0.14), lam('#546e7a'), 0, 2.5, 0));
    g.add(mesh(boxGeo(1.4, 0.12, 0.14), lam('#546e7a'), -side * 0.7, 4.9, 0));
    g.add(mesh(boxGeo(0.34, 0.12, 0.5), glow('#fff3c4'), -side * 1.4, 4.8, 0));
    return g;
  }

  // Wegdek: ballast + dwarsliggers (scrollt via texture-offset) en stoep.
  function buildEnvironment() {
    var group = new T.Group();

    var bedTex = canvasTexture(256, 256, function (g, w, h) {
      g.fillStyle = '#5b554d';
      g.fillRect(0, 0, w, h);
      for (var i = 0; i < 700; i++) {
        g.fillStyle = Math.random() < 0.5 ? '#6f685e' : '#45413b';
        g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }
      for (var y = 0; y < h; y += 64) {
        g.fillStyle = '#6d4c41';
        g.fillRect(0, y + 18, w, 26);
        g.fillStyle = '#4e342e';
        g.fillRect(0, y + 18, w, 3);
        g.fillRect(0, y + 41, w, 3);
      }
    });
    bedTex.wrapS = T.RepeatWrapping;
    bedTex.wrapT = T.RepeatWrapping;
    bedTex.repeat.set(1, 600 / 2.4);

    var bed = new T.Mesh(new T.PlaneGeometry(9.6, 600), new T.MeshLambertMaterial({ map: bedTex }));
    bed.rotation.x = -Math.PI / 2;
    group.add(bed);

    var pave = new T.Mesh(new T.PlaneGeometry(160, 600), lam('#a7a196'));
    pave.rotation.x = -Math.PI / 2;
    pave.position.y = -0.02;
    group.add(pave);

    var railGeo = new T.BoxGeometry(0.12, 0.14, 600);
    LANE_X.forEach(function (x) {
      [-0.72, 0.72].forEach(function (dx) {
        group.add(mesh(railGeo, lam('#b0bec5'), x + dx, 0.07, 0));
      });
    });

    return { group: group, bedTex: bedTex };
  }

  function buildBlob() {
    var geo = cachedGeo('blob', function () {
      var g = new T.CircleGeometry(0.7, 24);
      g.rotateX(-Math.PI / 2);
      return g;
    });
    return new T.Mesh(geo, new T.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.28,
      depthWrite: false
    }));
  }

  // ---- De runner -------------------------------------------------------------
  // Opgebouwd uit gewrichten (heupen, romp, hoofd, armen, benen) zodat hij echt kan rennen,
  // springen, leunen en vallen.
  function buildRunner() {
    var model = new T.Group();

    var hips = new T.Group();
    hips.position.y = 1.0;
    model.add(hips);
    hips.add(mesh(boxGeo(0.5, 0.22, 0.3), lam(PANTS), 0, 0.05, 0));

    var torso = new T.Group();
    torso.position.y = 0.16;
    hips.add(torso);
    torso.add(mesh(boxGeo(0.52, 0.56, 0.3), lam(JACKET), 0, 0.28, 0));
    torso.add(mesh(boxGeo(0.42, 0.5, 0.2), lam('#1e88e5'), 0, 0.3, 0.25));      // rugzak
    torso.add(mesh(boxGeo(0.3, 0.12, 0.06), lam('#ffd54f'), 0, 0.42, 0.37));    // label

    var head = new T.Group();
    head.position.y = 0.6;
    torso.add(head);
    head.add(mesh(sph(0.25), lam(SKIN), 0, 0.27, 0));
    head.add(mesh(cachedGeo('hairTop', function () {
      return new T.SphereGeometry(0.262, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5);
    }), lam(HAIR), 0, 0.3, 0));
    head.add(mesh(sph(0.12), lam(HAIR), 0, 0.2, 0.26));                         // paardenstaart
    head.add(mesh(cachedGeo('capTop', function () {
      return new T.SphereGeometry(0.272, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5);
    }), lam(CAP), 0, 0.33, 0));
    head.add(mesh(boxGeo(0.34, 0.035, 0.2), lam(CAP), 0, 0.36, -0.2));           // klep
    head.add(mesh(sph(0.034), lam('#222222'), -0.09, 0.28, -0.235));
    head.add(mesh(sph(0.034), lam('#222222'), 0.09, 0.28, -0.235));

    function arm(side) {
      var shoulder = new T.Group();
      shoulder.position.set(side * 0.34, 0.5, 0);
      torso.add(shoulder);
      shoulder.add(mesh(boxGeo(0.16, 0.42, 0.16), lam(JACKET), 0, -0.21, 0));
      var elbow = new T.Group();
      elbow.position.set(0, -0.42, 0);
      shoulder.add(elbow);
      elbow.add(mesh(boxGeo(0.14, 0.38, 0.14), lam(JACKET), 0, -0.19, 0));
      elbow.add(mesh(sph(0.09), lam(SKIN), 0, -0.42, 0));
      return { shoulder: shoulder, elbow: elbow };
    }

    function leg(side) {
      var hip = new T.Group();
      hip.position.set(side * 0.13, 0, 0);
      hips.add(hip);
      hip.add(mesh(boxGeo(0.22, 0.5, 0.24), lam(JEANS), 0, -0.25, 0));
      var knee = new T.Group();
      knee.position.set(0, -0.5, 0);
      hip.add(knee);
      knee.add(mesh(boxGeo(0.2, 0.42, 0.22), lam(JEANS), 0, -0.21, 0));
      knee.add(mesh(boxGeo(0.24, 0.14, 0.36), lam('#f5f5f5'), 0, -0.49, -0.06));  // schoen
      knee.add(mesh(boxGeo(0.25, 0.04, 0.38), lam('#212121'), 0, -0.58, -0.06));  // zool
      return { hip: hip, knee: knee };
    }

    var armL = arm(-1), armR = arm(1);
    var legL = leg(-1), legR = leg(1);

    // Zet de voeten op de grond (y = 0)
    model.updateMatrixWorld(true);
    var bounds = new T.Box3().setFromObject(model);
    model.position.y = -bounds.min.y;

    var root = new T.Group();
    root.add(model);
    root.scale.setScalar(0.85);

    var phase = 0;
    var time = 0;
    var lean = 0;

    var J = {
      thL: legL.hip, knL: legL.knee, thR: legR.hip, knR: legR.knee,
      shL: armL.shoulder, elL: armL.elbow, shR: armR.shoulder, elR: armR.elbow,
      torso: torso
    };

    return {
      root: root,
      // s: { moving, airborne, speed, lean, fall }
      update: function (dt, s) {
        time += dt;
        var rate = s.moving ? 4 + s.speed * 0.35 : 0;
        phase += dt * rate;
        var amp = s.moving ? 1 : 0;
        var sn = Math.sin(phase);
        var t = {};

        if (s.airborne) {
          t.thL = 0.95; t.thR = 0.75;
          t.knL = -1.5; t.knR = -1.3;
          t.shL = 2.7; t.shR = 2.7;
          t.elL = 0.25; t.elR = 0.25;
          t.torso = -0.05;
        } else {
          t.thL = amp * sn * 0.85;
          t.thR = -amp * sn * 0.85;
          t.knL = -amp * Math.max(0, -sn) * 1.1;
          t.knR = -amp * Math.max(0, sn) * 1.1;
          t.shL = -amp * sn * 0.7 + (1 - amp) * 0.08;
          t.shR = amp * sn * 0.7 + (1 - amp) * 0.08;
          t.elL = amp * 1.0 + (1 - amp) * 0.15;
          t.elR = t.elL;
          t.torso = amp ? -0.1 : 0.02 * Math.sin(time * 2);
        }

        var k = 1 - Math.exp(-dt * 18);
        Object.keys(t).forEach(function (key) {
          var j = J[key];
          j.rotation.x += (t[key] - j.rotation.x) * k;
        });

        // Heen-en-weer beweging van de heupen en licht ademhalen in de menu
        hips.position.y = 1.0 + (amp && !s.airborne ? Math.abs(sn) * 0.035 : 0.01 * Math.sin(time * 2.5));

        // Leunen in de bocht van een baanwissel en vallen na een botsing
        var targetLean = Math.max(-0.2, Math.min(0.2, -s.lean * 0.006));
        lean += (targetLean - lean) * k;
        root.rotation.z = lean;
        root.rotation.x = (s.fall || 0) * Math.PI / 2;
      }
    };
  }

  // ---- Export ----------------------------------------------------------------
  global.MetroModels = {
    LANE_X: LANE_X,
    LIVERY_COUNT: LIVERIES.length,
    BUILDING_COLORS: BUILDING_COLORS,
    trainLength: trainLength,
    buildTrain: buildTrain,
    buildBarrier: buildBarrier,
    buildCoin: buildCoin,
    buildBuilding: buildBuilding,
    buildLamp: buildLamp,
    buildEnvironment: buildEnvironment,
    buildBlob: buildBlob,
    buildRunner: buildRunner
  };
})(window);
