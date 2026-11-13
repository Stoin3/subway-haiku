/*
 * game.js - spellogica, invoer, HUD, highscores en geluid voor Metro Rush 3D.
 *
 * Wereldcoordinaten: de speler staat op z = -traveled en rent naar -z.
 * Objecten staan vast in de wereld op z = -d (d = afstand vanaf de start).
 */
(function () {
  'use strict';

  var T = window.THREE;
  var M = window.MetroModels;

  function showFatal(msg) {
    var el = document.getElementById('fatal');
    if (el) {
      el.textContent = msg;
      el.classList.remove('hidden');
    }
  }

  if (!T || !M) {
    showFatal('Kon de 3D-bibliotheek niet laden. Controleer je internetverbinding en ververs de pagina.');
    return;
  }

  var LANE_X = M.LANE_X;
  var LIVERY_COUNT = M.LIVERY_COUNT;
  var HIT_PAD = 0.15;

  // ---- Instellingen ----------------------------------------------------------
  var CFG = {
    LANE_RATE: 14,          // hoe snel de speler naar een andere baan glijdt
    SPEED_START: 12,        // m/s
    SPEED_MAX: 36,          // m/s
    SPEED_ACCEL: 0.4,       // m/s extra per seconde
    GRAVITY: 28,
    JUMP_V: 10,             // beginsnelheid van de sprong (piek ~1.8 m)
    JUMP_BUFFER: 0.15,      // spring-invoer die net vóór de landing gedrukt wordt
    BARRIER_H: 0.95,        // hoogte van een barrière
    SPAWN_AHEAD: 190,       // hoe ver vooruit objecten worden gemaakt
    COIN_POINTS: 10,
    SCORE_KEY: 'metroRush3D.highscores',
    MUTE_KEY: 'metroRush3D.muted',
    MAX_SCORES: 10
  };

  // ---- Hulpfuncties ----------------------------------------------------------
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function randInt(n) { return Math.floor(Math.random() * n); }
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }
  function fmt(n) { return Math.round(n).toLocaleString('nl-NL'); }
  function $(id) { return document.getElementById(id); }

  // ---- DOM ------------------------------------------------------------------
  var els = {
    stage: $('stage'),
    flash: $('flash'),
    hud: $('hud'),
    hudScore: $('hud-score'),
    hudCoins: $('hud-coins'),
    hudDist: $('hud-dist'),
    hudSpeed: $('hud-speed'),
    hudBest: $('hud-best'),
    menu: $('menu'),
    pause: $('pause'),
    over: $('over'),
    menuBest: $('menu-best'),
    scoreList: $('score-list'),
    scoreEmpty: $('score-empty'),
    overScore: $('over-score'),
    overCoins: $('over-coins'),
    overDist: $('over-dist'),
    overReason: $('over-reason'),
    overBest: $('over-best'),
    overRecord: $('over-record')
  };

  // ---- Renderer, scène, camera ----------------------------------------------
  var renderer;
  try {
    renderer = new T.WebGLRenderer({ antialias: true });
  } catch (e) {
    showFatal('Je browser ondersteunt WebGL niet (of het staat uit). Zet hardwareversnelling aan en probeer opnieuw.');
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  els.stage.appendChild(renderer.domElement);

  var SKY = 0x9fd9ff;
  var scene = new T.Scene();
  scene.background = new T.Color(SKY);
  scene.fog = new T.Fog(SKY, 55, 190);

  var camera = new T.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 400);
  scene.add(new T.HemisphereLight(0xeaf6ff, 0x6d5f4e, 1.0));
  var sun = new T.DirectionalLight(0xfff4e0, 0.9);
  sun.position.set(5, 12, 8);
  scene.add(sun);

  var env = M.buildEnvironment();
  scene.add(env.group);

  var runner = M.buildRunner();
  scene.add(runner.root);

  var blob = M.buildBlob();
  scene.add(blob);

  var world = new T.Group();
  scene.add(world);

  // ---- Spelstatus -----------------------------------------------------------
  var state = 'menu';            // menu | play | pause | dead | over
  var traveled = 0;              // afgelegde afstand (m)
  var speed = CFG.SPEED_START;   // huidige snelheid (m/s)
  var elapsed = 0;               // speeltijd (s)
  var coins = 0;
  var lane = 1;
  var runnerX = LANE_X[1];
  var runnerY = 0;
  var runnerVY = 0;
  var onGround = true;
  var jumpBuf = 0;
  var laneVel = 0;
  var fallAmt = 0;
  var crashT = 0;
  var crashReason = '';
  var shake = 0;
  var spinT = 0;
  var runBest = 0;
  var lastRecord = false;

  var prevFree = [0, 1, 2];      // banen waar de speler na de vorige rij kan zijn
  var nextRowBase = 36;
  var rowsSpawned = 0;
  var nextSceneBase = 0;
  var items = [];

  var camBase = { x: 0, y: 3.5, z: 8.5 };

  // ---- Objecten maken --------------------------------------------------------
  function addItem(obj, kind, d0, d1, x, y) {
    world.add(obj);
    var it = { kind: kind, obj: obj, d0: d0, d1: d1, x: x || 0, y: y || 0, taken: false, phase: Math.random() * 6 };
    items.push(it);
    return it;
  }

  function spawnTrain(l, d0, cars, liv) {
    var obj = M.buildTrain(liv, cars);
    obj.position.set(LANE_X[l], 0, -d0);
    addItem(obj, 'train', d0, d0 + M.trainLength(cars), LANE_X[l]);
  }

  function spawnBarrier(l, d0) {
    var obj = M.buildBarrier();
    obj.position.set(LANE_X[l], 0, -d0);
    addItem(obj, 'barrier', d0, d0 + 1.0, LANE_X[l]);
  }

  function spawnCoin(l, d, y) {
    var obj = M.buildCoin();
    obj.position.set(LANE_X[l], y, -d);
    addItem(obj, 'coin', d, d, LANE_X[l], y);
  }

  function spawnCoinLine(l, d0, d1, y) {
    for (var d = d0; d <= d1 + 1e-6; d += 2) spawnCoin(l, d, y);
  }

  function spawnScenery(d) {
    var depth = 10 + Math.random() * 2;
    [-1, 1].forEach(function (side) {
      var w = 6 + Math.random() * 3;
      var h = 9 + Math.random() * 18;
      var color = M.BUILDING_COLORS[randInt(M.BUILDING_COLORS.length)];
      var b = M.buildBuilding(w, h, depth, color);
      b.position.set(side * (10.5 + w / 2 + Math.random() * 4), h / 2, -(d + depth / 2));
      addItem(b, 'scenery', d, d + depth, 0, 0);
    });
    if (Math.round(d / 14) % 2 === 0) {
      [-1, 1].forEach(function (side) {
        var lamp = M.buildLamp(side);
        lamp.position.set(side * 5.2, 0, -d);
        addItem(lamp, 'scenery', d, d + 0.1, 0, 0);
      });
    }
  }

  // ---- Rijen met obstakels en munten -----------------------------------------
  function pathOK(prev, next) {
    // Vanuit elke mogelijke vorige baan moet je met hooguit één baanwissel
    // op een vrije baan van de volgende rij kunnen komen.
    return prev.every(function (a) {
      return next.some(function (b) { return Math.abs(a - b) <= 1; });
    });
  }

  function subsets(n) {
    return n === 1 ? [[0], [1], [2]] : [[0, 1], [0, 2], [1, 2]];
  }

  function pickBlocked(n) {
    var cands = shuffle(subsets(n));
    for (var i = 0; i < cands.length; i++) {
      var cand = cands[i];
      var free = [0, 1, 2].filter(function (l) { return cand.indexOf(l) < 0; });
      if (pathOK(prevFree, free)) return cand;
    }
    return null;
  }

  // Maakt één rij aan op afstand `base` en geeft de startpositie van de volgende rij.
  function spawnRow(base) {
    var diff = Math.min(1, elapsed / 100);
    var all = [0, 1, 2];
    var rowEnd;
    var gap;

    // Eerste rij: rustige muntenlijn zodat je kunt wennen
    if (rowsSpawned === 0) {
      spawnCoinLine(1, base, base + 18, 0.9);
      prevFree = all.slice();
      rowsSpawned++;
      return base + 18 + 14;
    }
    rowsSpawned++;

    var r = Math.random();
    if (r < 0.5) {
      // Treinrij: één of twee banen geblokkeerd, altijd een pad
      var n = Math.random() < 0.2 + 0.4 * diff ? 2 : 1;
      var blocked = pickBlocked(n) || pickBlocked(1);
      var free = all.filter(function (l) { return blocked.indexOf(l) < 0; });
      var rowLen = 0;
      blocked.forEach(function (l) {
        var cars = 2 + randInt(3);                  // 2 tot 4 wagons
        spawnTrain(l, base, cars, randInt(LIVERY_COUNT));
        rowLen = Math.max(rowLen, M.trainLength(cars));
      });
      free.forEach(function (l) {
        if (Math.random() < 0.6) spawnCoinLine(l, base + 4, base + rowLen - 3, 0.9);
      });
      prevFree = free;
      rowEnd = base + rowLen;
      gap = 18 - 4 * diff + Math.random() * 5;      // 14 tot 23 m
    } else if (r < 0.75) {
      // Barrièrerij: spring over de barrière, of wissel van baan
      var nb = Math.random() < 0.25 + 0.35 * diff ? 2 : 1;
      var bl = shuffle(all).slice(0, nb);
      bl.forEach(function (l) { spawnBarrier(l, base); });
      if (Math.random() < 0.85) {
        // Munten in een boog boven de barrière (vereist springen)
        for (var c = 0; c < 6; c++) {
          spawnCoin(bl[0], base - 3 + c * 1.2, 0.9 + 1.5 * Math.sin(Math.PI * (c + 0.5) / 6));
        }
      }
      all.forEach(function (l) {
        if (bl.indexOf(l) < 0 && Math.random() < 0.5) spawnCoinLine(l, base + 3, base + 14, 0.9);
      });
      prevFree = all.slice();
      rowEnd = base + 1.0;
      gap = 32;                                      // genoeg ruimte om te landen
    } else {
      // Muntenrij: rechte lijn of zigzag (wisselen van baan)
      if (Math.random() < 0.5) {
        spawnCoinLine(randInt(3), base, base + 18, 0.9);
      } else {
        var a = randInt(3);
        var b = a === 1 ? (Math.random() < 0.5 ? 0 : 2) : 1;
        spawnCoinLine(a, base, base + 8, 0.9);
        spawnCoinLine(b, base + 10, base + 18, 0.9);
      }
      prevFree = all.slice();
      rowEnd = base + 18;
      gap = 14;
    }
    return rowEnd + gap;
  }

  function spawnAhead() {
    while (nextRowBase < traveled + CFG.SPAWN_AHEAD) {
      nextRowBase = spawnRow(nextRowBase);
    }
    while (nextSceneBase < traveled + CFG.SPAWN_AHEAD) {
      spawnScenery(nextSceneBase);
      nextSceneBase += 14;
    }
  }

  function cleanup() {
    for (var i = items.length - 1; i >= 0; i--) {
      var it = items[i];
      var limit = it.kind === 'scenery' ? 40 : 25;
      if (it.d1 < traveled - limit) {
        world.remove(it.obj);
        items.splice(i, 1);
      }
    }
  }

  function resetWorld() {
    items.forEach(function (it) { world.remove(it.obj); });
    items = [];
    traveled = 0;
    speed = CFG.SPEED_START;
    elapsed = 0;
    coins = 0;
    lane = 1;
    runnerX = LANE_X[1];
    runnerY = 0;
    runnerVY = 0;
    onGround = true;
    jumpBuf = 0;
    laneVel = 0;
    fallAmt = 0;
    crashT = 0;
    shake = 0;
    prevFree = [0, 1, 2];
    nextRowBase = 36;
    rowsSpawned = 0;
    nextSceneBase = 0;
    spawnAhead();
  }

  // ---- Highscores (localStorage, met geheugen als terugval) -------------------
  var memScores = [];

  function isValidScore(e) {
    return e && typeof e.s === 'number' && isFinite(e.s);
  }

  function loadScores() {
    try {
      var raw = window.localStorage.getItem(CFG.SCORE_KEY);
      if (raw) {
        var arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          return arr.filter(isValidScore).sort(function (a, b) { return b.s - a.s; }).slice(0, CFG.MAX_SCORES);
        }
      }
    } catch (e) { /* localStorage niet beschikbaar: gebruik geheugen */ }
    return memScores.slice();
  }

  function storeScores(list) {
    memScores = list.slice();
    try {
      window.localStorage.setItem(CFG.SCORE_KEY, JSON.stringify(list));
    } catch (e) { /* negeren */ }
  }

  function saveScore(entry) {
    var list = loadScores();
    list.push(entry);
    list.sort(function (a, b) { return b.s - a.s; });
    storeScores(list.slice(0, CFG.MAX_SCORES));
  }

  function bestScore() {
    var list = loadScores();
    return list.length ? list[0].s : 0;
  }

  function clearScores() {
    storeScores([]);
    renderScores();
  }

  function renderScores() {
    var list = loadScores();
    els.scoreList.innerHTML = '';
    list.slice(0, 5).forEach(function (e, i) {
      var li = document.createElement('li');
      var rank = document.createElement('span');
      rank.className = 'sc-rank';
      rank.textContent = '#' + (i + 1);
      var main = document.createElement('span');
      main.className = 'sc-main';
      main.textContent = fmt(e.s) + ' pt';
      var meta = document.createElement('span');
      meta.className = 'sc-meta';
      var when = e.t ? new Date(e.t).toLocaleDateString('nl-NL') : '';
      meta.textContent = (e.c || 0) + ' muntjes · ' + fmt(e.d || 0) + ' m · ' + when;
      li.appendChild(rank);
      li.appendChild(main);
      li.appendChild(meta);
      els.scoreList.appendChild(li);
    });
    els.scoreEmpty.classList.toggle('hidden', list.length > 0);
    els.menuBest.textContent = fmt(list.length ? list[0].s : 0);
  }

  // ---- Geluid (Web Audio, geen bestanden nodig) -------------------------------
  var sfx = (function () {
    var ctx = null;
    var muted = false;
    try { muted = window.localStorage.getItem(CFG.MUTE_KEY) === '1'; } catch (e) { muted = false; }

    function ac() {
      if (!ctx) {
        try {
          var AC = window.AudioContext || window.webkitAudioContext;
          if (AC) ctx = new AC();
        } catch (e) { ctx = null; }
      }
      if (ctx && ctx.state === 'suspended' && ctx.resume) ctx.resume();
      return ctx;
    }
    function tone(f1, f2, dur, type, vol) {
      if (muted) return;
      var c = ac();
      if (!c) return;
      var t0 = c.currentTime;
      var o = c.createOscillator();
      var g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f1, t0);
      o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g);
      g.connect(c.destination);
      o.start(t0);
      o.stop(t0 + dur + 0.05);
    }
    function noise(dur, vol) {
      if (muted) return;
      var c = ac();
      if (!c) return;
      var len = Math.floor(c.sampleRate * dur);
      var buf = c.createBuffer(1, len, c.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      var src = c.createBufferSource();
      var g = c.createGain();
      src.buffer = buf;
      g.gain.value = vol;
      src.connect(g);
      g.connect(c.destination);
      src.start();
    }
    var scale = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.5, 1568];

    return {
      unlock: function () { ac(); },
      coin: function (n) {
        var f = scale[(n - 1) % scale.length];
        tone(f, f * 1.5, 0.12, 'triangle', 0.25);
      },
      jump: function () { tone(260, 620, 0.16, 'square', 0.08); },
      crash: function () {
        noise(0.5, 0.5);
        tone(200, 40, 0.5, 'sawtooth', 0.25);
      },
      setMuted: function (m) {
        muted = m;
        try { window.localStorage.setItem(CFG.MUTE_KEY, m ? '1' : '0'); } catch (e) { /* negeren */ }
      },
      isMuted: function () { return muted; }
    };
  })();

  function refreshMuteButtons() {
    var label = sfx.isMuted() ? 'Geluid: uit' : 'Geluid: aan';
    $('btn-mute').textContent = sfx.isMuted() ? 'Geluid uit' : 'Geluid aan';
    $('btn-mute-menu').textContent = label;
  }

  function toggleMute() {
    sfx.setMuted(!sfx.isMuted());
    refreshMuteButtons();
  }

  // ---- Besturing -------------------------------------------------------------
  function doJump() {
    onGround = false;
    runnerVY = CFG.JUMP_V;
    jumpBuf = 0;
    sfx.jump();
  }

  function requestJump() {
    if (state !== 'play') return;
    if (onGround) doJump();
    else jumpBuf = CFG.JUMP_BUFFER;
  }

  function moveLane(dir) {
    if (state !== 'play') return;
    lane = clamp(lane + dir, 0, 2);
  }

  function slam() {
    if (state === 'play' && !onGround) runnerVY = -CFG.JUMP_V * 2.2;
  }

  // ---- Logica ----------------------------------------------------------------
  function updateRunner(dt) {
    var prevX = runnerX;
    runnerX += (LANE_X[lane] - runnerX) * (1 - Math.exp(-dt * CFG.LANE_RATE));
    laneVel = dt > 0 ? (runnerX - prevX) / dt : 0;

    if (!onGround) {
      runnerVY -= CFG.GRAVITY * dt;
      runnerY += runnerVY * dt;
      if (runnerY <= 0) {
        runnerY = 0;
        runnerVY = 0;
        onGround = true;
      }
    }
    if (state === 'play') {
      jumpBuf -= dt;
      if (onGround && jumpBuf > 0) doJump();
    }
  }

  function scoreNow() {
    return Math.floor(traveled) + coins * CFG.COIN_POINTS;
  }

  function crash(reason) {
    state = 'dead';
    crashReason = reason;
    crashT = 0;
    shake = 0.5;
    sfx.crash();
    els.flash.classList.remove('on');
    void els.flash.offsetWidth;   // herstart de animatie
    els.flash.classList.add('on');
  }

  function checkCollisions() {
    var t = traveled;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.kind === 'coin') {
        if (!it.taken &&
            Math.abs(it.d0 - t) < 0.9 &&
            Math.abs(it.x - runnerX) < 1.1 &&
            Math.abs(it.y - (runnerY + 0.95)) < 1.0) {
          it.taken = true;
          it.obj.visible = false;
          coins++;
          sfx.coin(coins);
        }
      } else if (it.kind === 'train') {
        // HIT_PAD: de zichtbare romp van de speler reikt ~0.15 m voor en achter zijn positie
        if (t > it.d0 - HIT_PAD && t < it.d1 + HIT_PAD && Math.abs(it.x - runnerX) < 1.35) {
          crash('Je liep tegen een trein aan');
          return;
        }
      } else if (it.kind === 'barrier') {
        if (t > it.d0 - HIT_PAD && t < it.d1 + HIT_PAD &&
            Math.abs(it.x - runnerX) < 1.1 && runnerY < CFG.BARRIER_H) {
          crash('Je struikelde over een barrière');
          return;
        }
      }
    }
  }

  function startGame() {
    sfx.unlock();
    resetWorld();
    runBest = bestScore();
    lastRecord = false;
    state = 'play';
    showOverlay(null);
    updateHud(true);
  }

  function goMenu() {
    state = 'menu';
    resetWorld();
    renderScores();
    showOverlay('menu');
  }

  function togglePause() {
    if (state === 'play') {
      state = 'pause';
      showOverlay('pause');
    } else if (state === 'pause') {
      state = 'play';
      showOverlay(null);
    }
  }

  function finishRun() {
    state = 'over';
    var s = scoreNow();
    var before = bestScore();
    lastRecord = s > 0 && s > before;
    saveScore({ s: s, c: coins, d: Math.floor(traveled), t: Date.now() });
    els.overScore.textContent = fmt(s);
    els.overCoins.textContent = String(coins);
    els.overDist.textContent = fmt(Math.floor(traveled)) + ' m';
    els.overReason.textContent = crashReason;
    els.overBest.textContent = fmt(Math.max(before, s));
    els.overRecord.classList.toggle('hidden', !lastRecord);
    showOverlay('over');
  }

  function showOverlay(name) {
    els.menu.classList.toggle('hidden', name !== 'menu');
    els.pause.classList.toggle('hidden', name !== 'pause');
    els.over.classList.toggle('hidden', name !== 'over');
    els.hud.classList.toggle('hidden', name === 'menu' || name === 'over');
  }

  var hudCache = {};
  function setText(el, key, val) {
    if (hudCache[key] !== val) {
      hudCache[key] = val;
      el.textContent = val;
    }
  }

  function updateHud(force) {
    if (force) hudCache = {};
    var s = scoreNow();
    setText(els.hudScore, 'score', fmt(s));
    setText(els.hudCoins, 'coins', String(coins));
    setText(els.hudDist, 'dist', fmt(Math.floor(traveled)) + ' m');
    setText(els.hudSpeed, 'speed', Math.round(speed * 3.6) + ' km/u');
    setText(els.hudBest, 'best', fmt(Math.max(runBest, s)));
  }

  function update(dt) {
    if (state === 'play') {
      elapsed += dt;
      speed = Math.min(CFG.SPEED_MAX, CFG.SPEED_START + CFG.SPEED_ACCEL * elapsed);
      traveled += speed * dt;
      updateRunner(dt);
      spawnAhead();
      checkCollisions();
      cleanup();
      updateHud(false);
    } else if (state === 'dead') {
      crashT += dt;
      speed *= Math.exp(-dt * 5);
      traveled += speed * dt;
      updateRunner(dt);
      fallAmt = Math.min(1, crashT / 0.45);
      shake = Math.max(0, shake - dt);
      if (crashT > 1.5) finishRun();
    }
  }

  // ---- Renderen --------------------------------------------------------------
  function render(dt) {
    var animDt = state === 'pause' ? 0 : dt;
    spinT += animDt;

    // Het wegdek volgt de speler; de dwarsliggers scrollen mee met de snelheid
    env.group.position.z = -traveled;
    env.bedTex.offset.y = traveled / 2.4;

    runner.root.position.set(runnerX, runnerY, -traveled);
    runner.update(animDt, {
      moving: state === 'play',
      airborne: !onGround,
      speed: speed,
      lean: laneVel,
      fall: fallAmt
    });

    blob.position.set(runnerX, 0.02, -traveled);
    var lift = Math.max(0, runnerY);
    blob.scale.setScalar(Math.max(0.4, 1 - lift * 0.25));
    blob.material.opacity = 0.28 * Math.max(0.3, 1 - lift * 0.3);

    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.kind === 'coin' && !it.taken) {
        it.obj.rotation.y = spinT * 4 + it.phase;
      }
    }

    // Camera: achter de speler, volgt de baan en schudt bij een botsing
    var k = 1 - Math.exp(-dt * 8);
    camBase.x += (runnerX * 0.45 - camBase.x) * k;
    camBase.y += ((3.5 + runnerY * 0.35) - camBase.y) * k;
    camBase.z = -traveled + 8.5;
    var sx = shake > 0 ? (Math.random() - 0.5) * shake * 0.8 : 0;
    var sy = shake > 0 ? (Math.random() - 0.5) * shake * 0.5 : 0;
    camera.position.set(camBase.x + sx, camBase.y + sy, camBase.z);
    camera.lookAt(runnerX * 0.5, 1.4 + runnerY * 0.3, -traveled - 9);

    renderer.render(scene, camera);
  }

  var last = performance.now();
  function frame(now) {
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    render(dt);
    window.requestAnimationFrame(frame);
  }

  // ---- Invoer: toetsenbord, muis en aanraken ----------------------------------
  window.addEventListener('keydown', function (e) {
    var k = e.code;
    if (k === 'ArrowLeft' || k === 'KeyA') {
      e.preventDefault();
      if (!e.repeat) moveLane(-1);
    } else if (k === 'ArrowRight' || k === 'KeyD') {
      e.preventDefault();
      if (!e.repeat) moveLane(1);
    } else if (k === 'ArrowUp' || k === 'KeyW') {
      e.preventDefault();
      if (!e.repeat) requestJump();
    } else if (k === 'ArrowDown' || k === 'KeyS') {
      e.preventDefault();
      slam();
    } else if (k === 'Space') {
      e.preventDefault();
      if (e.repeat) return;
      if (state === 'play') requestJump();
      else if (state === 'menu' || state === 'over') startGame();
    } else if (k === 'Enter') {
      if (state === 'menu' || state === 'over') startGame();
    } else if (k === 'KeyP' || k === 'Escape') {
      if (state === 'play' || state === 'pause') togglePause();
    } else if (k === 'KeyM') {
      toggleMute();
    }
  });

  var touch = null;
  window.addEventListener('pointerdown', function (e) {
    if (e.target && e.target.closest && e.target.closest('button')) return;
    touch = { x: e.clientX, y: e.clientY };
  });
  window.addEventListener('pointerup', function (e) {
    if (!touch) return;
    var dx = e.clientX - touch.x;
    var dy = e.clientY - touch.y;
    touch = null;
    if (state !== 'play') return;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) moveLane(dx < 0 ? -1 : 1);
    else if (dy < -40) requestJump();
    else if (dy > 40) slam();
    else if (Math.abs(dx) < 12 && Math.abs(dy) < 12) requestJump();
  });

  // Pauzeer automatisch als je het tabblad verlaat
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && state === 'play') togglePause();
  });
  window.addEventListener('blur', function () {
    if (state === 'play') togglePause();
  });

  window.addEventListener('resize', function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ---- Knoppen ---------------------------------------------------------------
  function bindButton(id, fn) {
    var b = $(id);
    if (!b) return;
    b.addEventListener('click', function () {
      b.blur();   // voorkomt dat Spatie later nogmaals op deze knop klikt
      fn();
    });
  }
  bindButton('btn-start', startGame);
  bindButton('btn-retry', startGame);
  bindButton('btn-menu-over', goMenu);
  bindButton('btn-menu-pause', goMenu);
  bindButton('btn-resume', togglePause);
  bindButton('btn-pause', togglePause);
  bindButton('btn-mute', toggleMute);
  bindButton('btn-mute-menu', toggleMute);
  bindButton('btn-clear', function () {
    if (window.confirm('Alle highscores wissen?')) clearScores();
  });

  // ---- Start -----------------------------------------------------------------
  resetWorld();
  renderScores();
  refreshMuteButtons();
  showOverlay('menu');
  window.requestAnimationFrame(frame);
})();
