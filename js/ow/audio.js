/*
 * audio.js - alle geluiden worden live gesynthetiseerd met de Web Audio API.
 * Geen samples: wapens, explosies, motoren, sirenes, NPC-stemmen (formant-synthese),
 * omgeving en twee generatieve radiozenders.
 */
(function () {
  'use strict';

  var G = window.G, U = G.U;
  var A = G.audio = { ready: false };
  var ctx = null, master, comp, sfxBus, musicBus, revIn, noiseBuf;

  function makeImpulse(dur, decay) {
    var len = Math.floor(ctx.sampleRate * dur);
    var buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (var ch = 0; ch < 2; ch++) {
      var d = buf.getChannelData(ch);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  A.init = function () {
    if (ctx) {
      if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
      return;
    }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { ctx = new AC(); } catch (e) { return; }
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;
    master = ctx.createGain();
    master.gain.value = G.settings.volume;
    comp.connect(master);
    master.connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.connect(comp);
    musicBus = ctx.createGain();
    musicBus.gain.value = G.settings.music * 0.6;
    musicBus.connect(comp);

    var conv = ctx.createConvolver();
    conv.buffer = makeImpulse(2.4, 2.6);
    revIn = ctx.createGain();
    var revOut = ctx.createGain();
    revOut.gain.value = 0.3;
    revIn.connect(conv);
    conv.connect(revOut);
    revOut.connect(comp);

    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    var nd = noiseBuf.getChannelData(0);
    for (var i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    A.ctx = ctx;
    A.ready = true;
    startAmbience();
  };

  A.setVolume = function (v) { if (master) master.gain.value = v; };
  A.setMusic = function (v) { if (musicBus) musicBus.gain.value = v * 0.6; };

  function setPos(node, v) {
    if (node.positionX) {
      node.positionX.value = v.x;
      node.positionY.value = v.y;
      node.positionZ.value = v.z;
    } else if (node.setPosition) {
      node.setPosition(v.x, v.y, v.z);
    }
  }

  var fwd = null;
  A.update = function (camera) {
    if (!ctx) return;
    var L = ctx.listener;
    if (!fwd) fwd = new G.T.Vector3();
    camera.getWorldDirection(fwd);
    if (L.positionX) {
      L.positionX.value = camera.position.x;
      L.positionY.value = camera.position.y;
      L.positionZ.value = camera.position.z;
      L.forwardX.value = fwd.x;
      L.forwardY.value = fwd.y;
      L.forwardZ.value = fwd.z;
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else if (L.setPosition) {
      L.setPosition(camera.position.x, camera.position.y, camera.position.z);
      L.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0);
    }
    radioUpdate();
  };

  // Uitgang met optionele 3D-positie en galm
  function out(pos, vol, o) {
    o = o || {};
    var g = ctx.createGain();
    g.gain.value = vol;
    var dest = o.music ? musicBus : sfxBus;
    var tail = g;
    if (pos) {
      var p = ctx.createPanner();
      p.panningModel = 'equalpower';
      p.distanceModel = 'inverse';
      p.refDistance = o.ref || 8;
      p.maxDistance = 1000;
      p.rolloffFactor = o.roll || 1.1;
      setPos(p, pos);
      g.connect(p);
      tail = p;
      g.panner = p;
    }
    tail.connect(dest);
    var rev = o.rev === undefined ? 0.3 : o.rev;
    if (rev > 0) {
      var s = ctx.createGain();
      s.gain.value = rev;
      tail.connect(s);
      s.connect(revIn);
    }
    return g;
  }

  function noise(t, dur, dest, type, f0, f1, q, vol, atk) {
    var src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    var f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    f.Q.value = q || 0.7;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + (atk || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  function tone(t, dur, dest, type, f0, f1, vol, atk) {
    var o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + (atk || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // ---- Effecten ------------------------------------------------------------
  var SFX = {
    pistol: { o: { ref: 14, rev: 0.5 }, f: function (t, d) {
      noise(t, 0.012, d, 'highpass', 5000, 0, 0.7, 0.9, 0.001);
      noise(t, 0.22, d, 'bandpass', 1800, 500, 0.8, 1.2, 0.002);
      tone(t, 0.14, d, 'sine', 140, 40, 0.9, 0.002);
    } },
    smg: { o: { ref: 12, rev: 0.4 }, f: function (t, d) {
      noise(t, 0.01, d, 'highpass', 6000, 0, 0.7, 0.6, 0.001);
      noise(t, 0.12, d, 'bandpass', 2400, 800, 0.9, 0.9, 0.002);
      tone(t, 0.08, d, 'sine', 160, 60, 0.5, 0.002);
    } },
    rifle: { o: { ref: 18, rev: 0.55 }, f: function (t, d) {
      noise(t, 0.02, d, 'highpass', 3500, 0, 0.7, 1.2, 0.001);
      noise(t, 0.28, d, 'lowpass', 2600, 300, 0.8, 1.1, 0.002);
      tone(t, 0.16, d, 'sine', 120, 35, 0.9, 0.002);
    } },
    shotgun: { o: { ref: 18, rev: 0.6 }, f: function (t, d) {
      noise(t, 0.03, d, 'highpass', 2500, 0, 0.7, 1.0, 0.001);
      noise(t, 0.5, d, 'lowpass', 1400, 120, 0.8, 1.5, 0.003);
      tone(t, 0.3, d, 'sine', 90, 30, 1.0, 0.003);
    } },
    sniper: { o: { ref: 30, rev: 0.9 }, f: function (t, d) {
      noise(t, 0.03, d, 'highpass', 3000, 0, 0.7, 1.5, 0.001);
      noise(t, 1.1, d, 'lowpass', 2000, 120, 0.7, 1.2, 0.002);
      tone(t, 0.35, d, 'sine', 100, 28, 1.0, 0.002);
    } },
    rpg: { o: { ref: 16, rev: 0.4 }, f: function (t, d) {
      noise(t, 0.9, d, 'bandpass', 600, 2400, 1.5, 0.9, 0.02);
      tone(t, 0.2, d, 'sine', 80, 40, 0.8, 0.003);
    } },
    explosion: { o: { ref: 30, rev: 0.9, roll: 0.8 }, f: function (t, d, o) {
      var s = o.size || 1;
      noise(t, 2.6 * s, d, 'lowpass', 1600, 90, 0.7, 2.0, 0.004);
      tone(t, 1.6 * s, d, 'sine', 70, 22, 1.6, 0.004);
      noise(t, 0.08, d, 'highpass', 2000, 0, 0.7, 1.2, 0.001);
      for (var i = 0; i < 14; i++) {
        noise(t + 0.15 + Math.random() * 1.4, 0.05, d, 'bandpass', 900 + Math.random() * 2500, 0, 2, 0.35, 0.002);
      }
    } },
    punch: { o: { ref: 4, rev: 0.1 }, f: function (t, d) {
      noise(t, 0.09, d, 'lowpass', 600, 200, 0.7, 1.2, 0.002);
      tone(t, 0.08, d, 'sine', 110, 50, 0.9, 0.002);
    } },
    hit: { o: { ref: 4, rev: 0.1 }, f: function (t, d) {
      noise(t, 0.07, d, 'lowpass', 900, 300, 0.7, 0.6, 0.002);
    } },
    ricochet: { o: { ref: 6, rev: 0.3 }, f: function (t, d) {
      tone(t, 0.25, d, 'sine', 3200 + Math.random() * 1500, 1200, 0.15, 0.002);
      noise(t, 0.04, d, 'highpass', 4000, 0, 0.7, 0.3, 0.001);
    } },
    step: { o: { ref: 3, rev: 0 }, f: function (t, d, o) {
      var f = (o.surface === 'gras' ? 500 : 900) * U.rand(0.85, 1.15);
      noise(t, 0.06, d, 'bandpass', f, f * 0.6, 1.2, o.loud || 0.25, 0.003);
    } },
    cash: { o: { rev: 0.1 }, f: function (t, d) {
      tone(t, 0.25, d, 'square', 1567, 1567, 0.08, 0.002);
      tone(t + 0.07, 0.5, d, 'triangle', 2093, 2093, 0.25, 0.002);
      for (var i = 0; i < 5; i++) tone(t + 0.02 * i, 0.06, d, 'sine', 3000 + Math.random() * 2000, 0, 0.06, 0.001);
    } },
    click: { o: { rev: 0 }, f: function (t, d) { tone(t, 0.04, d, 'square', 1200, 900, 0.08, 0.001); } },
    error: { o: { rev: 0 }, f: function (t, d) {
      tone(t, 0.12, d, 'square', 300, 300, 0.1, 0.002);
      tone(t + 0.13, 0.18, d, 'square', 220, 220, 0.1, 0.002);
    } },
    pickup: { o: { rev: 0.1 }, f: function (t, d) {
      [880, 1108, 1318, 1760].forEach(function (f, i) { tone(t + i * 0.05, 0.15, d, 'triangle', f, f, 0.2, 0.002); });
    } },
    glass: { o: { ref: 6, rev: 0.3 }, f: function (t, d) {
      noise(t, 0.4, d, 'highpass', 3500, 0, 0.7, 0.6, 0.002);
      for (var i = 0; i < 10; i++) tone(t + Math.random() * 0.35, 0.12, d, 'sine', 3000 + Math.random() * 4000, 0, 0.1, 0.001);
    } },
    crash: { o: { ref: 10, rev: 0.35 }, f: function (t, d, o) {
      var v = U.clamp(o.force || 1, 0.3, 2);
      noise(t, 0.5, d, 'lowpass', 1500, 200, 0.7, 1.0 * v, 0.002);
      tone(t, 0.4, d, 'triangle', 190, 120, 0.4 * v, 0.002);
      tone(t, 0.3, d, 'triangle', 263, 200, 0.3 * v, 0.002);
      if (v > 1.1) SFX.glass.f(t + 0.02, d);
    } },
    horn: { o: { ref: 12, rev: 0.2 }, f: function (t, d, o) {
      var dur = o.dur || 0.5;
      [392, 494].forEach(function (f) {
        var osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.value = f;
        var lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 1600;
        var g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
        g.gain.setValueAtTime(0.18, t + dur);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
        osc.connect(lp); lp.connect(g); g.connect(d);
        osc.start(t); osc.stop(t + dur + 0.1);
      });
    } },
    reload: { o: { ref: 3, rev: 0 }, f: function (t, d) {
      noise(t, 0.04, d, 'bandpass', 2500, 0, 3, 0.5, 0.001);
      noise(t + 0.35, 0.05, d, 'bandpass', 1800, 0, 3, 0.6, 0.001);
      tone(t + 0.36, 0.05, d, 'square', 600, 400, 0.08, 0.001);
    } },
    empty: { o: { ref: 3, rev: 0 }, f: function (t, d) { noise(t, 0.03, d, 'bandpass', 3000, 0, 4, 0.4, 0.001); } },
    throw: { o: { ref: 4, rev: 0 }, f: function (t, d) { noise(t, 0.25, d, 'bandpass', 500, 1500, 1.2, 0.4, 0.05); } },
    bounce: { o: { ref: 5, rev: 0.1 }, f: function (t, d) { tone(t, 0.06, d, 'triangle', 700, 300, 0.25, 0.001); } },
    collapse: { o: { ref: 40, rev: 0.9, roll: 0.6 }, f: function (t, d) {
      noise(t, 4.5, d, 'lowpass', 400, 60, 0.7, 1.6, 0.3);
      tone(t, 3.5, d, 'sine', 45, 25, 1.2, 0.4);
      for (var i = 0; i < 25; i++) noise(t + Math.random() * 3.5, 0.08, d, 'bandpass', 300 + Math.random() * 1500, 0, 2, 0.4, 0.003);
    } },
    build: { o: { ref: 6, rev: 0.15 }, f: function (t, d) {
      tone(t, 0.12, d, 'sine', 180, 90, 0.6, 0.002);
      noise(t, 0.06, d, 'lowpass', 1200, 300, 0.7, 0.5, 0.002);
    } },
    notify: { o: { rev: 0.2 }, f: function (t, d) {
      tone(t, 0.3, d, 'sine', 1318, 1318, 0.18, 0.004);
      tone(t + 0.12, 0.45, d, 'sine', 1760, 1760, 0.18, 0.004);
    } },
    phone: { o: { rev: 0.1 }, f: function (t, d) {
      for (var i = 0; i < 6; i++) {
        tone(t + i * 0.12, 0.1, d, 'sine', i % 2 ? 1150 : 950, 0, 0.2, 0.004);
      }
    } },
    heal: { o: { rev: 0.3 }, f: function (t, d) {
      [523, 659, 784, 1046].forEach(function (f, i) { tone(t + i * 0.08, 0.4, d, 'sine', f, f, 0.15, 0.01); });
    } },
    door: { o: { ref: 5, rev: 0.2 }, f: function (t, d) {
      noise(t, 0.18, d, 'bandpass', 500, 250, 2, 0.4, 0.01);
      tone(t + 0.15, 0.1, d, 'sine', 120, 70, 0.4, 0.002);
    } },
    mission: { o: { rev: 0.4 }, f: function (t, d) {
      [523, 659, 784, 1046, 1318].forEach(function (f, i) { tone(t + i * 0.11, 0.5, d, 'triangle', f, f, 0.22, 0.004); });
      tone(t + 0.55, 1.2, d, 'sawtooth', 1046, 1046, 0.05, 0.02);
    } },
    fail: { o: { rev: 0.4 }, f: function (t, d) {
      [392, 349, 311, 262].forEach(function (f, i) { tone(t + i * 0.18, 0.5, d, 'triangle', f, f * 0.98, 0.22, 0.004); });
    } },
    heart: { o: { rev: 0.4 }, f: function (t, d) {
      [1046, 1318, 1568, 2093].forEach(function (f, i) { tone(t + i * 0.06, 0.35, d, 'sine', f, f, 0.12, 0.004); });
    } },
    splash: { o: { ref: 8, rev: 0.2 }, f: function (t, d) {
      noise(t, 0.7, d, 'lowpass', 2500, 300, 0.7, 0.9, 0.01);
    } },
    wanted: { o: { rev: 0.2 }, f: function (t, d) {
      tone(t, 0.18, d, 'square', 880, 880, 0.08, 0.002);
      tone(t + 0.2, 0.18, d, 'square', 660, 660, 0.08, 0.002);
    } },
    swoosh: { o: { rev: 0 }, f: function (t, d) { noise(t, 0.3, d, 'bandpass', 400, 2400, 1.5, 0.3, 0.08); } },
    alarm: { o: { ref: 20, rev: 0.5 }, f: function (t, d) {
      for (var i = 0; i < 8; i++) tone(t + i * 0.25, 0.22, d, 'square', 1250, 1250, 0.15, 0.003);
    } }
  };

  A.sfx = function (name, pos, o) {
    if (!ctx || !SFX[name]) return;
    if (pos && G.cam && G.cam.position.distanceTo(pos) > 450) return;
    var spec = SFX[name];
    var d = out(pos, (o && o.vol) || 1, spec.o);
    spec.f(ctx.currentTime + 0.005, d, o || {});
  };

  // ---- Stemmen: formant-synthese ("simlish"-achtig brabbelen, eigen ontwerp) -------
  var VOW = [[800, 1200], [500, 1900], [300, 2300], [500, 900], [320, 800], [620, 1500], [700, 1750]];

  A.voice = function (v, text, pos) {
    if (!ctx || !text) return 0;
    if (pos && G.cam && G.cam.position.distanceTo(pos) > 60) return 0;
    var n = U.clamp(Math.round(text.length / 3.4), 2, 18);
    var rate = v.rate || 7.5;
    var syl = 1 / rate;
    var t = ctx.currentTime + 0.02;
    var dur = n * syl;
    var d = out(pos, v.vol || 0.7, { ref: 4, rev: 0.12 });
    var src = ctx.createOscillator();
    src.type = 'sawtooth';
    var f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.Q.value = 5;
    var f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.Q.value = 7;
    var g1 = ctx.createGain(); g1.gain.value = 2.4;
    var g2 = ctx.createGain(); g2.gain.value = 1.5;
    var env = ctx.createGain(); env.gain.value = 0.0001;
    src.connect(f1); src.connect(f2);
    f1.connect(g1); f2.connect(g2);
    g1.connect(env); g2.connect(env);
    env.connect(d);
    var question = /\?\s*$/.test(text);
    var excl = /!\s*$/.test(text);
    var fs = v.formant || 1;
    var seed = (v.seed || 1) * 7.13;
    for (var i = 0; i < n; i++) {
      var ts = t + i * syl;
      var vw = VOW[Math.floor(Math.random() * VOW.length)];
      f1.frequency.setValueAtTime(vw[0] * fs, ts);
      f2.frequency.setValueAtTime(vw[1] * fs, ts);
      var prog = i / Math.max(1, n - 1);
      var pitch = v.pitch * (1 + 0.1 * Math.sin(i * 1.7 + seed) + (Math.random() - 0.5) * 0.08);
      if (question && prog > 0.65) pitch *= 1 + (prog - 0.65) * 1.3;
      else if (prog > 0.75) pitch *= 1 - (prog - 0.75) * 0.5;
      if (excl) pitch *= 1.18;
      src.frequency.setTargetAtTime(pitch, ts, 0.02);
      env.gain.setTargetAtTime(0.9, ts + 0.004, 0.012);
      env.gain.setTargetAtTime(0.0001, ts + syl * 0.6, 0.02);
      if (Math.random() < 0.55) noise(ts, 0.04, d, 'highpass', 3600 * fs, 0, 0.8, 0.16, 0.003);
    }
    src.start(t);
    src.stop(t + dur + 0.25);
    return dur;
  };

  A.scream = function (pos, pitch) {
    if (!ctx) return;
    if (pos && G.cam && G.cam.position.distanceTo(pos) > 80) return;
    var t = ctx.currentTime + 0.01;
    var d = out(pos, 0.5, { ref: 6, rev: 0.3 });
    var o = ctx.createOscillator();
    o.type = 'sawtooth';
    var p = (pitch || 200) * 2.2;
    o.frequency.setValueAtTime(p, t);
    o.frequency.linearRampToValueAtTime(p * 1.35, t + 0.2);
    o.frequency.linearRampToValueAtTime(p * 0.85, t + 0.9);
    var lfo = ctx.createOscillator();
    lfo.frequency.value = 7;
    var lg = ctx.createGain();
    lg.gain.value = p * 0.04;
    lfo.connect(lg); lg.connect(o.frequency);
    var f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 950; f1.Q.value = 4;
    var f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1500; f2.Q.value = 5;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(1.4, t + 0.05);
    g.gain.setValueAtTime(1.4, t + 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
    o.connect(f1); o.connect(f2); f1.connect(g); f2.connect(g); g.connect(d);
    o.start(t); lfo.start(t);
    o.stop(t + 1.05); lfo.stop(t + 1.05);
  };

  A.laugh = function (v, pos) {
    if (!ctx) return;
    var t = ctx.currentTime + 0.01;
    var d = out(pos, 0.5, { ref: 4, rev: 0.15 });
    for (var i = 0; i < 4; i++) {
      var ts = t + i * 0.16;
      noise(ts, 0.05, d, 'bandpass', 1500, 0, 1, 0.2, 0.003);
      var o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(v.pitch * (1.25 - i * 0.06), ts);
      var f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 850 * (v.formant || 1); f.Q.value = 4;
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, ts);
      g.gain.exponentialRampToValueAtTime(1.2, ts + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ts + 0.13);
      o.connect(f); f.connect(g); g.connect(d);
      o.start(ts); o.stop(ts + 0.15);
    }
  };

  // ---- Doorlopende geluiden (motor, rotor, sirene, vuur) ---------------------
  function dummy() { return { set: function () {}, setPos: function () {}, stop: function () {} }; }

  A.loop = function (kind, pos) {
    if (!ctx) return dummy();
    var now = ctx.currentTime;
    var g = ctx.createGain();
    g.gain.value = 0.0001;
    var dest = out(pos, 1, { ref: kind === 'siren' ? 18 : 8, rev: kind === 'siren' ? 0.4 : 0.1 });
    g.connect(dest);
    var nodes = [];
    var h = { kind: kind, alive: true };

    if (kind === 'engine') {
      var o1 = ctx.createOscillator(); o1.type = 'sawtooth';
      var o2 = ctx.createOscillator(); o2.type = 'square';
      var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2;
      var nz = ctx.createBufferSource(); nz.buffer = noiseBuf; nz.loop = true;
      var nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 400;
      var ng = ctx.createGain(); ng.gain.value = 0.15;
      var og = ctx.createGain(); og.gain.value = 0.35;
      o1.connect(og); o2.connect(og); og.connect(lp); lp.connect(g);
      nz.connect(nf); nf.connect(ng); ng.connect(g);
      o1.start(); o2.start(); nz.start();
      nodes.push(o1, o2, nz);
      h.set = function (p) {
        var rpm = U.clamp(p.rpm, 0, 1.2), load = U.clamp(p.load, 0, 1);
        var f = (p.base || 38) + rpm * (p.range || 110);
        var t = ctx.currentTime;
        o1.frequency.setTargetAtTime(f, t, 0.05);
        o2.frequency.setTargetAtTime(f * 0.5, t, 0.05);
        lp.frequency.setTargetAtTime(300 + rpm * 1600 + load * 600, t, 0.05);
        g.gain.setTargetAtTime((p.vol || 0.32) * (0.45 + load * 0.55), t, 0.08);
      };
    } else if (kind === 'heli') {
      var src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
      var bp = ctx.createBiquadFilter(); bp.type = 'lowpass'; bp.frequency.value = 500;
      var chop = ctx.createGain(); chop.gain.value = 0;
      var lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 14;
      var lfoG = ctx.createGain(); lfoG.gain.value = 0.5;
      var bias = ctx.createConstantSource ? ctx.createConstantSource() : null;
      lfo.connect(lfoG); lfoG.connect(chop.gain);
      if (bias) { bias.offset.value = 0.5; bias.connect(chop.gain); bias.start(); nodes.push(bias); }
      var whine = ctx.createOscillator(); whine.type = 'sine'; whine.frequency.value = 1300;
      var wg = ctx.createGain(); wg.gain.value = 0.02;
      src.connect(bp); bp.connect(chop); chop.connect(g);
      whine.connect(wg); wg.connect(g);
      src.start(); lfo.start(); whine.start();
      nodes.push(src, lfo, whine);
      h.set = function (p) {
        var t = ctx.currentTime;
        var r = U.clamp(p.rotor, 0, 1);
        lfo.frequency.setTargetAtTime(4 + r * 13, t, 0.1);
        whine.frequency.setTargetAtTime(600 + r * 900, t, 0.1);
        g.gain.setTargetAtTime((p.vol || 0.9) * r, t, 0.1);
      };
    } else if (kind === 'siren') {
      var so = ctx.createOscillator(); so.type = 'triangle';
      var sl = ctx.createOscillator(); sl.type = 'sine'; sl.frequency.value = 0.35;
      var slg = ctx.createGain(); slg.gain.value = 380;
      so.frequency.value = 1000;
      sl.connect(slg); slg.connect(so.frequency);
      var sf = ctx.createBiquadFilter(); sf.type = 'lowpass'; sf.frequency.value = 2500;
      so.connect(sf); sf.connect(g);
      so.start(); sl.start();
      nodes.push(so, sl);
      h.set = function (p) {
        g.gain.setTargetAtTime(p.on ? 0.22 : 0.0001, ctx.currentTime, 0.1);
        sl.frequency.setTargetAtTime(p.yelp ? 3.5 : 0.35, ctx.currentTime, 0.1);
      };
    } else if (kind === 'fire') {
      var fs = ctx.createBufferSource(); fs.buffer = noiseBuf; fs.loop = true;
      var ff = ctx.createBiquadFilter(); ff.type = 'bandpass'; ff.frequency.value = 700; ff.Q.value = 0.5;
      fs.connect(ff); ff.connect(g);
      fs.start();
      nodes.push(fs);
      h.set = function (p) { g.gain.setTargetAtTime(0.25 * (p.level || 1), ctx.currentTime, 0.2); };
    } else {
      h.set = function () {};
    }

    h.setPos = function (v) { if (dest.panner) setPos(dest.panner, v); };
    h.stop = function () {
      if (!h.alive) return;
      h.alive = false;
      var t = ctx.currentTime;
      g.gain.setTargetAtTime(0.0001, t, 0.08);
      nodes.forEach(function (n) { try { n.stop(t + 0.4); } catch (e) { /* al gestopt */ } });
    };
    h.set({ rpm: 0, load: 0, rotor: 0, on: false, level: 0 });
    return h;
  };

  // ---- Omgeving -------------------------------------------------------------
  var amb = null;
  function startAmbience() {
    var src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220;
    var g = ctx.createGain(); g.gain.value = 0.05;
    src.connect(lp); lp.connect(g); g.connect(sfxBus);
    var src2 = ctx.createBufferSource(); src2.buffer = noiseBuf; src2.loop = true;
    var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 500; bp.Q.value = 0.6;
    var g2 = ctx.createGain(); g2.gain.value = 0.015;
    src2.connect(bp); bp.connect(g2); g2.connect(sfxBus);
    var wl = ctx.createOscillator(); wl.frequency.value = 0.07;
    var wlg = ctx.createGain(); wlg.gain.value = 0.012;
    wl.connect(wlg); wlg.connect(g2.gain);
    src.start(); src2.start(); wl.start();
    var sea = ctx.createBufferSource(); sea.buffer = noiseBuf; sea.loop = true;
    var sl = ctx.createBiquadFilter(); sl.type = 'lowpass'; sl.frequency.value = 600;
    var sg = ctx.createGain(); sg.gain.value = 0;
    sea.connect(sl); sl.connect(sg); sg.connect(sfxBus); sea.start();
    amb = { hum: g, wind: g2, sea: sg, next: 0 };
  }

  // Vogels overdag, krekels 's nachts, meeuwen bij het water
  A.ambient = function (dt, night, nearWater, height) {
    if (!ctx || !amb) return;
    var t = ctx.currentTime;
    amb.hum.gain.setTargetAtTime(0.05 * (1 - Math.min(1, height / 120)), t, 0.5);
    amb.wind.gain.setTargetAtTime(0.015 + Math.min(0.08, height / 1500), t, 0.5);
    amb.sea.gain.setTargetAtTime(nearWater * 0.12, t, 0.5);
    if (t < amb.next) return;
    amb.next = t + U.rand(0.8, 3.5);
    var d = out(null, 1, { rev: 0.2 });
    if (night > 0.5) {
      for (var i = 0; i < 6; i++) tone(t + i * 0.06, 0.04, d, 'sine', 4200, 4200, 0.02, 0.003);
    } else if (nearWater > 0.3 && Math.random() < 0.5) {
      tone(t, 0.35, d, 'sawtooth', 1400, 900, 0.03, 0.02);
      tone(t + 0.4, 0.3, d, 'sawtooth', 1500, 1000, 0.025, 0.02);
    } else {
      var base = U.rand(2500, 4200);
      var n = U.randInt(4) + 2;
      for (var j = 0; j < n; j++) tone(t + j * 0.09, 0.07, d, 'sine', base * U.rand(0.9, 1.25), base * U.rand(0.8, 1.3), 0.025, 0.004);
    }
  };

  // ---- Generatieve radio ------------------------------------------------------
  var STATIONS = [
    { name: 'Haven FM · lofi', bpm: 80, style: 'lofi',
      prog: [[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 59], [55, 59, 62, 65]] },
    { name: 'Neon 101 · synthwave', bpm: 104, style: 'synth',
      prog: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]] },
    { name: 'Dijkbeat · house', bpm: 122, style: 'house',
      prog: [[50, 53, 57, 60], [55, 58, 62, 65], [48, 52, 55, 59], [53, 57, 60, 64]] }
  ];
  var radio = { on: false, station: 0, next: 0, step: 0 };
  A.stations = STATIONS;

  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  function kick(t, d) {
    var o = ctx.createOscillator();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g); g.connect(d); o.start(t); o.stop(t + 0.32);
  }

  function chord(t, dur, notes, d, style) {
    notes.forEach(function (m) {
      [-4, 4].forEach(function (det) {
        var o = ctx.createOscillator();
        o.type = style === 'lofi' ? 'triangle' : 'sawtooth';
        o.frequency.value = mtof(m);
        o.detune.value = det;
        var lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(style === 'lofi' ? 900 : 2200, t);
        lp.frequency.exponentialRampToValueAtTime(style === 'lofi' ? 500 : 700, t + dur);
        var g = ctx.createGain();
        var v = style === 'lofi' ? 0.05 : 0.025;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(v, t + (style === 'house' ? 0.01 : 0.15));
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(lp); lp.connect(g); g.connect(d);
        o.start(t); o.stop(t + dur + 0.05);
      });
    });
  }

  function scheduleStep(t) {
    var st = STATIONS[radio.station];
    var d = out(null, 1, { music: true, rev: 0.15 });
    var step = radio.step % 16;
    var bar = Math.floor(radio.step / 16);
    var notes = st.prog[bar % st.prog.length];
    var beat = 60 / st.bpm;
    if (st.style === 'lofi') {
      if (step === 0 || step === 10) kick(t, d);
      if (step === 4 || step === 12) noise(t, 0.18, d, 'bandpass', 1800, 900, 0.8, 0.18, 0.003);
      if (step % 2 === 0) noise(t + (step % 4 === 2 ? 0.03 : 0), 0.04, d, 'highpass', 7000, 0, 0.7, 0.05, 0.002);
      if (step === 0) chord(t, beat * 4, notes, d, 'lofi');
      if (step === 0 || step === 8) tone(t, beat * 1.8, d, 'sine', mtof(notes[0] - 24), 0, 0.22, 0.01);
      if ((step === 6 || step === 14 || step === 3) && Math.random() < 0.6) {
        var pent = [0, 3, 5, 7, 10, 12];
        tone(t, beat * 0.9, d, 'triangle', mtof(notes[0] + 12 + U.pick(pent)), 0, 0.06, 0.01);
      }
    } else if (st.style === 'synth') {
      if (step % 4 === 0) kick(t, d);
      if (step === 4 || step === 12) noise(t, 0.22, d, 'bandpass', 2000, 1000, 0.7, 0.25, 0.002);
      noise(t, 0.03, d, 'highpass', 8000, 0, 0.7, 0.03, 0.002);
      if (step === 0) chord(t, beat * 4, notes, d, 'synth');
      if (step % 2 === 0) tone(t, beat * 0.45, d, 'sawtooth', mtof(notes[0] - 24), 0, 0.08, 0.005);
      tone(t, beat * 0.22, d, 'square', mtof(notes[step % notes.length] + 12), 0, 0.025, 0.003);
    } else {
      if (step % 4 === 0) kick(t, d);
      if (step % 4 === 2) noise(t, 0.08, d, 'highpass', 6000, 0, 0.7, 0.12, 0.002);
      if (step === 4 || step === 12) noise(t, 0.12, d, 'bandpass', 1500, 0, 1, 0.15, 0.002);
      if (step % 4 === 2) chord(t, beat * 0.4, notes, d, 'house');
      if (step % 4 === 3) tone(t, beat * 0.3, d, 'sine', mtof(notes[0] - 24), 0, 0.25, 0.005);
    }
  }

  function radioUpdate() {
    if (!radio.on || !ctx) return;
    var st = STATIONS[radio.station];
    var sixteenth = 60 / st.bpm / 4;
    if (radio.next < ctx.currentTime) radio.next = ctx.currentTime + 0.05;
    while (radio.next < ctx.currentTime + 0.2) {
      scheduleStep(radio.next);
      radio.next += sixteenth;
      radio.step++;
    }
  }

  A.radioOn = function (idx) {
    if (!ctx) return;
    if (idx !== undefined) radio.station = idx;
    radio.on = true;
    radio.step = 0;
    radio.next = ctx.currentTime + 0.1;
    G.emit('radio', STATIONS[radio.station].name);
  };
  A.radioOff = function () { radio.on = false; };
  A.radioNext = function () {
    if (!radio.on) { A.radioOn(0); return; }
    if (radio.station === STATIONS.length - 1) { radio.on = false; G.emit('radio', 'Radio uit'); return; }
    A.radioOn(radio.station + 1);
  };
  A.radioState = function () { return radio; };
})();
