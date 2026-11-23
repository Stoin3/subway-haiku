/*
 * main.js - start de wereld, renderpijplijn (tonemapping, bloom), spelerbesturing
 * (te voet, auto, helikopter), camera, interacties, dag/nacht, opslaan en respawn.
 */
(function () {
  'use strict';

  var G = window.G, T = G.T, U = G.U;
  var UI = G.ui;
  G.time = 0;
  G.playing = false;
  G.paused = false;

  var renderer, scene, camera, composer, bloom, Q;
  var last = performance.now();
  var engineSnd = null, heliSnd = null;
  var pickups = [];

  // ---- Renderer en scène ------------------------------------------------------------
  function initRenderer() {
    Q = G.settings.quality;
    var useComposer = !!(G.A.EffectComposer && G.A.RenderPass && G.A.OutputPass);
    renderer = new T.WebGLRenderer({ antialias: !useComposer && Q !== 'laag', powerPreference: 'high-performance' });
    var pr = Q === 'laag' ? 0.75 : (Q === 'ultra' ? Math.min(window.devicePixelRatio || 1, 2) : Math.min(window.devicePixelRatio || 1, 1.25));
    renderer.setPixelRatio(pr);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = Q !== 'laag';
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    document.getElementById('app').appendChild(renderer.domElement);
    G.renderer = renderer;

    scene = G.scene = new T.Scene();
    camera = G.cam = new T.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2600);
    camera.addShake = function (a) { camCtl.trauma = Math.min(1.5, camCtl.trauma + a); };

    if (useComposer) {
      var samples = Q === 'ultra' ? 4 : (Q === 'normaal' ? 2 : 0);
      var rt = new T.WebGLRenderTarget(window.innerWidth * pr, window.innerHeight * pr, { type: T.HalfFloatType, samples: samples });
      composer = new G.A.EffectComposer(renderer, rt);
      composer.setPixelRatio(pr);
      composer.setSize(window.innerWidth, window.innerHeight);
      composer.addPass(new G.A.RenderPass(scene, camera));
      if (Q !== 'laag' && G.A.UnrealBloomPass) {
        bloom = new G.A.UnrealBloomPass(new T.Vector2(window.innerWidth / 2, window.innerHeight / 2), 0.3, 0.45, 0.9);
        composer.addPass(bloom);
      }
      composer.addPass(new G.A.OutputPass());
    }
    window.addEventListener('resize', onResize);
  }

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (composer) composer.setSize(window.innerWidth, window.innerHeight);
    G.fx.onResize(window.innerHeight, camera.fov, renderer.getPixelRatio());
  }

  // ---- Camera --------------------------------------------------------------------------
  var camCtl = G.camCtl = { yaw: Math.PI, pitch: 0.22, mode: 'follow', trauma: 0, idle: 0, fov: 62, lastMx: 0 };
  var camTarget = new T.Vector3(), camPos = new T.Vector3(), tmpV = new T.Vector3(), tmpD = new T.Vector3();

  function camForward(out) {
    var cp = Math.cos(camCtl.pitch);
    return out.set(Math.sin(camCtl.yaw) * cp, -Math.sin(camCtl.pitch), Math.cos(camCtl.yaw) * cp);
  }

  function updateCamera(dt) {
    var p = G.player;
    var I = G.input;
    var sens = 0.0023 * G.settings.sens;
    var moved = Math.abs(I.mouse.dx) + Math.abs(I.mouse.dy) > 0;
    if (!UI.modal && I.locked) {
      var zoomSens = p && p.scoped ? 0.3 : 1;
      camCtl.yaw -= I.mouse.dx * sens * zoomSens;
      camCtl.pitch += I.mouse.dy * sens * zoomSens * (G.settings.invertY ? -1 : 1);
    }
    camCtl.idle = moved ? 0 : camCtl.idle + dt;
    camCtl.trauma = Math.max(0, camCtl.trauma - dt * 1.4);
    var fov = 62;
    var r = { x: -Math.cos(camCtl.yaw), z: Math.sin(camCtl.yaw) };

    if (camCtl.mode === 'wardrobe' && p) {
      if (I.mouse.down[0]) p.heading += (I.mouse.x - camCtl.lastMx) * 0.01;
      camCtl.lastMx = I.mouse.x;
      var fx = Math.sin(p.heading), fz = Math.cos(p.heading);
      // iets naar links zodat het paneel rechts het personage niet bedekt
      camera.position.set(p.pos.x + fx * 2.7 - fz * 0.7, p.pos.y + 1.25, p.pos.z + fz * 2.7 + fx * 0.7);
      camera.lookAt(p.pos.x - fz * 0.55, p.pos.y + 0.95, p.pos.z + fx * 0.55);
      camera.fov = U.damp(camera.fov, 50, 6, dt);
      camera.updateProjectionMatrix();
      return;
    }
    if (camCtl.mode === 'cinematic' && p) {
      var gfa = G.gf.actor();
      var mid = gfa ? tmpV.addVectors(p.pos, gfa.pos).multiplyScalar(0.5) : tmpV.copy(p.pos);
      var a = G.time * 0.15;
      camera.position.set(mid.x + Math.sin(a) * 5, mid.y + 1.8, mid.z + Math.cos(a) * 5);
      camera.lookAt(mid.x, mid.y + 1.2, mid.z);
      return;
    }

    var v = p.vehicle;
    var dist, side = 0, height;
    if (v) {
      camCtl.pitch = U.clamp(camCtl.pitch, -0.35, 1.1);
      var spd = v.speed();
      if (camCtl.idle > 1.2 && spd > 3 && !v.isHeli) {
        camCtl.yaw += U.angDiff(camCtl.yaw, v.heading) * Math.min(1, dt * 2.5);
        camCtl.pitch = U.damp(camCtl.pitch, 0.18, 2, dt);
      }
      if (v.isHeli && camCtl.idle > 1.5) camCtl.yaw += U.angDiff(camCtl.yaw, v.heading) * Math.min(1, dt * 1.5);
      dist = v.isHeli ? 15 : 6.5 + v.spec.L * 0.35 + spd * 0.05;
      height = v.isHeli ? 2.6 : v.height + 0.5;
      camTarget.set(v.pos.x, v.pos.y + height, v.pos.z);
      fov = 62 + Math.min(16, spd * 0.32);
    } else {
      camCtl.pitch = U.clamp(camCtl.pitch, -0.9, 1.25);
      var aim = p.aiming;
      dist = aim ? 2.0 : 4.4;
      side = aim ? 0.62 : 0.3;
      if (G.build.active) { dist = 6.5; side = 0.6; }
      camTarget.set(p.pos.x, p.pos.y + 1.6 * p.char.scale, p.pos.z);
      if (aim) fov = 52;
      if (p.scoped) { dist = 0.15; side = 0.1; fov = 17; }
    }
    camForward(tmpD);
    camPos.copy(camTarget).addScaledVector(tmpD, -dist);
    camPos.x += r.x * side; camPos.z += r.z * side;
    // camera tegen muren laten stoppen
    var toCam = tmpV.subVectors(camPos, camTarget);
    var len = toCam.length();
    if (len > 0.01) {
      toCam.divideScalar(len);
      var hit = G.world.raycast(camTarget, toCam, len, { noGround: true });
      if (hit) camPos.copy(camTarget).addScaledVector(toCam, Math.max(0.2, hit.t - 0.3));
    }
    var gy = G.world.ground(camPos.x, camPos.z) + 0.35;
    if (camPos.y < gy) camPos.y = gy;
    if (camCtl.trauma > 0) {
      var s = camCtl.trauma * camCtl.trauma * 0.5;
      camPos.x += (Math.random() - 0.5) * s;
      camPos.y += (Math.random() - 0.5) * s;
      camPos.z += (Math.random() - 0.5) * s;
    }
    camera.position.copy(camPos);
    var look = tmpV.copy(camTarget).addScaledVector(tmpD, 30);
    look.x += r.x * side; look.z += r.z * side;
    camera.lookAt(look);
    camera.fov = U.damp(camera.fov, fov, 8, dt);
    camera.updateProjectionMatrix();
  }

  function titleCamera(dt) {
    var a = G.uniforms.uTime.value * 0.03;
    camera.position.set(Math.sin(a) * 420, 140 + Math.sin(a * 0.7) * 30, 100 + Math.cos(a) * 420);
    camera.lookAt(0, 20, 50);
  }

  // ---- Speler -----------------------------------------------------------------------------
  function createPlayer() {
    var p = new G.Actor({ look: G.state.outfit, team: 'player', player: true, health: G.state.health, name: 'Jij' });
    p.maxHealth = 100;
    p.armor = G.state.armor;
    p.fireT = 0; p.reloading = 0; p.punchT = 0; p.throwT = 0; p.danceT = 0;
    p.aiming = false; p.scoped = false; p.walk = false; p.handsUp = false; p.sitting = false;
    p.speed2d = function () { return this.vehicle ? this.vehicle.speed() : Math.sqrt(this.vel.x * this.vel.x + this.vel.z * this.vel.z); };
    p.weaponDrawn = function () { var w = G.WEAPONS[G.state.weapon]; return !!w && !w.melee && !w.throw; };
    p.refreshWeapon = function () { this.setWeapon(G.state.weapon === 'fist' || G.state.weapon === 'grenade' ? null : G.state.weapon); };
    p.selectWeapon = function (id) {
      if (id !== 'fist' && !G.state.weapons[id]) return;
      if (id === 'grenade' && G.state.grenades <= 0) return;
      G.state.weapon = id;
      this.reloading = 0;
      this.refreshWeapon();
      G.audio.sfx('click');
    };
    p.refreshWeapon();
    G.player = p;
    return p;
  }

  function aimTarget(range) {
    var o = camera.position;
    camera.getWorldDirection(tmpD);
    var h = G.combat.hitscan(o, tmpD, range || 300, G.player);
    var pt = h ? h.point.clone() : o.clone().addScaledVector(tmpD, range || 300);
    // niet "achter" de speler richten als de camera dichtbij een muur staat
    return pt;
  }

  function playerFoot(dt) {
    var p = G.player, I = G.input;
    var k = I.keys;
    var mx = ((k.KeyD || k.ArrowRight) ? 1 : 0) - ((k.KeyA || k.ArrowLeft) ? 1 : 0);
    var mz = ((k.KeyW || k.ArrowUp) ? 1 : 0) - ((k.KeyS || k.ArrowDown) ? 1 : 0);
    var len = Math.sqrt(mx * mx + mz * mz);
    if (len > 1) { mx /= len; mz /= len; }
    var fx = Math.sin(camCtl.yaw), fz = Math.cos(camCtl.yaw);
    var rx = -Math.cos(camCtl.yaw), rz = Math.sin(camCtl.yaw);
    var wx = fx * mz + rx * mx, wz = fz * mz + rz * mx;
    if (I.hit('KeyC')) p.walk = !p.walk;
    if (I.hit('KeyX')) p.handsUp = !p.handsUp;
    if (len > 0) { p.sitting = false; p.danceT = 0; if (p.handsUp && len) p.handsUp = false; }
    var w = G.WEAPONS[G.state.weapon];
    var sprint = k.ShiftLeft || k.ShiftRight;
    var speed = sprint ? 7.2 : (p.walk ? 1.7 : 4.6);
    p.aiming = !!I.mouse.down[2] && !w.melee && !w.throw && !G.build.active;
    p.scoped = p.aiming && !!w.scope;
    if (p.aiming) speed = Math.min(speed, 2.6);
    if (p.handsUp || p.sitting || p.danceT > 0) speed = 0;
    if (p.swimming) speed = Math.min(speed, 2.2);
    var jump = I.hit('Space') && !p.handsUp && !p.sitting;
    p.move(dt, wx * speed * (len ? 1 : 0), wz * speed * (len ? 1 : 0), jump);

    // richting
    var faceAim = p.aiming || G.time - (p.lastFire || -9) < 0.8 || p.punchT > 0;
    if (faceAim) p.faceTo(camCtl.yaw, dt, 22);
    else if (len > 0) p.faceTo(Math.atan2(wx, wz), dt, 12);

    // wapens kiezen
    for (var i = 0; i < 8; i++) {
      if (!G.build.active && I.hit('Digit' + (i + 1))) p.selectWeapon(G.WEAPON_ORDER[i]);
    }
    if (I.mouse.wheel && !G.build.active) {
      var owned = G.WEAPON_ORDER.filter(function (id) { return id === 'fist' || (G.state.weapons[id] && (id !== 'grenade' || G.state.grenades > 0)); });
      var idx = owned.indexOf(G.state.weapon);
      p.selectWeapon(owned[(idx + (I.mouse.wheel > 0 ? 1 : -1) + owned.length) % owned.length]);
    }
    w = G.WEAPONS[G.state.weapon];
    var id = G.state.weapon;

    // herladen
    if (p.reloading > 0) {
      p.reloading -= dt;
      if (p.reloading <= 0) {
        var need = w.mag - (G.state.mags[id] || 0);
        var take = Math.min(need, G.state.ammo[id] || 0);
        G.state.mags[id] = (G.state.mags[id] || 0) + take;
        G.state.ammo[id] -= take;
      }
    }
    function startReload() {
      if (p.reloading > 0 || w.melee || w.throw) return;
      if ((G.state.ammo[id] || 0) <= 0 || (G.state.mags[id] || 0) >= w.mag) return;
      p.reloading = w.reload;
      G.audio.sfx('reload', p.pos);
    }
    if (I.hit('KeyR')) startReload();

    p.fireT -= dt;
    var trigger = G.build.active ? false : (w.auto ? I.mouse.down[0] : I.click(0));
    if (trigger && !p.handsUp && !p.swimming) {
      p.sitting = false;
      if (w.melee) {
        if (p.punchT <= 0) { p.punchT = 0.0001; p.punchHit = false; }
      } else if (w.throw) {
        throwGrenade();
      } else if (p.reloading <= 0 && p.fireT <= 0) {
        if ((G.state.mags[id] || 0) > 0) {
          var acc = p.aiming ? 1 : 2.6;
          if (p.speed2d() > 3) acc += 1.5;
          G.combat.fire(p, id, aimTarget(w.range), acc);
          G.state.mags[id]--;
          p.fireT = 1 / w.rate;
          p.lastFire = G.time;
          p.anim.kick = 1;
          camCtl.pitch -= w.recoil * (p.aiming ? 0.6 : 1);
          camCtl.yaw += U.rand(-1, 1) * w.recoil * 0.3;
          if (w.rocket) camera.addShake(0.3);
        } else {
          G.audio.sfx('empty', p.pos);
          p.fireT = 0.3;
          startReload();
        }
      }
    }
    if (I.hit('KeyG') && G.state.grenades > 0 && !p.handsUp) throwGrenade();
    // vuisten
    if (p.punchT > 0) {
      p.punchT += dt * 3;
      if (p.punchT > 0.45 && !p.punchHit) { p.punchHit = true; G.combat.melee(p, w.dmg || 18); }
      if (p.punchT >= 1) p.punchT = 0;
    }
    if (p.throwT > 0) {
      p.throwT -= dt;
      if (p.throwT <= 0.25 && !p.thrown) {
        p.thrown = true;
        G.combat.throwGrenade(p, aimTarget(60));
        G.state.grenades--;
        if (G.state.grenades <= 0 && G.state.weapon === 'grenade') p.selectWeapon('fist');
      }
    }
    if (p.danceT > 0) p.danceT -= dt;

    var a = p.anim;
    a.speed = p.speed2d();
    a.grounded = p.grounded || p.swimming;
    a.aim = p.aiming || G.time - (p.lastFire || -9) < 0.5;
    a.weapon = p.holdType();
    a.aimPitch = -camCtl.pitch * 0.9;
    a.kick = Math.max(0, (a.kick || 0) - dt * 9);
    a.punch = p.punchT;
    a.throwing = p.throwT > 0 ? p.throwT / 0.5 : 0;
    a.handsUp = p.handsUp;
    a.dance = p.danceT > 0;
    a.seat = p.sitting ? 'passenger' : null;
    a.flee = false;
    a.crouch = false;
    p.sync(dt, a);
    if (p.sitting) {
      p.char.root.position.y -= 0.42;
    }
  }

  function throwGrenade() {
    var p = G.player;
    if (p.throwT > 0 || G.state.grenades <= 0) return;
    p.throwT = 0.5;
    p.thrown = false;
    p.lastFire = G.time;
  }

  // ---- In- en uitstappen, auto stelen ----------------------------------------------------
  function nearestEnterable() {
    var p = G.player;
    return G.vehicles.nearest(p.pos, 4.2, function (v) {
      if (v.wrecked || v.removed) return false;
      if (v.driver && v.driver.isPlayer) return false;
      if (v.isHeli && !v.landed) return false;
      return true;
    });
  }

  function enterVehicle(v) {
    var p = G.player;
    var d = v.driver;
    var N = G.npc;
    var theft = !v.owned;
    if (d && d.alive) {
      d.exitVehicle(true);
      d.ai = d.ai || {};
      if (d.team === 'cop') { d.ai.state = 'pursue'; N.addWanted(Math.max(2, N.wanted.level), 'Agent uit de auto getrokken'); }
      else {
        d.ai.state = 'flee'; d.ai.from = p.pos.clone(); d.ai.timer = 9;
        if (N.peds.indexOf(d) < 0) N.peds.push(d);
        d.say(U.pick(N.LINES.car));
      }
    } else if (d) {
      d.exitVehicle(true);
    }
    if (v.passenger && v.passenger !== G.gf.actor()) {
      var ps = v.passenger;
      ps.exitVehicle(true);
      if (ps.ai) { ps.ai.state = 'flee'; ps.ai.from = p.pos.clone(); ps.ai.timer = 8; if (N.peds.indexOf(ps) < 0 && ps.team === 'civ') N.peds.push(ps); }
    }
    if (theft && !v.stolenByPlayer) {
      G.emit('carjack', { pos: v.pos.clone(), police: !!v.spec.police });
      v.stolenByPlayer = true;
    }
    v.stolen = true;
    v.parked = false;
    v.ai = null;
    v.siren = false;
    p.enterVehicle(v, 0);
    p.aiming = false;
    p.scoped = false;
    p.sitting = false;
    G.audio.sfx('door', v.pos);
    if (v.isHeli) {
      heliSnd = G.audio.loop('heli', v.pos);
    } else {
      engineSnd = G.audio.loop('engine', v.pos);
      if (!G.audio.radioState().on && Math.random() < 0.7) G.audio.radioOn(U.randInt(G.audio.stations.length));
    }
    G.emit('enteredVehicle', v);
  }

  function exitVehicle() {
    var p = G.player;
    var v = p.vehicle;
    if (!v) return;
    var fast = v.speed() > 12 && !v.isHeli;
    p.exitVehicle(fast);
    if (fast) { p.damage(8 + v.speed() * 0.5, null, null, 'val'); p.vel.multiplyScalar(0.6); }
    if (engineSnd) { engineSnd.stop(); engineSnd = null; }
    if (heliSnd) { heliSnd.stop(); heliSnd = null; }
    G.audio.radioOff();
    G.audio.sfx('door', v.pos);
    camCtl.yaw = v.heading;
  }

  function playerDrive(dt) {
    var p = G.player, I = G.input, v = p.vehicle, k = I.keys;
    var c;
    if (v.isHeli) {
      c = {
        lift: (k.Space ? 1 : 0) - ((k.ShiftLeft || k.ShiftRight || k.ControlLeft) ? 1 : 0),
        pitch: ((k.KeyW || k.ArrowUp) ? 1 : 0) - ((k.KeyS || k.ArrowDown) ? 1 : 0),
        yaw: ((k.KeyD || k.ArrowRight) ? 1 : 0) - ((k.KeyA || k.ArrowLeft) ? 1 : 0),
        roll: (k.KeyE ? 1 : 0) - (k.KeyQ ? 1 : 0)
      };
    } else {
      c = {
        throttle: ((k.KeyW || k.ArrowUp) ? 1 : 0) - ((k.KeyS || k.ArrowDown) ? 1 : 0),
        steer: ((k.KeyA || k.ArrowLeft) ? 1 : 0) - ((k.KeyD || k.ArrowRight) ? 1 : 0),
        handbrake: !!k.Space
      };
    }
    v.update(dt, c);
    if (I.hit('KeyH') && !v.isHeli) {
      G.audio.sfx('horn', v.pos, { dur: 0.45 });
      G.npc.peds.forEach(function (ped) { if (ped.alive && ped.distTo(v.pos) < 12 && ped.ai.state === 'walk' && Math.random() < 0.3) ped.say(U.pick(['Ja ja, ik ga al!', 'Rustig!'])); });
    }
    if (I.hit('KeyR') && !v.isHeli) G.audio.radioNext();
    if (engineSnd) {
      engineSnd.setPos(v.pos);
      var rpm = Math.abs(v.vF || 0) / v.spec.max;
      var gear = rpm * 4;
      var inGear = gear - Math.floor(gear);
      engineSnd.set({ rpm: 0.15 + inGear * 0.6 + rpm * 0.35, load: Math.abs(c.throttle || 0) * (v.wrecked ? 0 : 1), base: v.spec.max > 60 ? 45 : 36, vol: v.wrecked ? 0.0001 : 0.32 });
    }
    if (heliSnd) { heliSnd.setPos(v.pos); heliSnd.set({ rotor: v.rotor }); }
    var a = p.anim;
    a.speed = 0;
    p.sync(dt, a);
  }

  // ---- Interacties (E) ---------------------------------------------------------------------
  function interaction() {
    var p = G.player;
    var W = G.world;
    var S = W.spots;
    if (p.vehicle) {
      if (!p.vehicle.isHeli && p.distTo(S.spuiterij.pos) < 5) {
        return { label: 'Overspuiten & repareren (€ 500, wanted weg)', fn: respray };
      }
      var md = G.missions.nearbyStart(p.vehicle.pos);
      if (md && md.vehicle) return { label: 'Start missie: ' + md.title, fn: function () { UI.missionIntro(md); } };
      return null;
    }
    if (G.gf.near()) return { label: 'Praten met Mika', fn: G.gf.interact };
    var md2 = G.missions.nearbyStart(p.pos);
    if (md2) return { label: 'Start missie: ' + md2.title, fn: function () { UI.missionIntro(md2); } };
    var near = function (name, r) { var s = S[name]; return s && p.distTo(s.pos) < (r || s.r) && Math.abs(p.pos.y - s.pos.y) < 2; };
    var B = G.missions.bank;
    if (near('bank.vault') && B.state === 'idle') return { label: 'Kluis kraken (overval!)', fn: G.missions.startBankJob };
    if (near('bank.loot') && B.state === 'open') return { label: 'Buit pakken', fn: G.missions.lootBank };
    if (near('bank.teller')) return { label: 'Praten met de bank', fn: function () { UI.dialog({ who: 'Baliemedewerker', text: 'Welkom bij de Goudmunt Bank. Onze kluis is de veiligste van Havenstad. Echt waar. Kijk maar niet te lang naar die deur daar.', options: [{ label: 'Bedankt.' }] }); } };
    if (near('kleding')) return { label: 'Pashokje: kleding aanpassen', fn: function () { UI.openClothes(false); } };
    if (near('wapens')) return { label: 'Wapens & munitie kopen', fn: UI.openGuns };
    if (near('cadeau')) return { label: 'Cadeaus kopen', fn: UI.openGifts };
    if (near('ramen')) return { label: 'Ramen eten (€ 25)', fn: eatRamen };
    if (near('ziekenhuis')) return { label: 'Ziekenhuis: genezen (€ 150)', fn: hospital };
    if (near('apartment')) return { label: 'Appartement', fn: apartmentMenu };
    if (near('arcade')) return { label: 'Metro Rush spelen', fn: playArcade };
    if (near('park.bench') && !p.sitting) return { label: 'Op het bankje zitten (tijd versnellen)', fn: function () { p.sitting = true; } };
    for (var i = 0; i < 4; i++) {
      if (near('super' + i)) return { label: 'Snacks kopen (€ 12, +30 gezondheid)', fn: snack };
    }
    if (G.build.inPlot(p.pos) && !G.build.active) return { label: 'Bouwmodus', key: 'B', fn: function () { G.build.toggle(true); } };
    return null;
  }

  function respray() {
    var v = G.player.vehicle;
    var watching = G.npc.cops.some(function (c) { return c.alive && c.distTo(v.pos) < 40; });
    if (watching) { UI.toast('Niet nu: er kijkt politie mee!', 'bad'); G.audio.sfx('error'); return; }
    if (!G.spend(500, 'Spuit & Weg')) return;
    G.npc.clearWanted('Nieuwe kleur, nieuwe kansen: wanted-niveau weg.');
    v.health = v.maxHealth;
    v.burn = 0;
    if (v.paint && !v.spec.police && !v.spec.taxi) v.paint.color.set(U.pick(G.CAR_COLORS));
    G.fx.dust(v.pos, 3);
  }

  function eatRamen() {
    var p = G.player;
    if (!G.spend(25, 'Ramen')) return;
    p.heal(50);
    G.audio.sfx('heal');
    var gfa = G.gf.actor();
    if (gfa && G.gf.state().following && gfa.distTo(p.pos) < 8) {
      G.gf.say('Samen ramen eten is het beste. 🍜', 'blij');
      if (G.gf.state().ramenDay !== G.state.day) { G.gf.state().ramenDay = G.state.day; G.gf.addAffection(2); }
    } else UI.toast('🍜 Heerlijk! +50 gezondheid', 'good');
  }

  function snack() {
    if (G.player.health >= 100) { UI.toast('Je zit al vol.'); return; }
    if (!G.spend(12, 'Snacks')) return;
    G.player.heal(30);
    G.audio.sfx('heal');
  }

  function hospital() {
    var p = G.player;
    if (p.health >= 100) { UI.toast('Je bent kerngezond!'); return; }
    if (!G.spend(150, 'Ziekenhuis')) return;
    p.health = 100;
    G.audio.sfx('heal');
    UI.toast('✚ Volledig genezen', 'good');
  }

  function apartmentMenu() {
    UI.menu('Jouw appartement', 'Thuis. Opslaan, uitrusten en omkleden.', [
      { label: '💾 Spel opslaan', button: 'Opslaan', fn: function () { UI.toast(G.saveGame() ? '💾 Opgeslagen' : 'Opslaan mislukt', 'good'); } },
      { label: '🌅 Slapen tot 08:00', small: 'Volledig herstel', button: 'Slapen', fn: function () { sleepUntil(8); } },
      { label: '🌙 Slapen tot 20:00', small: 'Volledig herstel', button: 'Slapen', fn: function () { sleepUntil(20); } },
      { label: '👕 Garderobe', small: 'Gekochte kleding gratis wisselen', button: 'Openen', fn: function () { setTimeout(function () { UI.openClothes(true); }, 30); } }
    ]);
  }

  function sleepUntil(hour) {
    if (G.npc.wanted.level) { UI.toast('Je kunt niet slapen met de politie op je hielen!', 'bad'); return; }
    var t = G.state.time % 1440;
    var target = hour * 60;
    var add = target - t;
    if (add <= 30) add += 1440;
    advanceTime(add);
    G.player.health = 100;
    UI.bigMessage('Goedemorgen, Havenstad', 'Dag ' + G.state.day + ' · ' + G.clockText(), '#ffd54f', 3);
    G.saveGame();
  }

  function playArcade() {
    G.saveGame();
    UI.toast('Metro Rush opent in een nieuw tabblad. Je spel is opgeslagen.');
    window.open('metro.html', '_blank');
  }

  // ---- Tijd ---------------------------------------------------------------------------------
  function advanceTime(minutes) {
    G.state.time += minutes;
    while (G.state.time >= 1440) {
      G.state.time -= 1440;
      G.state.day++;
      newDay();
    }
  }

  function newDay() {
    G.build.daily();
    G.missions.resetBank();
    G.emit('newDay', G.state.day);
  }

  // ---- Dood / arrestatie / respawn -------------------------------------------------------
  var respawnT = 0, respawnKind = null;

  function onWasted() {
    if (respawnKind) return;
    respawnKind = 'wasted';
    respawnT = 4.5;
    UI.bigMessage('NEERGEGAAN', 'Je wordt naar het ziekenhuis gebracht…', '#ff3b3b', 4.4);
    G.audio.sfx('fail');
    G.emit('wasted');
  }

  function onBusted() {
    if (respawnKind || !G.player.alive) return;
    respawnKind = 'busted';
    respawnT = 3.5;
    var p = G.player;
    if (p.vehicle) exitVehicle();
    p.handsUp = true;
    UI.bigMessage('GEARRESTEERD', 'De politie neemt je mee naar het bureau…', '#64b5f6', 3.4);
    G.audio.sfx('fail');
  }

  function respawn() {
    var p = G.player;
    var kind = respawnKind;
    respawnKind = null;
    if (p.vehicle) exitVehicle();
    G.npc.reset();
    p.alive = true;
    p.health = 100;
    p.armor = 0;
    p.fall = null;
    p.deadTime = 0;
    p.char.deadSeed = null;
    p.handsUp = false;
    p.vel.set(0, 0, 0);
    p.char.root.rotation.set(0, 0, 0);
    var at = kind === 'busted' ? G.world.policePoint : G.world.hospitalPoint;
    p.pos.copy(at);
    p.heading = 0;
    camCtl.yaw = 0;
    if (kind === 'busted') {
      var fine = Math.min(G.state.money, Math.round(250 + G.state.money * 0.12));
      G.addMoney(-fine, 'Boete');
      Object.keys(G.state.ammo).forEach(function (k2) { G.state.ammo[k2] = 0; G.state.mags[k2] = 0; });
      G.state.grenades = 0;
      UI.toast('Je munitie is in beslag genomen.', 'bad');
    } else {
      var bill = Math.min(G.state.money, Math.round(500 + G.state.money * 0.05));
      G.addMoney(-bill, 'Ziekenhuisrekening');
    }
    advanceTime(180);
    G.state.weapon = 'fist';
    p.refreshWeapon();
  }

  // ---- Geld op straat ------------------------------------------------------------------------
  var cashGeo = new T.BoxGeometry(0.35, 0.12, 0.2);
  var cashMat = new T.MeshStandardMaterial({ color: 0x2e7d32, emissive: 0x1b5e20, emissiveIntensity: 0.6, roughness: 0.6 });
  G.on('dropCash', function (e) {
    var m = new T.Mesh(cashGeo, cashMat);
    m.position.set(e.pos.x, G.world.ground(e.pos.x, e.pos.z) + 0.25, e.pos.z);
    scene.add(m);
    pickups.push({ mesh: m, amount: e.amount, t: 60 });
  });

  function updatePickups(dt) {
    var p = G.player;
    for (var i = pickups.length - 1; i >= 0; i--) {
      var k = pickups[i];
      k.t -= dt;
      k.mesh.rotation.y += dt * 2;
      k.mesh.position.y += Math.sin(G.time * 3) * 0.002;
      if (!p.vehicle && p.distTo(k.mesh.position) < 1.3) {
        G.addMoney(k.amount, 'Opgeraapt');
        G.audio.sfx('pickup');
        k.t = 0;
      }
      if (k.t <= 0) { scene.remove(k.mesh); pickups.splice(i, 1); }
    }
  }

  // ---- Hoofdupdate ------------------------------------------------------------------------
  var lastPos = new T.Vector3();
  var promptCache = '';
  var curInteraction = null;

  function update(dt) {
    var p = G.player;
    var I = G.input;
    var timeScale = p.sitting ? 20 : 1;
    advanceTime(dt * timeScale);

    var inputOn = !UI.modal && !respawnKind;
    if (respawnKind) {
      respawnT -= dt;
      if (!p.alive) p.sync(dt);
      else if (respawnKind === 'busted') { p.move(dt, 0, 0, false); p.anim.handsUp = true; p.anim.speed = 0; p.sync(dt, p.anim); }
      if (respawnT <= 0) respawn();
    } else if (!p.alive) {
      onWasted();
      p.sync(dt);
    } else if (inputOn) {
      if (I.hit('KeyF')) {
        if (p.vehicle) {
          if (!p.vehicle.isHeli || p.vehicle.landed || p.vehicle.pos.y - G.world.surface(p.vehicle.pos.x, p.vehicle.pos.z, p.vehicle.pos.y) < 8) exitVehicle();
          else UI.toast('Te hoog om uit te stappen! Land eerst.', 'bad');
        } else {
          var v = nearestEnterable();
          if (v) enterVehicle(v);
        }
      }
      if (I.hit('KeyB') && !p.vehicle && G.build.inPlot(p.pos)) G.build.toggle();
      if (p.vehicle) playerDrive(dt); else playerFoot(dt);
      // interactie
      curInteraction = interaction();
      if (curInteraction && I.hit(curInteraction.key === 'B' ? 'KeyB_x' : 'KeyE')) {
        curInteraction.fn();
        curInteraction = null;
      }
      // overgeven
      if (p.handsUp && G.npc.wanted.level > 0 && G.npc.cops.some(function (c) { return c.alive && c.distTo(p.pos) < 15; })) onBusted();
    } else {
      // tijdens een menu: speler blijft staan
      if (p.vehicle) { p.vehicle.update(dt, { throttle: 0, steer: 0, handbrake: true }); p.sync(dt, p.anim); }
      else { p.move(dt, 0, 0, false); p.anim.speed = 0; p.anim.aim = false; p.sync(dt, p.anim); }
      curInteraction = null;
    }
    p.hurtFlash = Math.max(0, (p.hurtFlash || 0) - dt * 1.5);
    if (p.hurtT > 0) { p.hurtFlash = Math.min(0.8, (p.hurtFlash || 0) + 0.5); p.hurtT = 0; }

    G.npc.update(dt);
    G.gf.update(dt);
    G.combat.update(dt);
    G.missions.update(dt);
    G.missions.updateRobberies(dt);
    G.build.update(dt);
    G.fx.update(dt);
    updatePickups(dt);

    // statistiek
    var moved = p.pos.distanceTo(lastPos);
    if (moved < 50) G.state.stats.distance += moved;
    lastPos.copy(p.pos);

    // prompt
    var ptxt = '';
    if (curInteraction) ptxt = '<kbd>' + (curInteraction.key || 'E') + '</kbd> ' + curInteraction.label;
    else if (!p.vehicle && p.alive && !UI.modal) {
      var nv = nearestEnterable();
      if (nv) ptxt = '<kbd>F</kbd> ' + (nv.driver && nv.driver.alive ? 'Auto stelen' : (nv.owned ? 'Instappen' : (nv.isHeli ? 'Helikopter stelen' : 'Instappen (diefstal)'))) + ': ' + nv.spec.name;
    } else if (p.vehicle && !UI.modal) {
      ptxt = '';
    }
    if (ptxt !== promptCache) { promptCache = ptxt; UI.prompt(ptxt); }
  }

  function render(dt) {
    var focus = G.player ? (G.player.vehicle ? G.player.vehicle.pos : G.player.pos) : new T.Vector3(0, 0, 50);
    G.env.update(dt, focus, camera);
    G.world.update(dt, focus);
    var night = G.uniforms.uNight.value;
    renderer.toneMappingExposure = 1.0 + night * 0.3;
    if (bloom) bloom.strength = 0.22 + night * 0.55;
    if (G.player && G.playing) {
      var p = G.player;
      var nearWater = U.clamp(1 - (690 - p.pos.z) / 120, 0, 1);
      G.audio.ambient(dt, night, nearWater, Math.max(0, p.pos.y));
    }
    G.audio.update(camera);
    if (composer) composer.render(); else renderer.render(scene, camera);
  }

  function frame(now) {
    window.requestAnimationFrame(frame);
    var dt = Math.min(0.05, Math.max(0.0001, (now - last) / 1000));
    last = now;
    step(dt, true);
  }

  function simPaused() {
    return G.paused || UI.modal === 'pause' || UI.modal === 'map' || UI.modal === 'settings' || UI.modal === 'controls';
  }

  function step(dt, doRender) {
    G.uniforms.uTime.value += dt;
    if (G.playing && !simPaused()) {
      G.time += dt;
      update(dt);
      UI.update(dt);
      var cine = !document.getElementById('cine').classList.contains('hidden');
      camCtl.mode = UI.modal === 'clothes' ? 'wardrobe' : (cine ? 'cinematic' : 'follow');
      updateCamera(dt);
    } else if (!G.playing) {
      titleCamera(dt);
    }
    if (doRender) render(dt);
    G.input.endFrame();
  }

  // ---- Toetsen voor menu's -------------------------------------------------------------------
  G.on('key', function (e) {
    if (!G.playing) return;
    if (e.code === 'Escape') {
      if (UI.modal) {
        var was = UI.modal;
        UI.closeModal();
        if (was === 'pause') G.resume();
        return;
      }
      if (G.build.active) { G.build.toggle(false); return; }
      G.pause();
      return;
    }
    if (UI.modal && UI.modal !== 'phone' && UI.modal !== 'map') return;
    if (e.code === 'Tab') { e.preventDefault(); if (UI.modal === 'phone') UI.closeModal(); else UI.openPhone(); }
    if (e.code === 'KeyM') { if (UI.modal === 'map') UI.closeModal(); else UI.openMap(); }
  });

  G.on('pointerlost', function () {
    if (G.playing && !UI.modal && !G.paused) G.pause();
  });

  G.pause = function () {
    G.paused = true;
    UI.showPause();
  };
  G.resume = function () {
    G.paused = false;
    if (UI.modal) UI.closeModal();
    G.input.lock();
  };

  G.wantsPointerLock = function () { return G.playing && !UI.modal && !G.paused; };

  G.on('busted', onBusted);
  G.on('vehicleExploded', function (e) {
    var p = G.player;
    if (p.vehicle === e.v) {
      exitVehicle();
      p.damage(e.v.isHeli ? 300 : 150, e.attacker, new T.Vector3(0, 1, 0), 'explosie');
    }
  });
  G.on('vehicleSunk', function (v) { if (G.player.vehicle === v) { exitVehicle(); UI.toast('Je voertuig zinkt! Zwem naar de kant.', 'bad'); } });
  G.on('buildingDestroyed', function (b) {
    G.state.stats.buildingsDestroyed++;
    if (b === G.world.factory) return;
    UI.toast('💥 Gebouw ingestort!', 'warn');
  });
  G.on('actorDamaged', function (e) {
    if (e.actor.isPlayer) { G.player.hurtFlash = Math.min(0.9, (G.player.hurtFlash || 0) + e.amount / 40); camera.addShake(Math.min(0.4, e.amount / 80)); }
  });

  // ---- Opslaan ------------------------------------------------------------------------------
  G.on('save', function (s) {
    var p = G.player;
    if (!p) return;
    s.pos = [p.pos.x, p.pos.y, p.pos.z];
    if (p.vehicle) { s.pos = [p.vehicle.pos.x + 3, p.vehicle.pos.y + 1, p.vehicle.pos.z + 3]; }
    if (!p.alive || respawnKind) s.pos = [G.world.hospitalPoint.x, 0.2, G.world.hospitalPoint.z];
    s.heading = p.heading;
    s.health = Math.max(30, p.health);
    s.armor = p.armor;
  });

  var autosaveT = 0;
  setInterval(function () {
    if (G.playing && !G.paused && !G.npc.wanted.level && !G.missions.active && G.player && G.player.alive) {
      autosaveT++;
      G.saveGame();
    }
  }, 90000);

  // ---- Start -----------------------------------------------------------------------------
  G.startGame = function (isNew) {
    if (isNew) {
      G.state = G.newState();
    } else if (!G.loadGame()) {
      G.state = G.newState();
    }
    G.audio.init();
    G.audio.setVolume(G.settings.volume);
    G.audio.setMusic(G.settings.music);
    var p = G.player || createPlayer();
    p.char.setLook(G.state.outfit);
    p.refreshWeapon();
    p.pos.set(G.state.pos[0], G.state.pos[1], G.state.pos[2]);
    p.pos.y = G.world.surface(p.pos.x, p.pos.z, p.pos.y + 2);
    p.heading = G.state.heading;
    p.health = G.state.health;
    p.armor = G.state.armor;
    camCtl.yaw = p.heading;
    lastPos.copy(p.pos);
    G.gf.init();
    G.build.init();
    G.missions.refreshMarkers();
    G.playing = true;
    G.paused = false;
    UI.hideTitle();
    G.input.lock();
    if (isNew) {
      UI.bigMessage('HAVENSTAD', 'Welkom in de stad. Alles is hier te koop… of te pakken.', '#ffd54f', 5);
      setTimeout(function () { UI.toast('Tip: druk op Tab voor je telefoon en M voor de kaart.', 'good'); }, 5500);
      setTimeout(function () { UI.toast('Gele, paarse en blauwe lichtzuilen zijn missies. Je kiest zelf de volgorde!', 'good'); }, 10000);
      setTimeout(function () { UI.toast('Druk op F bij een auto om in te stappen (of hem te stelen…).', 'good'); }, 15000);
    } else {
      UI.toast('Welkom terug! Dag ' + G.state.day + ', ' + G.clockText(), 'good');
    }
  };

  // ---- Testhaakjes (handig om te debuggen in de console) -----------------------------------
  G.debug = {
    teleport: function (x, z) { var p = G.player; var g = G.world.ground(x, z); if (p.vehicle) { p.vehicle.pos.set(x, g, z); } else { p.pos.set(x, G.world.surface(x, z, g + 0.5), z); p.vel.set(0, 0, 0); } },
    money: function (n) { G.addMoney(n || 10000, 'Debug'); },
    weapons: function () {
      G.WEAPON_ORDER.forEach(function (id) { var w = G.WEAPONS[id]; if (w.melee) return; G.state.weapons[id] = true; if (!w.throw) { G.state.mags[id] = w.mag; G.state.ammo[id] = (w.ammoPack || 10) * 3; } });
      G.state.grenades += 10;
    },
    time: function (h) { G.state.time = h * 60; },
    step: function (n, dt) { for (var i = 0; i < (n || 1); i++) step(dt || 1 / 30, false); },
    render: function () { render(0.016); }
  };

  // ---- Boot ----------------------------------------------------------------------------------
  function boot() {
    try {
      initRenderer();
    } catch (e) {
      document.getElementById('fatal').textContent = 'WebGL wordt niet ondersteund in deze browser. Zet hardwareversnelling aan en probeer opnieuw.';
      document.getElementById('fatal').classList.remove('hidden');
      return;
    }
    G.env.create(scene, renderer, Q);
    G.fx.init(scene);
    G.fx.onResize(window.innerHeight, camera.fov, renderer.getPixelRatio());
    G.world.build();
    G.input.attach(renderer.domElement);
    UI.init();
    G.npc.init();
    G.missions.init();
    G.ui.showTitle();
    document.getElementById('loading').classList.add('hidden');
    G.ready = true;
    window.requestAnimationFrame(frame);
  }

  G.boot = boot;
})();
