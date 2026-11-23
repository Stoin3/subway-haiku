/*
 * core.js - gedeelde basis voor HAVENSTAD: namespace, hulpfuncties, invoer, events en opslag.
 * Alle modules hangen aan window.G zodat ze ook via file:// zonder bundler werken.
 */
(function () {
  'use strict';

  var G = window.G = window.G || {};
  var T = G.T = window.THREE;
  G.A = window.THREE_ADDONS || {};

  // ---- Hulpfuncties ----------------------------------------------------------
  var U = G.U = {
    clamp: function (v, a, b) { return v < a ? a : (v > b ? b : v); },
    lerp: function (a, b, t) { return a + (b - a) * t; },
    // Frame-onafhankelijk naar een doel toe bewegen
    damp: function (cur, target, rate, dt) { return target + (cur - target) * Math.exp(-rate * dt); },
    rand: function (a, b) { return a + Math.random() * (b - a); },
    randInt: function (n) { return Math.floor(Math.random() * n); },
    pick: function (arr) { return arr[Math.floor(Math.random() * arr.length)]; },
    chance: function (p) { return Math.random() < p; },
    angDiff: function (a, b) {
      var d = (b - a) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      return d;
    },
    dist2: function (ax, az, bx, bz) {
      var dx = ax - bx, dz = az - bz;
      return Math.sqrt(dx * dx + dz * dz);
    },
    money: function (n) { return '€ ' + Math.round(n).toLocaleString('nl-NL'); },
    smooth: function (e0, e1, x) {
      var t = U.clamp((x - e0) / (e1 - e0), 0, 1);
      return t * t * (3 - 2 * t);
    },
    // Deterministische random generator (de stad ziet er elke keer hetzelfde uit)
    rng: function (seed) {
      var s = seed >>> 0;
      return function () {
        s = (s + 0x6D2B79F5) | 0;
        var t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },
    hex: function (c) { return new T.Color(c); }
  };

  // Gedeelde shader-uniforms (tijd, nacht, zon)
  G.uniforms = {
    uTime: { value: 0 },
    uNight: { value: 0 },
    uSunDir: { value: new T.Vector3(0.3, 0.8, 0.2).normalize() }
  };

  // ---- Event bus -------------------------------------------------------------
  var handlers = {};
  G.on = function (name, fn) { (handlers[name] = handlers[name] || []).push(fn); };
  G.emit = function (name, data) {
    var list = handlers[name];
    if (!list) return;
    for (var i = 0; i < list.length; i++) list[i](data);
  };

  // ---- Invoer ----------------------------------------------------------------
  var input = G.input = {
    keys: {},
    hits: {},
    mouse: { dx: 0, dy: 0, down: [false, false, false], clicks: [false, false, false], wheel: 0, x: 0, y: 0 },
    locked: false,
    canvas: null,
    expectUnlock: false
  };

  var GAME_KEYS = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'];

  input.hit = function (code) {
    if (input.hits[code]) { input.hits[code] = false; return true; }
    return false;
  };
  input.click = function (b) {
    if (input.mouse.clicks[b]) { input.mouse.clicks[b] = false; return true; }
    return false;
  };
  input.endFrame = function () {
    input.hits = {};
    input.mouse.clicks = [false, false, false];
    input.mouse.dx = 0;
    input.mouse.dy = 0;
    input.mouse.wheel = 0;
  };
  input.clearAll = function () {
    input.keys = {};
    input.hits = {};
    input.mouse.down = [false, false, false];
    input.endFrame();
  };
  input.lock = function () {
    if (input.canvas && !input.locked && input.canvas.requestPointerLock) {
      try {
        var p = input.canvas.requestPointerLock();
        if (p && p.catch) p.catch(function () { /* gebruiker weigerde */ });
      } catch (e) { /* negeren */ }
    }
  };
  input.unlock = function () {
    if (input.locked) {
      input.expectUnlock = true;
      document.exitPointerLock();
    }
  };

  input.attach = function (canvas) {
    input.canvas = canvas;
    window.addEventListener('keydown', function (e) {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (!e.repeat) input.hits[e.code] = true;
      input.keys[e.code] = true;
      if (GAME_KEYS.indexOf(e.code) >= 0 && G.playing) e.preventDefault();
      G.emit('key', e);
    });
    window.addEventListener('keyup', function (e) { input.keys[e.code] = false; });
    window.addEventListener('blur', function () { input.keys = {}; input.mouse.down = [false, false, false]; });
    canvas.addEventListener('mousedown', function (e) {
      if (G.wantsPointerLock && G.wantsPointerLock() && !input.locked) input.lock();
      input.mouse.down[e.button] = true;
      input.mouse.clicks[e.button] = true;
    });
    window.addEventListener('mouseup', function (e) { input.mouse.down[e.button] = false; });
    window.addEventListener('mousemove', function (e) {
      input.mouse.x = e.clientX;
      input.mouse.y = e.clientY;
      if (input.locked) {
        // Sommige browsers geven af en toe een enorme sprong door: afkappen
        input.mouse.dx += U.clamp(e.movementX || 0, -200, 200);
        input.mouse.dy += U.clamp(e.movementY || 0, -200, 200);
      }
    });
    canvas.addEventListener('wheel', function (e) {
      input.mouse.wheel += e.deltaY > 0 ? 1 : -1;
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    document.addEventListener('pointerlockchange', function () {
      input.locked = document.pointerLockElement === canvas;
      if (!input.locked) {
        if (!input.expectUnlock) G.emit('pointerlost');
        input.expectUnlock = false;
        input.mouse.down = [false, false, false];
      }
    });
  };

  // ---- Spelstatus en opslaan --------------------------------------------------
  var SAVE_KEY = 'havenstad.save.v1';
  var SETTINGS_KEY = 'havenstad.settings.v1';

  G.defaultOutfit = function () {
    return {
      skin: '#e0ac86', hair: 'kort', hairColor: '#2b1a10', hat: 'geen', hatColor: '#d32f2f',
      top: 'tshirt', topColor: '#f5f5f5', pants: 'jeans', pantsColor: '#2c4a7a',
      shoes: 'sneakers', shoesColor: '#ffffff', glasses: 'geen', build: 'm'
    };
  };

  G.newState = function () {
    return {
      version: 1,
      money: 2500,
      health: 100,
      armor: 0,
      pos: [50, 0.2, 86],
      heading: Math.PI,
      time: 9 * 60,            // minuten sinds middernacht
      day: 1,
      weapons: { fist: true },
      ammo: {},
      mags: {},
      weapon: 'fist',
      grenades: 0,
      outfit: G.defaultOutfit(),
      owned: { kort: true, tshirt: true, jeans: true, sneakers: true, geen: true },
      gf: null,
      missions: {},
      build: { blocks: [] },
      bankCooldownDay: 0,
      lastRentDay: 1,
      stats: { kills: 0, carsStolen: 0, robberies: 0, buildingsDestroyed: 0, distance: 0, missions: 0, spent: 0, earned: 0 }
    };
  };

  G.settings = { quality: 'normaal', volume: 0.8, music: 0.4, sens: 1, invertY: false };
  try {
    var rawS = window.localStorage.getItem(SETTINGS_KEY);
    if (rawS) {
      var s = JSON.parse(rawS);
      for (var k in s) if (Object.prototype.hasOwnProperty.call(G.settings, k)) G.settings[k] = s[k];
    }
  } catch (e) { /* standaard instellingen */ }

  G.saveSettings = function () {
    try { window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(G.settings)); } catch (e) { /* negeren */ }
  };

  G.state = G.newState();

  G.hasSave = function () {
    try { return !!window.localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
  };

  G.saveGame = function () {
    G.emit('save', G.state);   // modules schrijven hun gegevens in G.state
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(G.state));
      return true;
    } catch (e) { return false; }
  };

  G.loadGame = function () {
    try {
      var raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      var data = JSON.parse(raw);
      var base = G.newState();
      for (var key in base) {
        if (Object.prototype.hasOwnProperty.call(data, key)) base[key] = data[key];
      }
      // Ontbrekende velden van nieuwere versies aanvullen
      var dOut = G.defaultOutfit();
      for (var ok in dOut) if (!(ok in base.outfit)) base.outfit[ok] = dOut[ok];
      var dStats = G.newState().stats;
      for (var sk in dStats) if (!(sk in base.stats)) base.stats[sk] = dStats[sk];
      G.state = base;
      return true;
    } catch (e) { return false; }
  };

  // Geld met statistiek en een melding
  G.addMoney = function (n, reason) {
    G.state.money = Math.max(0, G.state.money + n);
    if (n > 0) G.state.stats.earned += n; else G.state.stats.spent -= n;
    G.emit('money', { amount: n, reason: reason });
  };
  G.spend = function (n, reason) {
    if (G.state.money < n) {
      G.emit('toast', { text: 'Niet genoeg geld (' + U.money(n) + ' nodig)', kind: 'bad' });
      if (G.audio) G.audio.sfx('error');
      return false;
    }
    G.addMoney(-n, reason);
    if (G.audio) G.audio.sfx('cash');
    return true;
  };

  // Spel-tijd als tekst
  G.clockText = function () {
    var t = Math.floor(G.state.time) % 1440;
    var h = Math.floor(t / 60), m = t % 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  };
})();
