/*
 * ui.js - HUD, minimap, kaart, telefoon, winkels (kleding met live preview, wapens,
 * cadeaus), dialogen, meldingen, titelscherm, pauzemenu en instellingen.
 */
(function () {
  'use strict';

  var G = window.G, T = G.T, U = G.U;
  var UI = G.ui = { modal: null };
  var root, els = {};

  function h(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // ---- Opbouw -------------------------------------------------------------------------
  UI.init = function () {
    root = document.getElementById('ui');
    root.innerHTML = [
      '<div id="hud" class="hidden">',
      '  <div class="hud-tr">',
      '    <div class="clock"><span id="h-day"></span> · <span id="h-clock"></span></div>',
      '    <div class="money" id="h-money"></div>',
      '    <div class="wanted" id="h-wanted"></div>',
      '    <div class="weapon"><div id="h-wname"></div><div id="h-ammo"></div></div>',
      '  </div>',
      '  <div class="hud-bl">',
      '    <canvas id="minimap" width="220" height="220"></canvas>',
      '    <div class="bars"><div class="bar hp"><i id="h-hp"></i></div><div class="bar ar"><i id="h-ar"></i></div></div>',
      '  </div>',
      '  <div class="hud-br" id="h-vehicle"></div>',
      '  <div id="toasts"></div>',
      '  <div id="objective"></div>',
      '  <div id="subtitle"></div>',
      '  <div id="prompt"></div>',
      '  <div id="progress" class="hidden"><span id="p-label"></span><div><i id="p-bar"></i></div></div>',
      '  <div id="crosshair"></div>',
      '  <div id="scope" class="hidden"></div>',
      '  <div id="hurt"></div>',
      '  <div id="buildpanel" class="hidden"></div>',
      '</div>',
      '<div id="cine" class="hidden"><i></i><i></i></div>',
      '<div id="bigmsg" class="hidden"><h1></h1><p></p></div>',
      '<div id="modal" class="hidden"></div>',
      '<div id="mapview" class="hidden"><canvas id="bigmap"></canvas><div class="map-legend" id="maplegend"></div><div class="map-hint">Klik om een route te zetten · M of Esc om te sluiten</div></div>',
      '<div id="title"></div>'
    ].join('\n');
    ['h-day', 'h-clock', 'h-money', 'h-wanted', 'h-wname', 'h-ammo', 'h-hp', 'h-ar', 'h-vehicle', 'toasts', 'objective', 'subtitle', 'prompt', 'progress', 'p-label', 'p-bar', 'crosshair', 'scope', 'hurt', 'buildpanel', 'cine', 'bigmsg', 'modal', 'mapview', 'bigmap', 'title', 'hud', 'minimap', 'maplegend'].forEach(function (id) { els[id] = document.getElementById(id); });
    els.mm = els.minimap.getContext('2d');
    setupEvents();
    els.bigmap.addEventListener('click', onMapClick);
  };

  // ---- Meldingen ----------------------------------------------------------------------
  UI.toast = function (text, kind) {
    var t = h('div', 'toast ' + (kind || ''), esc(text));
    els.toasts.appendChild(t);
    setTimeout(function () { t.classList.add('out'); }, 4200);
    setTimeout(function () { t.remove(); }, 4800);
    while (els.toasts.children.length > 5) els.toasts.firstChild.remove();
  };

  var subT = 0;
  UI.subtitle = function (who, text, dur, color) {
    els.subtitle.innerHTML = (who ? '<b style="color:' + (color || '#ffd54f') + '">' + esc(who) + ':</b> ' : '') + esc(text);
    els.subtitle.classList.add('show');
    subT = dur || 3;
  };

  UI.bigMessage = function (title, sub, color, dur) {
    els.bigmsg.querySelector('h1').textContent = title;
    els.bigmsg.querySelector('h1').style.color = color || '#fff';
    els.bigmsg.querySelector('p').textContent = sub || '';
    els.bigmsg.classList.remove('hidden');
    clearTimeout(UI._bigT);
    UI._bigT = setTimeout(function () { els.bigmsg.classList.add('hidden'); }, (dur || 4) * 1000);
  };

  function setupEvents() {
    G.on('toast', function (e) { UI.toast(e.text, e.kind); });
    G.on('subtitle', function (e) { UI.subtitle(e.who, e.text, e.dur, e.color); });
    G.on('money', function (e) {
      if (!e.amount) return;
      var el = els['h-money'];
      el.classList.remove('flash-up', 'flash-down');
      void el.offsetWidth;
      el.classList.add(e.amount > 0 ? 'flash-up' : 'flash-down');
      if (Math.abs(e.amount) >= 20) UI.toast((e.amount > 0 ? '+ ' : '− ') + U.money(Math.abs(e.amount)) + (e.reason ? '  ·  ' + e.reason : ''), e.amount > 0 ? 'good' : '');
    });
    G.on('wanted', function (e) { if (e.reason) UI.toast((e.level ? '★ ' : '') + e.reason, e.level ? 'bad' : 'good'); });
    G.on('missionStart', function (d) { UI.bigMessage(d.title, 'Missie gestart', d.color, 3); });
    G.on('missionComplete', function (e) { UI.bigMessage('MISSIE GESLAAGD', e.def.title + (e.reward ? '  ·  + ' + U.money(e.reward) : ''), '#ffd54f', 4.5); });
    G.on('missionFailed', function (e) { UI.bigMessage('MISSIE MISLUKT', e.reason || '', '#ff5252', 4); });
    G.on('phoneMessage', function (m) { UI.toast('📱 ' + m.from + ': ' + m.text, 'love'); });
    G.on('radio', function (name) { UI.toast('📻 ' + name); });
    G.on('progress', function (p) {
      if (!p) { els.progress.classList.add('hidden'); return; }
      els.progress.classList.remove('hidden');
      els['p-label'].textContent = p.label;
      els['p-bar'].style.width = Math.round(U.clamp(p.value, 0, 1) * 100) + '%';
    });
    G.on('waypoint', function (w) { G.waypoint = w; UI.toast('📍 Route gezet: ' + (w.label || 'bestemming')); });
    G.on('cinematic', function (c) { els.cine.classList.toggle('hidden', !c.on); });
    G.on('buildMode', function (on) { els.buildpanel.classList.toggle('hidden', !on); });
  }

  // ---- HUD-update ------------------------------------------------------------------------
  var hudT = 0;
  UI.update = function (dt) {
    var p = G.player;
    if (!p) return;
    subT -= dt;
    if (subT <= 0) els.subtitle.classList.remove('show');
    hudT -= dt;
    if (hudT <= 0) {
      hudT = 0.1;
      els['h-day'].textContent = 'Dag ' + G.state.day;
      els['h-clock'].textContent = G.clockText();
      els['h-money'].textContent = U.money(G.state.money);
      var lvl = G.npc.wanted.level;
      var stars = '';
      var blink = lvl && G.time - G.npc.wanted.lastSeen > 3 && Math.floor(G.time * 3) % 2;
      for (var i = 0; i < 5; i++) stars += '<span class="' + (i < lvl ? (blink ? 'on blink' : 'on') : '') + '">★</span>';
      els['h-wanted'].innerHTML = stars;
      var w = G.WEAPONS[G.state.weapon];
      els['h-wname'].textContent = w ? w.name : '';
      var ammoTxt = '';
      if (w && !w.melee) {
        if (w.throw) ammoTxt = G.state.grenades + ' st.';
        else ammoTxt = (G.state.mags[G.state.weapon] || 0) + ' / ' + (G.state.ammo[G.state.weapon] || 0);
        if (p.reloading > 0) ammoTxt = 'Herladen…';
      }
      els['h-ammo'].textContent = ammoTxt;
      els['h-hp'].style.width = Math.max(0, p.health / p.maxHealth * 100) + '%';
      els['h-ar'].style.width = Math.max(0, p.armor) + '%';
      els['h-ar'].parentNode.style.opacity = p.armor > 0 ? 1 : 0.25;
      // voertuig
      var v = p.vehicle;
      if (v) {
        var spd = Math.round(v.speed() * 3.6);
        var rs = G.audio.radioState();
        els['h-vehicle'].innerHTML = '<div class="vname">' + esc(v.spec.name) + '</div><div class="speed">' + spd + '<small> km/u</small></div>' +
          (v.isHeli ? '<div class="alt">Hoogte ' + Math.round(v.pos.y) + ' m</div>' : '') +
          '<div class="vhp"><i style="width:' + Math.max(0, v.health / v.maxHealth * 100) + '%"></i></div>' +
          (rs.on ? '<div class="radio">📻 ' + esc(G.audio.stations[rs.station].name) + '</div>' : '');
        els['h-vehicle'].style.display = 'block';
      } else els['h-vehicle'].style.display = 'none';
      // missie
      var m = G.missions.active;
      if (m) {
        els.objective.innerHTML = '<b style="color:' + m.def.color + '">' + esc(m.def.title) + '</b><br>' + esc(m.objText) +
          (m.timerText !== null && m.timerText !== undefined ? ' <span class="timer">' + fmtTime(m.timerText) + '</span>' : '');
        els.objective.style.display = 'block';
      } else if (G.npc.wanted.level) {
        var need = 10 + G.npc.wanted.level * 5;
        var ev = G.time - G.npc.wanted.lastSeen;
        els.objective.innerHTML = ev > 3 ? 'Uit het zicht… nog ' + Math.max(0, Math.ceil(need - ev)) + 's' : 'Ontsnap aan de politie!';
        els.objective.style.display = 'block';
      } else els.objective.style.display = 'none';
      if (G.build.active) renderBuildPanel();
    }
    // vizier
    var aiming = p.aiming && !p.vehicle;
    var wd = G.WEAPONS[G.state.weapon];
    els.crosshair.className = aiming ? (wd && wd.scope && p.scoped ? 'hidden' : 'on') : (G.build.active ? 'on build' : '');
    els.scope.classList.toggle('hidden', !(aiming && wd && wd.scope && p.scoped));
    els.hurt.style.opacity = Math.max(0, (p.hurtFlash || 0));
    drawMinimap();
  };

  function fmtTime(s) {
    s = Math.max(0, Math.ceil(s));
    return Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2);
  }

  UI.prompt = function (text) {
    if (text) { els.prompt.innerHTML = text; els.prompt.classList.add('show'); }
    else els.prompt.classList.remove('show');
  };

  function renderBuildPanel() {
    var B = G.build;
    var html = '<div class="bp-title">⚒ Bouwmodus <small>(B = stoppen)</small></div><div class="bp-mats">';
    B.MATS.forEach(function (m, i) {
      html += '<div class="bp-mat' + (i === B.mat ? ' sel' : '') + '"><span style="background:' + m.color + '"></span>' + (i + 1) + '. ' + m.name + '<small>' + U.money(m.price) + ' · sterkte ' + m.strength + '</small></div>';
    });
    html += '</div><div class="bp-info">Linkermuis: plaatsen · Rechtermuis: weghalen (50% terug) · Scroll/1-6: materiaal<br>Blokken: ' + B.count() + ' · Waarde: ' + U.money(B.value()) + ' · Huur/dag: ' + U.money(Math.round(B.value() * 0.04)) + '</div>';
    els.buildpanel.innerHTML = html;
  }

  // ---- Minimap -------------------------------------------------------------------------------
  var DCOL = { centrum: '#3d4752', midden: '#46504f', woon: '#3f5a3a', haven: '#4a4a46', park: '#3c6b35', special: '#4d4a5a' };

  function drawMinimap() {
    var c = els.mm, S = 220, R = 108;
    var p = G.player.pos;
    var yaw = G.camCtl ? G.camCtl.yaw : 0;
    var sc = 0.62;
    c.save();
    c.clearRect(0, 0, S, S);
    c.beginPath(); c.arc(S / 2, S / 2, R, 0, Math.PI * 2); c.clip();
    c.fillStyle = '#26333a';
    c.fillRect(0, 0, S, S);
    c.translate(S / 2, S / 2);
    c.rotate(yaw + Math.PI);
    c.scale(sc, sc);
    c.translate(-p.x, -p.z);
    var W = G.world;
    var view = R / sc + 60;
    // zee
    c.fillStyle = '#1b4d6b';
    c.fillRect(p.x - view, 690, view * 2, 2000);
    c.fillStyle = '#c9b582';
    c.fillRect(p.x - view, 640, view * 2, 50);
    // blokken
    W.blocks.forEach(function (b) {
      if (Math.abs(b.cx - p.x) > view + 50 || Math.abs(b.cz - p.z) > view + 50) return;
      c.fillStyle = DCOL[b.district] || '#444';
      c.fillRect(b.cx - 42, b.cz - 42, 84, 84);
    });
    // gebouwen
    c.fillStyle = 'rgba(160,170,180,0.35)';
    W.buildings.forEach(function (b) {
      if (b.collapsed || Math.abs(b.x - p.x) > view || Math.abs(b.z - p.z) > view) return;
      c.fillRect(b.x - b.w / 2, b.z - b.d / 2, b.w, b.d);
    });
    // route naar waypoint
    var wp = (G.missions.active && G.missions.active.wp) || (G.waypoint && G.waypoint.pos);
    if (wp) {
      c.strokeStyle = '#ffd54f';
      c.lineWidth = 5 / sc;
      c.setLineDash([12, 8]);
      c.beginPath(); c.moveTo(p.x, p.z); c.lineTo(wp.x, wp.z); c.stroke();
      c.setLineDash([]);
    }
    c.restore();
    // symbolen (niet geroteerd)
    function dot(x, z, col, r, label) {
      var dx = (x - p.x) * sc, dz = (z - p.z) * sc;
      var cs = Math.cos(yaw + Math.PI), sn = Math.sin(yaw + Math.PI);
      var rx = dx * cs - dz * sn, rz = dx * sn + dz * cs;
      var d = Math.sqrt(rx * rx + rz * rz);
      if (d > R - 8) { rx = rx / d * (R - 8); rz = rz / d * (R - 8); }
      c.fillStyle = col;
      c.beginPath(); c.arc(S / 2 + rx, S / 2 + rz, r || 4, 0, Math.PI * 2); c.fill();
      if (label) { c.fillStyle = '#111'; c.font = 'bold 9px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(label, S / 2 + rx, S / 2 + rz + 0.5); }
    }
    W.pois.forEach(function (o) {
      if (U.dist2(o.x, o.z, p.x, p.z) < 260) dot(o.x, o.z, o.color, 6, o.icon.length === 1 ? o.icon : '');
    });
    G.missions.markers.forEach(function (m) { dot(m.pos.x, m.pos.z, m.def.color, 6, '!'); });
    if (wp) dot(wp.x, wp.z, '#ffd54f', 6, '★');
    G.npc.cops.forEach(function (cp) { if (cp.alive && cp.distTo(p) < 180) dot(cp.pos.x, cp.pos.z, Math.floor(G.time * 4) % 2 ? '#ff3b3b' : '#3b7bff', 3.5); });
    var gfa = G.gf.actor();
    if (gfa) dot(gfa.pos.x, gfa.pos.z, '#ff8fc8', 5, '♥');
    // speler
    c.save();
    c.translate(S / 2, S / 2);
    var ph = G.player.vehicle ? G.player.vehicle.heading : G.player.heading;
    c.rotate(-(ph - yaw));
    c.fillStyle = '#ffffff';
    c.beginPath(); c.moveTo(0, -9); c.lineTo(6, 7); c.lineTo(0, 4); c.lineTo(-6, 7); c.closePath(); c.fill();
    c.restore();
    c.strokeStyle = 'rgba(255,255,255,0.6)';
    c.lineWidth = 3;
    c.beginPath(); c.arc(S / 2, S / 2, R, 0, Math.PI * 2); c.stroke();
    c.fillStyle = '#fff';
    c.font = 'bold 12px sans-serif';
    var nx = Math.sin(-(yaw + Math.PI)) * (R - 10), nz = -Math.cos(-(yaw + Math.PI)) * (R - 10);
    c.fillText('N', S / 2 + nx - 4, S / 2 + nz + 4);
  }

  // ---- Grote kaart ---------------------------------------------------------------------------
  var mapView = { sc: 0.45, cx: 0, cz: 100 };
  UI.openMap = function () {
    UI.closeModal();
    UI.modal = 'map';
    els.mapview.classList.remove('hidden');
    G.input.unlock();
    mapView.cx = G.player.pos.x; mapView.cz = G.player.pos.z;
    drawBigMap();
    var legend = '';
    G.world.pois.forEach(function (o) { legend += '<div><span style="background:' + o.color + '">' + esc(o.icon) + '</span>' + esc(o.name) + '</div>'; });
    legend += '<div><span style="background:#ffd54f">!</span>Missie</div><div><span style="background:#ff8fc8">♥</span>Mika</div>';
    els.maplegend.innerHTML = legend;
  };

  function drawBigMap() {
    var cv = els.bigmap;
    cv.width = window.innerWidth;
    cv.height = window.innerHeight;
    var c = cv.getContext('2d');
    var sc = Math.min(cv.width / 1900, cv.height / 1700);
    mapView.sc = sc;
    c.fillStyle = '#1b4d6b';
    c.fillRect(0, 0, cv.width, cv.height);
    c.save();
    c.translate(cv.width / 2, cv.height / 2);
    c.scale(sc, sc);
    c.translate(0, -60);
    mapView.ox = cv.width / 2; mapView.oz = cv.height / 2 - 60 * sc;
    c.fillStyle = '#3f6b37';
    c.fillRect(-1150, -1150, 2300, 1790);
    c.fillStyle = '#c9b582';
    c.fillRect(-1150, 640, 2300, 55);
    c.fillStyle = '#2a2f33';
    c.fillRect(-808, -808, 1616, 1416);
    G.world.blocks.forEach(function (b) {
      c.fillStyle = DCOL[b.district] || '#444';
      c.fillRect(b.cx - 42, b.cz - 42, 84, 84);
    });
    c.fillStyle = 'rgba(190,200,210,0.35)';
    G.world.buildings.forEach(function (b) { if (!b.collapsed) c.fillRect(b.x - b.w / 2, b.z - b.d / 2, b.w, b.d); });
    c.restore();
    function mark(x, z, col, label, r) {
      var sx = mapView.ox + x * sc, sz = mapView.oz + z * sc;
      c.fillStyle = col;
      c.beginPath(); c.arc(sx, sz, r || 9, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#111';
      c.font = 'bold 11px sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(label, sx, sz + 1);
    }
    G.world.pois.forEach(function (o) { mark(o.x, o.z, o.color, o.icon.length <= 2 ? o.icon : '•'); });
    G.missions.markers.forEach(function (m) { mark(m.pos.x, m.pos.z, m.def.color, '!', 8); });
    var gfa = G.gf.actor();
    if (gfa) mark(gfa.pos.x, gfa.pos.z, '#ff8fc8', '♥', 7);
    var wp = G.waypoint && G.waypoint.pos;
    if (wp) mark(wp.x, wp.z, '#ffd54f', '★', 9);
    var p = G.player.pos;
    mark(p.x, p.z, '#ffffff', '▲', 8);
    c.fillStyle = '#fff';
    c.font = 'bold 28px "Bebas Neue", Impact, sans-serif';
    c.textAlign = 'left';
    c.fillText('HAVENSTAD', 24, 44);
  }

  function onMapClick(e) {
    var x = (e.clientX - mapView.ox) / mapView.sc, z = (e.clientY - mapView.oz) / mapView.sc;
    G.waypoint = { pos: new T.Vector3(x, 0, z), label: 'Eigen route' };
    G.audio.sfx('click');
    drawBigMap();
  }

  // ---- Modale vensters -------------------------------------------------------------------
  UI.closeModal = function () {
    if (UI.modal === 'clothes' && UI._wardrobeRevert) UI._wardrobeRevert();
    els.modal.classList.add('hidden');
    els.modal.innerHTML = '';
    els.mapview.classList.add('hidden');
    var was = UI.modal;
    UI.modal = null;
    if (was && G.playing && !G.paused) G.input.lock();
    G.emit('modalClosed', was);
  };

  function openModal(name, html, cls) {
    var again = UI.modal === name && !els.modal.classList.contains('hidden');
    UI.modal = name;
    G.input.unlock();
    G.input.clearAll();
    els.modal.className = 'panel-wrap ' + (cls || '') + (again ? ' still' : '');
    els.modal.innerHTML = html;
    els.modal.classList.remove('hidden');
    var close = els.modal.querySelector('[data-close]');
    if (close) close.addEventListener('click', function () { G.audio.sfx('click'); UI.closeModal(); });
  }

  // Dialoog met keuzes (Mika, missies, info)
  UI.dialog = function (d) {
    var html = '<div class="panel dialog"><div class="dlg-who" style="color:' + (d.color || '#ffd54f') + '">' + esc(d.who || '') + (d.sub ? '<small>' + esc(d.sub) + '</small>' : '') + '</div>' +
      '<div class="dlg-text">' + esc(d.text || '') + '</div><div class="dlg-opts">';
    d.options.forEach(function (o, i) { html += '<button class="opt" data-i="' + i + '"><kbd>' + (i + 1) + '</kbd>' + esc(o.label) + '</button>'; });
    html += '</div></div>';
    openModal('dialog', html, 'bottom');
    var btns = els.modal.querySelectorAll('.opt');
    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        var o = d.options[+b.getAttribute('data-i')];
        G.audio.sfx('click');
        UI.closeModal();
        if (o.fn) o.fn();
      });
    });
    UI._dialogOpts = d.options;
  };

  G.on('key', function (e) {
    if (UI.modal === 'dialog' && /^Digit[1-9]$/.test(e.code)) {
      var i = +e.code.slice(5) - 1;
      var o = UI._dialogOpts && UI._dialogOpts[i];
      if (o) { G.audio.sfx('click'); UI.closeModal(); if (o.fn) o.fn(); }
    }
  });

  UI.missionIntro = function (d) {
    var why = d.req ? d.req() : null;
    var html = '<div class="panel mission"><div class="m-tag" style="background:' + d.color + '">MISSIE</div><h2>' + esc(d.title) + '</h2><p>' + esc(d.desc) + '</p>' +
      '<div class="m-reward">Beloning: <b>' + (d.reward ? U.money(d.reward) : 'fooien') + '</b>' + (d.repeat ? ' · herhaalbaar' : '') + '</div>' +
      (why ? '<div class="m-req">⚠ ' + esc(why) + '</div>' : '') +
      '<div class="row"><button class="btn primary" id="m-go"' + (why ? ' disabled' : '') + '>Starten</button><button class="btn" data-close>Later</button></div></div>';
    openModal('mission', html);
    var go = document.getElementById('m-go');
    if (go) go.addEventListener('click', function () { UI.closeModal(); G.missions.start(d); });
  };

  // ---- Kledingwinkel met live preview -----------------------------------------------------
  var CAT = [
    { key: 'top', label: 'Bovenstuk', colorKey: 'topColor' },
    { key: 'pants', label: 'Broek & rok', colorKey: 'pantsColor' },
    { key: 'shoes', label: 'Schoenen', colorKey: 'shoesColor' },
    { key: 'hair', label: 'Kapsel', colorKey: 'hairColor', colors: 'hair' },
    { key: 'hat', label: 'Hoofddeksel', colorKey: 'hatColor' },
    { key: 'glasses', label: 'Bril', colorKey: null }
  ];

  UI.openClothes = function (ownedOnly) {
    var saved = JSON.parse(JSON.stringify(G.state.outfit));
    var preview = JSON.parse(JSON.stringify(G.state.outfit));
    var cat = 0;
    UI._wardrobeRevert = function () {
      G.player.char.setLook(G.state.outfit);
      G.player.refreshWeapon();
      G.camCtl.mode = 'follow';
    };
    G.camCtl.mode = 'wardrobe';
    function apply() { G.player.char.setLook(preview); }
    function render() {
      var c = CAT[cat];
      var list = G.CLOTHES[c.key];
      var html = '<div class="panel shop clothes"><div class="shop-head"><h2>' + (ownedOnly ? 'Garderobe' : 'Stijlzaak') + '</h2><span class="cash">' + U.money(G.state.money) + '</span><button class="x" data-close>✕</button></div>';
      html += '<div class="tabs">' + CAT.map(function (k, i) { return '<button class="tab' + (i === cat ? ' sel' : '') + '" data-cat="' + i + '">' + k.label + '</button>'; }).join('') + '</div><div class="items">';
      list.forEach(function (it) {
        var owned = G.state.owned[it.id] || it.price === 0;
        if (ownedOnly && !owned) return;
        var wearing = preview[c.key] === it.id;
        html += '<button class="item' + (wearing ? ' sel' : '') + '" data-id="' + it.id + '"><span>' + esc(it.name) + '</span><small>' + (owned ? 'In bezit' : U.money(it.price)) + '</small></button>';
      });
      html += '</div>';
      if (c.colorKey) {
        var cols = c.colors === 'hair' ? G.HAIR_COLORS : G.COLORS;
        html += '<div class="sw-label">Kleur ' + (ownedOnly ? '' : '(gratis bij een gekocht item)') + '</div><div class="swatches">' + cols.map(function (col) {
          return '<button class="sw' + (preview[c.colorKey] === col ? ' sel' : '') + '" data-col="' + col + '" style="background:' + col + '"></button>';
        }).join('') + '</div>';
      }
      var cost = outfitCost();
      html += '<div class="row foot"><span>' + (cost ? 'Totaal: <b>' + U.money(cost) + '</b>' : 'Alles in bezit') + '</span><button class="btn primary" id="cl-buy">' + (cost ? 'Kopen & dragen' : 'Dragen') + '</button></div>';
      html += '<div class="hint">Beweeg de muis met ingedrukte knop over het scherm om rond te draaien. Je ziet de kleding live op je personage.</div></div>';
      openModal('clothes', html, 'right');
      els.modal.querySelectorAll('.tab').forEach(function (b) { b.addEventListener('click', function () { cat = +b.getAttribute('data-cat'); G.audio.sfx('click'); render(); }); });
      els.modal.querySelectorAll('.item').forEach(function (b) {
        b.addEventListener('click', function () {
          preview[c.key] = b.getAttribute('data-id');
          G.audio.sfx('click');
          apply(); render();
        });
      });
      els.modal.querySelectorAll('.sw').forEach(function (b) {
        b.addEventListener('click', function () { preview[c.colorKey] = b.getAttribute('data-col'); G.audio.sfx('click'); apply(); render(); });
      });
      document.getElementById('cl-buy').addEventListener('click', function () {
        var cost2 = outfitCost();
        if (cost2 && !G.spend(cost2, 'Kleding')) return;
        CAT.forEach(function (k) { G.state.owned[preview[k.key]] = true; });
        var hadVest = saved.top === 'vest';
        G.state.outfit = JSON.parse(JSON.stringify(preview));
        saved = JSON.parse(JSON.stringify(preview));
        if (preview.top === 'vest' && !hadVest) { G.player.armor = 100; UI.toast('🛡 Kogelwerend vest: bepantsering 100'); }
        UI._wardrobeRevert = function () { G.player.char.setLook(G.state.outfit); G.player.refreshWeapon(); G.camCtl.mode = 'follow'; };
        G.audio.sfx('cash');
        UI.toast('Nieuwe look! 😎', 'good');
        G.emit('outfitChanged', preview);
        render();
      });
    }
    function outfitCost() {
      var c2 = 0;
      CAT.forEach(function (k) {
        var id = preview[k.key];
        if (G.state.owned[id]) return;
        var it = G.CLOTHES[k.key].filter(function (x) { return x.id === id; })[0];
        if (it) c2 += it.price;
      });
      return c2;
    }
    apply();
    render();
  };

  // ---- Wapenwinkel --------------------------------------------------------------------
  UI.openGuns = function () {
    function render() {
      var html = '<div class="panel shop"><div class="shop-head"><h2>Kaliber Wapenhandel</h2><span class="cash">' + U.money(G.state.money) + '</span><button class="x" data-close>✕</button></div><div class="list">';
      G.WEAPON_ORDER.forEach(function (id) {
        var w = G.WEAPONS[id];
        if (w.melee) return;
        var owned = G.state.weapons[id];
        if (w.throw) {
          html += '<div class="li"><div><b>💣 ' + w.name + '</b><small>In bezit: ' + G.state.grenades + ' · gooien met G</small></div><button class="btn sm" data-gren="1">1× ' + U.money(w.price) + '</button><button class="btn sm" data-gren="5">5× ' + U.money(w.price * 4.5) + '</button></div>';
          return;
        }
        html += '<div class="li"><div><b>' + w.name + '</b><small>' + (owned ? 'Munitie: ' + ((G.state.mags[id] || 0) + (G.state.ammo[id] || 0)) : 'Schade ' + (w.dmg || 'explosief') + (w.pellets ? '×' + w.pellets : '') + ' · ' + (w.auto ? 'automatisch' : 'semi')) + '</small></div>' +
          (owned ? '<button class="btn sm" data-ammo="' + id + '">+' + w.ammoPack + ' munitie ' + U.money(w.ammoPrice * w.ammoPack) + '</button>' : '<button class="btn sm primary" data-buy="' + id + '">Kopen ' + U.money(w.price) + '</button>') + '</div>';
      });
      html += '<div class="li"><div><b>🛡 Bepantsering</b><small>Huidig: ' + Math.round(G.player.armor) + '/100</small></div><button class="btn sm" data-armor="1">Aanvullen ' + U.money(800) + '</button></div>';
      html += '</div><div class="hint">Wapens: 1-8 of scrollen · Rechtermuis = richten · R = herladen</div></div>';
      openModal('guns', html, 'right');
      els.modal.querySelectorAll('[data-buy]').forEach(function (b) {
        b.addEventListener('click', function () {
          var id = b.getAttribute('data-buy'), w = G.WEAPONS[id];
          if (!G.spend(w.price, 'Wapen: ' + w.name)) return;
          G.state.weapons[id] = true;
          G.state.mags[id] = w.mag;
          G.state.ammo[id] = (G.state.ammo[id] || 0) + w.ammoPack;
          G.player.selectWeapon(id);
          render();
        });
      });
      els.modal.querySelectorAll('[data-ammo]').forEach(function (b) {
        b.addEventListener('click', function () {
          var id = b.getAttribute('data-ammo'), w = G.WEAPONS[id];
          if (!G.spend(w.ammoPrice * w.ammoPack, 'Munitie')) return;
          G.state.ammo[id] = (G.state.ammo[id] || 0) + w.ammoPack;
          render();
        });
      });
      els.modal.querySelectorAll('[data-gren]').forEach(function (b) {
        b.addEventListener('click', function () {
          var n = +b.getAttribute('data-gren');
          if (!G.spend(G.WEAPONS.grenade.price * (n === 5 ? 4.5 : 1), 'Granaten')) return;
          G.state.grenades += n;
          G.state.weapons.grenade = true;
          render();
        });
      });
      var ar = els.modal.querySelector('[data-armor]');
      if (ar) ar.addEventListener('click', function () { if (G.player.armor >= 100) return; if (G.spend(800, 'Bepantsering')) { G.player.armor = 100; render(); } });
    }
    render();
  };

  // ---- Cadeauwinkel -----------------------------------------------------------------------
  UI.openGifts = function () {
    function render() {
      var st = G.gf.state();
      var html = '<div class="panel shop"><div class="shop-head"><h2>Cadeauhoek</h2><span class="cash">' + U.money(G.state.money) + '</span><button class="x" data-close>✕</button></div><div class="list">';
      G.gf.GIFTS.forEach(function (g) {
        html += '<div class="li"><div><b>' + g.icon + ' ' + g.name + '</b><small>In je tas: ' + (st.inventory[g.id] || 0) + '</small></div><button class="btn sm" data-g="' + g.id + '">' + U.money(g.price) + '</button></div>';
      });
      html += '</div><div class="hint">Tip: Mika houdt van sterren, lavendel en katten. Geef het cadeau via een gesprek met haar.</div></div>';
      openModal('gifts', html, 'right');
      els.modal.querySelectorAll('[data-g]').forEach(function (b) {
        b.addEventListener('click', function () {
          var g = G.gf.GIFTS.filter(function (x) { return x.id === b.getAttribute('data-g'); })[0];
          if (G.gf.buyGift(g)) render();
        });
      });
    }
    render();
  };

  // Eenvoudig keuzemenu (winkel, ziekenhuis, appartement)
  UI.menu = function (title, sub, options) {
    var html = '<div class="panel shop"><div class="shop-head"><h2>' + esc(title) + '</h2><span class="cash">' + U.money(G.state.money) + '</span><button class="x" data-close>✕</button></div>' +
      (sub ? '<p class="sub">' + esc(sub) + '</p>' : '') + '<div class="list">';
    options.forEach(function (o, i) { html += '<div class="li"><div><b>' + esc(o.label) + '</b>' + (o.small ? '<small>' + esc(o.small) + '</small>' : '') + '</div><button class="btn sm" data-o="' + i + '">' + esc(o.button || 'Kies') + '</button></div>'; });
    html += '</div></div>';
    openModal('menu', html, 'right');
    els.modal.querySelectorAll('[data-o]').forEach(function (b) {
      b.addEventListener('click', function () {
        var o = options[+b.getAttribute('data-o')];
        G.audio.sfx('click');
        var keep = o.fn && o.fn();
        if (!keep) UI.closeModal();
      });
    });
  };

  // ---- Telefoon ---------------------------------------------------------------------------
  UI.openPhone = function (app) {
    app = app || 'home';
    var st = G.gf.state();
    var html = '<div class="phone"><div class="ph-top"><span>' + G.clockText() + '</span><span>Havenstad 5G</span></div><div class="ph-body">';
    if (app === 'home') {
      var unread = st.messages.filter(function (m) { return !m.read; }).length;
      var apps = [['missies', '📋', 'Missies'], ['berichten', '💬', 'Berichten' + (unread ? ' (' + unread + ')' : '')], ['bellen', '📞', 'Bel Mika'], ['kaart', '🗺', 'Kaart'],
        ['stats', '📊', 'Statistieken'], ['opslaan', '💾', 'Opslaan'], ['radio', '📻', 'Radio'], ['instellingen', '⚙', 'Instellingen']];
      html += '<div class="apps">' + apps.map(function (a) { return '<button class="app" data-app="' + a[0] + '"><span>' + a[1] + '</span>' + a[2] + '</button>'; }).join('') + '</div>';
    } else if (app === 'missies') {
      html += '<h3>Missies</h3>';
      G.missions.defs.forEach(function (d) {
        var done = G.state.missions[d.id];
        html += '<div class="ph-row"><b style="color:' + d.color + '">' + esc(d.title) + '</b><small>' + (done ? (d.repeat ? 'Voltooid ×' + done + ' · herhaalbaar' : '✔ Voltooid') : (d.reward ? U.money(d.reward) : '')) + '</small>' +
          (G.missions.available(d) ? '<button class="btn xs" data-route="' + d.id + '">Route</button>' : '') + '</div>';
      });
      if (G.missions.active) html += '<button class="btn sm" id="abort">Huidige missie afbreken</button>';
    } else if (app === 'berichten') {
      html += '<h3>Mika 💜</h3>';
      if (!st.messages.length) html += '<p class="muted">Nog geen berichten.</p>';
      st.messages.forEach(function (m) { m.read = true; html += '<div class="bubble"><small>Dag ' + m.day + ' · ' + m.time + '</small>' + esc(m.text) + '</div>'; });
    } else if (app === 'stats') {
      var s = G.state.stats;
      var gfS = G.gf.state();
      html += '<h3>Statistieken</h3>' + [
        ['Geld verdiend', U.money(s.earned)], ['Geld uitgegeven', U.money(s.spent)], ['Missies voltooid', s.missions],
        ['Overvallen', s.robberies], ['Auto\'s gestolen', s.carsStolen], ['Gebouwen gesloopt', s.buildingsDestroyed],
        ['Uitgeschakeld', s.kills], ['Gelopen/gereden', Math.round(s.distance / 1000 * 10) / 10 + ' km'],
        ['Relatie met Mika', G.gf.STAGES[gfS.stage] + ' (' + Math.round(gfS.affection) + ')'], ['Waarde bouwwerk', U.money(G.build.value())]
      ].map(function (r) { return '<div class="ph-row"><span>' + r[0] + '</span><b>' + r[1] + '</b></div>'; }).join('');
    } else if (app === 'radio') {
      html += '<h3>Radio</h3>';
      G.audio.stations.forEach(function (s2, i) { html += '<button class="btn sm wide" data-st="' + i + '">' + esc(s2.name) + '</button>'; });
      html += '<button class="btn sm wide" data-st="-1">Radio uit</button>';
    }
    html += '</div><div class="ph-bottom"><button class="btn xs" data-app="home">⌂</button><button class="btn xs" data-close>Sluiten</button></div></div>';
    openModal('phone', html, 'phonewrap');
    els.modal.querySelectorAll('[data-app]').forEach(function (b) {
      b.addEventListener('click', function () {
        var a = b.getAttribute('data-app');
        G.audio.sfx('click');
        if (a === 'kaart') { UI.openMap(); return; }
        if (a === 'bellen') { UI.closeModal(); G.gf.call(); return; }
        if (a === 'opslaan') { UI.closeModal(); UI.toast(G.saveGame() ? '💾 Spel opgeslagen' : 'Opslaan mislukt', 'good'); return; }
        if (a === 'instellingen') { UI.openSettings(); return; }
        UI.openPhone(a);
      });
    });
    els.modal.querySelectorAll('[data-route]').forEach(function (b) {
      b.addEventListener('click', function () {
        var d = G.missions.defs.filter(function (x) { return x.id === b.getAttribute('data-route'); })[0];
        G.emit('waypoint', { pos: d.pos(), label: d.title });
        UI.closeModal();
      });
    });
    els.modal.querySelectorAll('[data-st]').forEach(function (b) {
      b.addEventListener('click', function () {
        var i = +b.getAttribute('data-st');
        if (i < 0) G.audio.radioOff(); else G.audio.radioOn(i);
        UI.closeModal();
      });
    });
    var ab = document.getElementById('abort');
    if (ab) ab.addEventListener('click', function () { G.missions.abort(); UI.closeModal(); });
  };

  // ---- Instellingen, besturing ------------------------------------------------------------
  UI.openSettings = function (fromTitle) {
    var s = G.settings;
    var html = '<div class="panel settings"><div class="shop-head"><h2>Instellingen</h2><button class="x" data-close>✕</button></div>' +
      '<label>Grafische kwaliteit<select id="s-q"><option value="laag">Laag (snel)</option><option value="normaal">Normaal</option><option value="ultra">Ultra</option></select></label>' +
      '<label>Volume <input type="range" id="s-v" min="0" max="1" step="0.05" value="' + s.volume + '"></label>' +
      '<label>Muziek/radio <input type="range" id="s-m" min="0" max="1" step="0.05" value="' + s.music + '"></label>' +
      '<label>Muisgevoeligheid <input type="range" id="s-s" min="0.3" max="2.5" step="0.05" value="' + s.sens + '"></label>' +
      '<label class="chk"><input type="checkbox" id="s-i"' + (s.invertY ? ' checked' : '') + '> Muis omkeren (Y)</label>' +
      '<p class="muted">Kwaliteit wordt na herladen van de pagina volledig toegepast.</p>' +
      '<div class="row"><button class="btn primary" id="s-ok">Opslaan</button></div></div>';
    openModal('settings', html);
    document.getElementById('s-q').value = s.quality;
    document.getElementById('s-ok').addEventListener('click', function () {
      var q = document.getElementById('s-q').value;
      var reload = q !== s.quality;
      s.quality = q;
      s.volume = +document.getElementById('s-v').value;
      s.music = +document.getElementById('s-m').value;
      s.sens = +document.getElementById('s-s').value;
      s.invertY = document.getElementById('s-i').checked;
      G.saveSettings();
      G.audio.setVolume(s.volume);
      G.audio.setMusic(s.music);
      UI.closeModal();
      if (reload && window.confirm('Kwaliteit gewijzigd. Nu herladen? (Je spel wordt eerst opgeslagen.)')) {
        if (G.playing) G.saveGame();
        window.location.reload();
      }
      if (fromTitle) UI.showTitle();
    });
  };

  var CONTROLS = [
    ['WASD', 'Lopen / rijden'], ['Muis', 'Rondkijken'], ['Shift', 'Sprinten (heli: dalen)'], ['Spatie', 'Springen / handrem (heli: stijgen)'],
    ['C', 'Rustig lopen'], ['Linkermuis', 'Schieten / slaan'], ['Rechtermuis', 'Richten (sniper: inzoomen)'], ['R', 'Herladen / radio in auto'],
    ['1-8 / scroll', 'Wapen kiezen'], ['G', 'Granaat gooien'], ['F', 'Instappen / auto stelen / uitstappen'], ['E', 'Praten / interactie / missie starten'],
    ['H', 'Toeteren'], ['Q / E', 'Heli: zijwaarts'], ['X', 'Handen omhoog (overgeven)'], ['B', 'Bouwmodus (op de bouwplaats)'],
    ['Tab', 'Telefoon'], ['M', 'Kaart'], ['Esc', 'Pauze']
  ];
  UI.controlsHtml = function () {
    return '<div class="controls">' + CONTROLS.map(function (c) { return '<div><kbd>' + c[0] + '</kbd><span>' + c[1] + '</span></div>'; }).join('') + '</div>';
  };

  UI.openControls = function (back) {
    openModal('controls', '<div class="panel"><div class="shop-head"><h2>Besturing</h2><button class="x" data-close>✕</button></div>' + UI.controlsHtml() + '</div>');
    if (back) G.on('modalClosed', function once(w) { if (w === 'controls' && !G.playing) UI.showTitle(); });
  };

  // ---- Titelscherm en pauze --------------------------------------------------------------
  UI.showTitle = function () {
    var has = G.hasSave();
    els.title.innerHTML = '<div class="title-inner"><h1>HAVEN<span>STAD</span></h1><p class="tag">Een open stad. Jouw regels.</p>' +
      '<div class="menu">' + (has ? '<button class="btn primary big" id="t-cont">▶ Doorgaan</button>' : '') +
      '<button class="btn big' + (has ? '' : ' primary') + '" id="t-new">Nieuw spel</button>' +
      '<button class="btn" id="t-ctrl">Besturing</button><button class="btn" id="t-set">Instellingen</button>' +
      '<a class="btn" href="metro.html">🕹 Metro Rush (arcade)</a></div>' +
      '<p class="credit">Alle modellen, muziek en geluiden worden live in je browser gegenereerd.</p></div>';
    els.title.classList.remove('hidden');
    var bind = function (id, fn) { var e = document.getElementById(id); if (e) e.addEventListener('click', function () { G.audio.init(); G.audio.sfx('click'); fn(); }); };
    bind('t-cont', function () { G.startGame(false); });
    bind('t-new', function () {
      if (has && !window.confirm('Een nieuw spel overschrijft je opgeslagen voortgang. Doorgaan?')) return;
      G.startGame(true);
    });
    bind('t-ctrl', function () { els.title.classList.add('hidden'); UI.openControls(true); });
    bind('t-set', function () { els.title.classList.add('hidden'); UI.openSettings(true); });
  };
  UI.hideTitle = function () { els.title.classList.add('hidden'); els.hud.classList.remove('hidden'); };

  UI.showPause = function () {
    var html = '<div class="panel pause"><h2>Gepauzeerd</h2><div class="menu">' +
      '<button class="btn primary" id="pa-res">Verder spelen</button><button class="btn" id="pa-save">Opslaan</button>' +
      '<button class="btn" id="pa-map">Kaart</button><button class="btn" id="pa-ctrl">Besturing</button><button class="btn" id="pa-set">Instellingen</button>' +
      '<button class="btn" id="pa-quit">Opslaan & naar hoofdmenu</button></div></div>';
    openModal('pause', html);
    document.getElementById('pa-res').addEventListener('click', function () { G.resume(); });
    document.getElementById('pa-save').addEventListener('click', function () { UI.toast(G.saveGame() ? '💾 Opgeslagen' : 'Opslaan mislukt', 'good'); });
    document.getElementById('pa-map').addEventListener('click', function () { UI.openMap(); });
    document.getElementById('pa-ctrl').addEventListener('click', function () { UI.openControls(); });
    document.getElementById('pa-set').addEventListener('click', function () { UI.openSettings(); });
    document.getElementById('pa-quit').addEventListener('click', function () { G.saveGame(); window.location.reload(); });
  };

  window.addEventListener('resize', function () { if (UI.modal === 'map') drawBigMap(); });
})();
