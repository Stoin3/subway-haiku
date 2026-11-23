/*
 * girlfriend.js - relatiesysteem met Mika Hoshino, een origineel anime-geïnspireerd
 * personage (eigen ontwerp). Genegenheid, niveaus, dagschema, gesprekken met keuzes,
 * cadeaus met voorkeuren, dates, meelopen/meerijden, berichtjes en reacties op jouw gedrag.
 */
(function () {
  'use strict';

  var G = window.G, T = G.T, U = G.U;
  var GF = G.gf = {};

  var LOOK = {
    build: 'v', skin: '#f9e0d0', face: 'anime', eyeColor: '#8e5bd6', lips: '#d0607a',
    hair: 'staartjes', hairColor: '#c7b2f0', hairclip: '#ffd54f', hat: 'geen', hatColor: '#ffffff',
    top: 'hoodie', topColor: '#ffc1dc', pants: 'rok', pantsColor: '#3b3f58', tights: '#2b2b3a', socks: '#ffffff',
    shoes: 'sneakers', shoesColor: '#ffffff', glasses: 'geen', height: 0.94
  };
  var DATE_LOOK = Object.assign({}, LOOK, { top: 'jurk', topColor: '#7e57c2', tights: null, socks: null, shoes: 'nette', shoesColor: '#212121' });
  var VOICE = { pitch: 265, rate: 8.6, formant: 1.22, seed: 3.3, vol: 0.75 };
  var NAME = 'Mika';
  var COLOR = '#ff8fc8';

  GF.STAGES = ['Vreemden', 'Bekenden', 'Vrienden', 'Daten', 'Relatie'];
  GF.GIFTS = [
    { id: 'bubbelthee', name: 'Bubbelthee', price: 8, value: 3, icon: '🧋' },
    { id: 'bloemen', name: 'Boeket lavendel', price: 45, value: 9, icon: '💐', fav: true },
    { id: 'boek', name: 'Sterrenatlas (boek)', price: 30, value: 6, icon: '📘' },
    { id: 'knuffel', name: 'Knuffelkat', price: 65, value: 10, icon: '🐱' },
    { id: 'ketting', name: 'Zilveren sterketting', price: 600, value: 20, icon: '✨', fav: true },
    { id: 'telescoop', name: 'Telescoop', price: 1400, value: 28, icon: '🔭', fav: true },
    { id: 'energiedrank', name: 'Energiedrank', price: 5, value: -4, icon: '⚡' }
  ];

  var DATES = {
    ramen: { name: 'Diner bij Ramen Neon', from: 18, to: 23, cost: 60, gain: 15 },
    strand: { name: 'Zonsondergang op het strand', from: 18, to: 21, cost: 0, gain: 18 },
    arcade: { name: 'Avondje arcade', from: 12, to: 24, cost: 20, gain: 10 }
  };
  GF.DATES = DATES;

  var actor = null;
  var st = null;
  var talkLock = 0;
  var commentT = 0;
  var speedT = 0;
  var lastPlace = null;

  function defaultState() {
    return {
      met: false, affection: 0, stage: 0, talksDay: 0, talkCount: 0, lastTalkDay: 0,
      gifts: {}, giftDay: {}, inventory: {}, dates: 0, following: false, pendingDate: null,
      upsetUntil: 0, lastSeenDay: 1, messages: [], lastMsgHour: -1, outfitNoticed: '', allowanceDay: 0
    };
  }

  GF.state = function () { return st; };
  GF.actor = function () { return actor; };

  function stageFor(a, dates) {
    if (a >= 85 && dates >= 3) return 4;
    if (a >= 60 && dates >= 1) return 3;
    if (a >= 35) return 2;
    if (a >= 15) return 1;
    return 0;
  }

  GF.addAffection = function (n, silent) {
    var before = st.stage;
    st.affection = U.clamp(st.affection + n, 0, 100);
    st.stage = stageFor(st.affection, st.dates);
    if (!silent) {
      G.emit('gfAffection', { delta: n, value: st.affection });
      if (n > 0) { G.audio.sfx('heart'); if (actor) G.fx.sparkle(actor.pos.clone().setY(actor.pos.y + 1.9)); }
    }
    if (st.stage > before) {
      G.emit('toast', { text: '💗 Mika en jij zijn nu: ' + GF.STAGES[st.stage], kind: 'love' });
      G.audio.sfx('mission');
      if (st.stage === 2) GF.message('Hé! Ik vond het echt leuk om met je te praten. Als je wilt, loop ik weleens met je mee door de stad. 😊');
      if (st.stage === 3) GF.message('Oké… ik moet iets toegeven. Ik kijk de hele dag uit naar jouw berichtjes. 💜');
      if (st.stage === 4) GF.message('Dus… wij zijn nu officieel samen? Ik ben zó blij. Ik heb elke dag wat zakgeld voor je, voor als je het nodig hebt. 💞');
    }
  };

  GF.message = function (text) {
    var m = { from: NAME, text: text, time: G.clockText(), day: G.state.day, read: false };
    st.messages.unshift(m);
    if (st.messages.length > 30) st.messages.pop();
    G.audio.sfx('phone');
    G.emit('phoneMessage', m);
  };

  // ---- Dagschema: waar is Mika? -------------------------------------------------------
  function scheduledPlace() {
    var h = Math.floor(G.state.time / 60) % 24;
    var pd = st.pendingDate;
    if (pd && pd.day === G.state.day && h >= DATES[pd.place].from - 1 && h < DATES[pd.place].to) return pd.place;
    if (h >= 9 && h < 14) return 'park';
    if (h >= 14 && h < 18) return 'kleding';
    if (h >= 18 && h < 23) return 'ramen';
    return 'thuis';
  }

  function placePos(place) {
    var W = G.world;
    if (place === 'park') return W.parkBench.clone();
    if (place === 'kleding') { var k = W.specials.kleding; return new T.Vector3(k.x - 4, 0.2, k.z + 1.5); }
    if (place === 'ramen') { var r = W.specials.ramen; return new T.Vector3(r.x + 1.6, 0.2, r.z + 2.2); }
    if (place === 'arcade') { var a = W.specials.arcade; return new T.Vector3(a.x + 2, 0.2, a.z); }
    if (place === 'strand') return new T.Vector3(40, 0.2, 660);
    return null;
  }
  GF.placePos = placePos;

  function ensureActor() {
    if (actor) return actor;
    actor = new G.Actor({ look: LOOK, team: 'gf', name: NAME, health: 100 });
    actor.voice = VOICE;
    actor.invulnerable = true;
    actor.ai = { state: 'idle' };
    actor.anim = { speed: 0, grounded: true };
    return actor;
  }

  function removeActor() {
    if (!actor) return;
    actor.remove();
    actor = null;
  }

  GF.say = function (text, expr) {
    if (!actor) return;
    actor.say(text, { who: NAME, color: COLOR, range: 60 });
    if (expr) {
      actor.char.setExpression(expr);
      clearTimeout(GF._exprT);
      GF._exprT = setTimeout(function () { if (actor) actor.char.setExpression('neutraal'); }, 3500);
    }
  };

  // ---- Gesprekken -------------------------------------------------------------------------
  var SMALLTALK = [
    ['Wist je dat je vanaf het strand soms de Melkweg kunt zien? Als de stadslichten niet te fel zijn tenminste.', 2],
    ['Ik teken in mijn vrije tijd. Vooral sterrenstelsels en katten. Soms katten ín sterrenstelsels.', 2],
    ['Die nieuwe ramen-tent heeft echt de beste bouillon van Havenstad. Geloof me, ik heb ze allemaal geprobeerd.', 2],
    ['Ik spaar voor een telescoop… maar elke keer koop ik weer bubbelthee. Oeps.', 2],
    ['Lavendel is mijn lievelingskleur. Het ruikt rustig, snap je?', 2],
    ['Soms zit ik uren in het park gewoon wolken te tekenen. Is dat raar?', 2],
    ['Heb je al eens Metro Rush gespeeld in de arcade? Mijn highscore is… geheim.', 2]
  ];

  function hour() { return Math.floor(G.state.time / 60) % 24; }

  function greeting() {
    var h = hour();
    if (!st.met) return 'Oh! Hoi… sorry, ik zat even in mijn eigen wereldje. Ik ben Mika. En jij bent…?';
    var tod = h < 12 ? 'Goedemorgen' : (h < 18 ? 'Hoi' : 'Goedenavond');
    var lines = [
      [tod + '! Wat leuk dat je er bent.', tod + '. Oh, hey jij.', tod + '…'],
      [tod + '! Ik dacht net aan je.', tod + '! Daar ben je weer. 😊'],
      [tod + '! Ik had al gehoopt dat je langs zou komen. 💜', 'Daar is mijn favoriete persoon!']
    ];
    var tier = st.stage >= 3 ? 2 : (st.stage >= 1 ? 1 : 0);
    return U.pick(lines[tier]);
  }

  function outfitComment() {
    var o = G.state.outfit;
    var key = [o.top, o.topColor, o.hat, o.glasses].join('|');
    if (st.outfitNoticed === key) return null;
    var c = new T.Color(o.topColor);
    var hsl = {};
    c.getHSL(hsl);
    var purple = hsl.h > 0.68 && hsl.h < 0.85 && hsl.s > 0.2;
    st.outfitNoticed = key;
    if (purple) return ['Wacht… je draagt lavendel?! Heb je dat voor mij gedaan? 💜', 6];
    if (o.top === 'hoodie') return ['Leuke hoodie! We matchen bijna. Hihi.', 3];
    if (o.top === 'pak') return ['Wow, in pak! Ga je naar een sollicitatie… of probeer je indruk op mij te maken? 😏', 4];
    if (o.top === 'vest') return ['Eh… waarom draag je een kogelwerend vest? Moet ik me zorgen maken?', -2];
    if (o.glasses === 'zonnebril' && hour() >= 20) return ['Zonnebril… om deze tijd? Je bent echt een apart geval.', 1];
    return null;
  }

  // ---- Dialoog -------------------------------------------------------------------------------
  GF.interact = function () {
    if (!actor || talkLock > 0) return;
    if (G.time < st.upsetUntil) {
      GF.say(U.pick(['Ik wil nu even niet praten.', 'Laat me even met rust, oké?', 'Na wat ik je heb zien doen…? Nee.']), 'boos');
      return;
    }
    actor.faceTo(Math.atan2(G.player.pos.x - actor.pos.x, G.player.pos.z - actor.pos.z), 1, 100);
    var first = !st.met;
    GF.say(greeting(), 'blij');
    if (first) {
      st.met = true;
      GF.addAffection(3);
    }
    st.lastSeenDay = G.state.day;
    openMenu();
  };

  function openMenu() {
    var opts = [];
    var day = G.state.day;
    if (st.lastTalkDay !== day) { st.lastTalkDay = day; st.talksDay = 0; }
    opts.push({ label: '💬 Kletsen', fn: talk });
    opts.push({ label: '🌸 Compliment geven', fn: compliment });
    var inv = Object.keys(st.inventory).filter(function (k) { return st.inventory[k] > 0; });
    if (inv.length) opts.push({ label: '🎁 Cadeau geven', fn: giftMenu });
    if (st.stage >= 2) opts.push({ label: st.following ? '👋 Ga maar even je eigen gang' : '🚶 Loop je met me mee?', fn: toggleFollow });
    if (st.stage >= 2) opts.push({ label: '💕 Vragen voor een date', fn: dateMenu });
    var pd = st.pendingDate;
    if (pd && pd.day === day && isAtPlace(pd.place) && hour() >= DATES[pd.place].from && hour() < DATES[pd.place].to) {
      opts.unshift({ label: '✨ Date beginnen: ' + DATES[pd.place].name, fn: startDate });
    }
    if (st.stage >= 3) opts.push({ label: '💃 Samen dansen', fn: dance });
    opts.push({ label: 'Doei!', fn: function () { GF.say(U.pick(['Doei! Tot snel!', 'Pas goed op jezelf, oké?', 'Tot later! 👋']), 'blij'); } });
    G.ui.dialog({
      who: NAME,
      color: COLOR,
      sub: GF.STAGES[st.stage] + ' · ' + Math.round(st.affection) + '/100 💗',
      text: 'Wat wil je doen?',
      options: opts
    });
  }

  function talk() {
    st.talkCount++;
    if (st.talksDay >= 3) {
      GF.say(U.pick(['We hebben vandaag al zoveel gekletst, haha. Mijn sociale batterij is bijna leeg.', 'Morgen weer verder? Ik ben een beetje moe.']));
      return;
    }
    st.talksDay++;
    var oc = outfitComment();
    if (oc) {
      GF.say(oc[0], oc[1] > 0 ? 'blij' : 'boos');
      GF.addAffection(oc[1]);
      return;
    }
    var line = SMALLTALK[(st.talkCount + G.state.day) % SMALLTALK.length];
    GF.say(line[0], 'blij');
    // een vraag terug met keuzes
    setTimeout(function () {
      if (!actor) return;
      var q = U.pick([
        { q: 'En jij? Wat doe jij eigenlijk de hele dag?', a: [['Ik werk hard aan mijn toekomst.', 3, 'Dat vind ik knap. Echt.'], ['Ik doe vooral… dingen die het daglicht niet verdragen.', -3, 'Oké… dat klinkt eng.'], ['Ik verken de stad. Er is zoveel te zien.', 2, 'Ooh, net als ik!']] },
        { q: 'Kijk jij weleens naar de sterren?', a: [['Elke nacht, als het helder is.', 4, 'Echt?! We moeten samen gaan kijken!'], ['Nee, niet echt.', 0, 'Dan laat ik het je een keer zien.'], ['Sterren? Ik kijk liever naar jou.', 3, 'Haha, jij… stop. 😳']] },
        { q: 'Ramen of sushi?', a: [['Ramen, natuurlijk!', 3, 'Goed antwoord. Juiste antwoord.'], ['Sushi.', 1, 'Hm. Ik zal het je vergeven.'], ['Allebei, tegelijk.', 2, 'Haha, chaos. Ik hou ervan.']] }
      ]);
      G.ui.dialog({
        who: NAME, color: COLOR, text: q.q,
        options: q.a.map(function (ans) {
          return { label: ans[0], fn: function () { GF.say(ans[2], ans[1] >= 0 ? 'blij' : 'boos'); GF.addAffection(ans[1]); } };
        })
      });
    }, 2600);
  }

  function compliment() {
    var s = st.stage;
    var opts = [
      { label: 'Je haar is echt mooi.', v: s >= 1 ? 3 : 1, r: ['Dankjewel! Het kost elke ochtend een half uur, haha.', 'Lavendel is mijn ding.'] },
      { label: 'Je hebt een mooie lach.', v: s >= 2 ? 4 : -1, r: s >= 2 ? ['O-oh… dankje. Nu bloos ik. 😳'] : ['Eh… we kennen elkaar amper, maar oké?'] },
      { label: 'Je bent slimmer dan iedereen die ik ken.', v: 3, r: ['Echt? Ik weet gewoon veel over sterren en ramen.'] },
      { label: 'Ben jij een parkeerboete? Want je hebt "mooi" overal op je staan.', v: s >= 3 ? 2 : -2, r: s >= 3 ? ['Hahaha, dat is zó slecht. Ik vind het geweldig.'] : ['…Was dat een versiertruc? Oef.'] }
    ];
    G.ui.dialog({
      who: NAME, color: COLOR, text: 'Wat wil je zeggen?',
      options: opts.map(function (o) {
        return { label: o.label, fn: function () {
          var today = G.state.day;
          if (st.complDay === today) { GF.say('Haha, je blijft maar complimentjes geven. Zo word ik nog verwaand.'); return; }
          st.complDay = today;
          GF.say(U.pick(o.r), o.v > 0 ? 'blij' : 'boos');
          GF.addAffection(o.v);
        } };
      })
    });
  }

  function giftMenu() {
    var opts = [];
    GF.GIFTS.forEach(function (g) {
      var n = st.inventory[g.id] || 0;
      if (n <= 0) return;
      opts.push({ label: g.icon + ' ' + g.name + ' (' + n + ')', fn: function () { give(g); } });
    });
    opts.push({ label: 'Laat maar', fn: function () {} });
    G.ui.dialog({ who: NAME, color: COLOR, text: 'Welk cadeau wil je geven?', options: opts });
  }

  function give(g) {
    st.inventory[g.id]--;
    var today = G.state.day;
    var times = st.giftDay[g.id] === today ? (st.gifts[g.id + '_today'] || 0) : 0;
    st.giftDay[g.id] = today;
    st.gifts[g.id + '_today'] = times + 1;
    st.gifts[g.id] = (st.gifts[g.id] || 0) + 1;
    var v = g.value / (1 + times * 1.5);
    var lines = {
      bubbelthee: ['Bubbelthee! Jij weet de weg naar mijn hart. 🧋'],
      bloemen: ['Lavendel?! Hoe wist je dat? Ze ruiken zo lekker… 💐'],
      boek: ['Een sterrenatlas! Ik ga hem vannacht meteen lezen.'],
      knuffel: ['Een knuffelkat! Ik noem hem… Komeet. 🐱'],
      ketting: ['Is dit… een sterketting? Ik doe hem nooit meer af. ✨'],
      telescoop: ['EEN TELESCOOP?! Ik… ik weet niet wat ik moet zeggen. Je bent geweldig. 🔭💜'],
      energiedrank: ['Eh… dankje? Ik drink dit eigenlijk nooit. Te veel suiker.']
    };
    GF.say(U.pick(lines[g.id] || ['Dankjewel!']), g.value > 0 ? 'blij' : 'boos');
    GF.addAffection(Math.round(v * 10) / 10);
  }

  function toggleFollow() {
    st.following = !st.following;
    if (st.following) GF.say(U.pick(['Graag! Waar gaan we heen?', 'Oké! Niet te snel lopen, hè.', 'Avontuur! Ik ben erbij.']), 'blij');
    else GF.say(U.pick(['Oké, ik ga mijn eigen ding doen. App me!', 'Tot later! Ik ga nog even tekenen.']));
  }

  function isAtPlace(place) {
    var p = placePos(place);
    if (!p || !actor) return false;
    return G.player.distTo(p) < 14 && actor.distTo(p) < 16;
  }

  function dateMenu() {
    if (st.pendingDate && st.pendingDate.day >= G.state.day) {
      GF.say('We hebben toch al een date staan? ' + DATES[st.pendingDate.place].name + ', ' + st.pendingDate.when + '!');
      return;
    }
    var opts = Object.keys(DATES).map(function (k) {
      var d = DATES[k];
      return { label: d.name + ' (' + d.from + ':00-' + (d.to % 24) + ':00)', fn: function () {
        if (G.time < st.upsetUntil) { GF.say('Ik denk niet dat dat nu een goed idee is.'); return; }
        var h = hour();
        var today = h < d.to - 1;
        var day = today ? G.state.day : G.state.day + 1;
        st.pendingDate = { place: k, day: day, when: (today ? 'vandaag' : 'morgen') + ' na ' + d.from + ':00', missed: false };
        GF.say(U.pick(['Ja! Ik heb er zin in!', 'Een date? Met jou? …Ja. JA. Oké, rustig Mika.', 'Graag! Ik zie je daar. 💜']), 'blij');
        G.emit('toast', { text: '📅 Date gepland: ' + d.name + ', ' + st.pendingDate.when, kind: 'love' });
        G.emit('waypoint', { pos: placePos(k), label: d.name });
      } };
    });
    opts.push({ label: 'Toch maar niet', fn: function () { GF.say('Oh. Oké.'); } });
    G.ui.dialog({ who: NAME, color: COLOR, text: 'Waar zullen we heen gaan?', options: opts });
  }

  // ---- Dates ----------------------------------------------------------------------------------
  var dateRun = null;

  function startDate() {
    var pd = st.pendingDate;
    var d = DATES[pd.place];
    if (d.cost && !G.spend(d.cost, 'Date')) return;
    dateRun = { place: pd.place, t: 0, step: 0, score: 0 };
    st.pendingDate = null;
    actor.char.setLook(DATE_LOOK);
    G.emit('cinematic', { on: true });
    var seq = dateSequence(pd.place);
    var i = 0;
    function next() {
      if (!actor) return;
      if (i >= seq.length) { finishDate(d); return; }
      var s = seq[i++];
      if (s.q) {
        G.ui.dialog({
          who: NAME, color: COLOR, text: s.q,
          options: s.a.map(function (a) {
            return { label: a[0], fn: function () { dateRun.score += a[1]; GF.say(a[2], a[1] >= 0 ? 'blij' : 'boos'); setTimeout(next, 2600); } };
          })
        });
      } else {
        GF.say(s.say, 'blij');
        setTimeout(next, s.wait || 3200);
      }
    }
    next();
  }

  function dateSequence(place) {
    if (place === 'ramen') return [
      { say: 'Ik heb de pittige miso besteld. Jij ook iets lekkers?' },
      { q: 'Wat zou je doen als je een dag lang onzichtbaar was?', a: [['De sterrenwacht in sluipen, met jou.', 4, 'Oh, dat is het liefste antwoord ooit.'], ['De bank leeghalen, natuurlijk.', -3, 'Hmm. Jij en je criminele grapjes…'], ['Gewoon de hele dag ramen eten zonder dat iemand kijkt.', 2, 'Haha, een man naar mijn hart.']] },
      { say: 'Deze bouillon… wauw. En het gezelschap is ook niet slecht. 😊' },
      { q: 'Wat vind je het mooiste aan Havenstad?', a: [['De zonsondergang boven de haven.', 3, 'Ja! Precies dat!'], ['De snelheid. De chaos. Alles.', 1, 'Je bent een wildebras, hè?'], ['Dat ik jou hier heb ontmoet.', 5, 'S-stop. Nu sta ik echt te blozen.']] }
    ];
    if (place === 'strand') return [
      { say: 'Kijk… de zon raakt bijna het water. Dit is mijn lievelingsmoment van de dag.', wait: 4000 },
      { q: 'Als je één wens mocht doen bij een vallende ster, wat zou het zijn?', a: [['Dat deze avond nooit eindigt.', 5, 'Oké, dat was te romantisch. Ik smelt.'], ['Een miljoen euro.', 0, 'Haha, eerlijk is eerlijk.'], ['Dat jij je telescoop krijgt.', 4, 'Je weet het nog! Dat is zo lief.']] },
      { say: 'Hé… dankjewel. Voor vandaag. Echt.', wait: 3600 }
    ];
    return [
      { say: 'Oké, ik waarschuw je: ik ben héél competitief.' },
      { q: 'Als ik win, wat krijg ik dan?', a: [['Een bubbelthee naar keuze.', 3, 'Deal! Bereid je voor op verlies.'], ['Niks, want ik win.', 1, 'Oh, dat gaan we nog wel eens zien!'], ['Een tweede date.', 5, 'Hihi… dan moet ik wel winnen, hè?']] },
      { say: 'HA! Gewonnen! Oké, oké, jij was ook goed.' }
    ];
  }

  function finishDate(d) {
    st.dates++;
    var gain = d.gain + dateRun.score;
    GF.addAffection(gain);
    G.emit('cinematic', { on: false });
    G.emit('toast', { text: '💞 Date voltooid! +' + gain + ' genegenheid', kind: 'love' });
    G.state.stats.dates = (G.state.stats.dates || 0) + 1;
    G.emit('gfDate', { place: dateRun.place });
    dateRun = null;
    setTimeout(function () { if (actor) actor.char.setLook(LOOK); }, 20000);
  }

  function dance() {
    if (!actor) return;
    GF.danceT = 12;
    G.player.danceT = 12;
    G.audio.radioOn(2);
    GF.say(U.pick(['Woehoe! Laat zien wat je kan!', 'Ik dans echt heel slecht. Niet lachen!']), 'blij');
    GF.addAffection(st.danceDay === G.state.day ? 0 : 4);
    st.danceDay = G.state.day;
    setTimeout(function () { if (!G.player.vehicle) G.audio.radioOff(); }, 12500);
  }

  // ---- Reacties op het gedrag van de speler -------------------------------------------------
  function setupEvents() {
    G.on('actorKilled', function (e) {
      if (!actor || !e.attacker || !e.attacker.isPlayer) return;
      if (actor.distTo(e.actor.pos) > 40) return;
      GF.say(U.pick(['WAT DOE JE?! Ben je gek geworden?!', 'Nee nee nee… dit kan niet waar zijn.', 'Ik… ik moet hier weg.']), 'bang');
      GF.addAffection(-12);
      st.upsetUntil = G.time + 240;
      st.following = false;
      if (actor.vehicle) actor.exitVehicle(true);
      actor.ai.state = 'flee';
      actor.ai.from = e.actor.pos.clone();
      actor.ai.timer = 8;
    });
    G.on('wanted', function (e) {
      if (!actor || !st.following) return;
      if (e.level >= 3) {
        GF.say('De politie?! Sorry, hier doe ik niet aan mee. Bel me als het rustig is.', 'bang');
        GF.addAffection(-5);
        st.following = false;
        if (actor.vehicle) actor.exitVehicle(true);
      } else if (e.level > 0) {
        GF.say(U.pick(['Eh… waarom hoor ik sirenes?', 'Zeg me alsjeblieft dat dat niet voor ons is.']), 'bang');
        GF.addAffection(-2);
      }
    });
    G.on('vehicleImpact', function (e) {
      if (!actor || actor.vehicle !== e.v || e.imp < 7) return;
      if (G.time < commentT) return;
      commentT = G.time + 6;
      GF.say(U.pick(['AU! Kijk uit!', 'Mijn nek!', 'Was dat echt nodig?!']), 'boos');
      GF.addAffection(-1);
    });
    G.on('missionComplete', function () {
      if (actor && st.following) GF.say(U.pick(['Goed gedaan!', 'Wow, jij krijgt echt dingen voor elkaar.']), 'blij');
    });
  }

  // ---- Per frame -------------------------------------------------------------------------------
  var placeTimer = 0;
  var msgTimer = 0;

  GF.update = function (dt) {
    if (!st) return;
    talkLock = Math.max(0, talkLock - dt);
    var player = G.player;
    var h = hour();

    // berichtjes en gemiste dates
    msgTimer -= dt;
    if (msgTimer <= 0) {
      msgTimer = 5;
      var pd = st.pendingDate;
      if (pd && (G.state.day > pd.day || (G.state.day === pd.day && h >= DATES[pd.place].to))) {
        st.pendingDate = null;
        GF.addAffection(-10);
        GF.message('Ik heb op je gewacht bij ' + DATES[pd.place].name.toLowerCase() + '… Je kwam niet. 😔');
      } else if (pd && pd.day === G.state.day && h === DATES[pd.place].from - 1 && !pd.reminded) {
        pd.reminded = true;
        GF.message('Nog een uurtje tot onze date! ' + DATES[pd.place].name + ' 💜');
      }
      if (st.met && st.stage >= 2 && h === 9 && st.lastMsgHour !== G.state.day * 100 + 9) {
        st.lastMsgHour = G.state.day * 100 + 9;
        GF.message(U.pick(['Goedemorgen! ☀️ Ik zit straks in het park, als je zin hebt.', 'Morning! Ik heb gedroomd dat we samen ramen aten. Heel normaal.', 'Hé jij. Heb je goed geslapen?']));
      }
      if (st.met && st.stage >= 3 && G.state.day - st.lastSeenDay >= 2 && st.lastMsgHour !== G.state.day * 100 + 1) {
        st.lastMsgHour = G.state.day * 100 + 1;
        GF.message('Ik heb je al twee dagen niet gezien… Alles goed? Ik mis je een beetje. 🥺');
        GF.addAffection(-3, true);
      }
      if (st.stage >= 4 && st.allowanceDay !== G.state.day && h >= 10) {
        st.allowanceDay = G.state.day;
        G.addMoney(250, 'Zakgeld van Mika');
        GF.message('Ik heb € 250 naar je overgemaakt. Koop iets leuks (of een bubbelthee voor mij 🧋)');
      }
    }

    // aanwezig in de wereld?
    var place = st.following ? 'volgen' : scheduledPlace();
    var target = st.following ? null : placePos(place);
    var near = target ? player.distTo(target) < 120 : true;
    if (place === 'thuis' || (!st.following && !near)) {
      if (actor && player.distTo(actor.pos) > 70) removeActor();
      lastPlace = place;
      return;
    }
    if (!actor) {
      ensureActor();
      var sp = target ? target.clone() : player.pos.clone().add(new T.Vector3(2, 0, 2));
      actor.pos.copy(sp);
      actor.pos.y = G.world.surface(sp.x, sp.z, sp.y + 1);
    }
    if (place !== lastPlace && target && !st.following && actor.distTo(player.pos) > 60) {
      actor.pos.copy(target);
    }
    lastPlace = place;

    var a = actor;
    var anim = a.anim;
    anim.talk = a.talkT > 0;
    anim.dance = false; anim.flee = false; anim.wave = false; anim.handsUp = false;
    a.ai.timer = (a.ai.timer || 0) - dt;
    if (GF.danceT > 0) {
      GF.danceT -= dt;
      anim.dance = true;
      a.move(dt, 0, 0, false);
    } else if (a.ai.state === 'flee' && a.ai.timer > 0) {
      var away = new T.Vector3().subVectors(a.pos, a.ai.from).setY(0).normalize();
      a.move(dt, away.x * 5, away.z * 5, false);
      a.faceTo(Math.atan2(away.x, away.z), dt, 8);
      anim.flee = true;
    } else if (st.following) {
      a.ai.state = 'follow';
      // meerijden
      if (player.vehicle && !player.vehicle.isHeli) {
        var pv = player.vehicle;
        if (a.vehicle !== pv) {
          var door = pv.doorWorld(-1, new T.Vector3());
          if (a.distTo(door) < 2.5 || a.distTo(pv.pos) < 3) {
            if (!pv.passenger) { a.enterVehicle(pv, 1); GF.say(U.pick(['Rijden maar!', 'Gordel om… oké, klaar!', 'Mag ik de radio kiezen?']), 'blij'); }
          } else if (a.distTo(door) < 40) {
            stepTo(a, door, 5, dt);
          }
        } else {
          // commentaar op de rijstijl
          if (pv.speed() > 33) speedT += dt; else speedT = Math.max(0, speedT - dt);
          if (speedT > 3 && G.time > commentT) {
            commentT = G.time + 12;
            speedT = 0;
            GF.say(U.pick(['Rustig aan! Ik wil nog lang leven!', 'Dit is geen racebaan!', 'Ik… voel… mijn… wangen… flapperen!']), 'bang');
            GF.addAffection(-1, true);
          }
        }
      } else if (player.vehicle && player.vehicle.isHeli) {
        var hv = player.vehicle;
        if (a.vehicle !== hv && a.distTo(hv.pos) < 4 && !hv.passenger) { a.enterVehicle(hv, 1); GF.say('Een helikopter?! Oké. Oké oké oké. Ik ben niet bang.', 'bang'); }
        else if (a.vehicle !== hv && a.distTo(hv.pos) < 30) stepTo(a, hv.pos, 5, dt);
      } else {
        if (a.vehicle) a.exitVehicle();
        var d = a.distTo(player.pos);
        if (d > 60) { a.pos.copy(player.pos).add(new T.Vector3(-2, 0, -2)); }
        else if (d > 2.5) stepTo(a, player.pos, d > 8 ? 5.5 : (player.speed2d() > 3 ? 4.5 : 1.6), dt);
        else a.move(dt, 0, 0, false);
        // genezen in een relatie
        if (st.stage >= 4 && d < 6 && player.health < player.maxHealth) player.heal(dt * 1.5);
      }
    } else {
      a.ai.state = 'place';
      if (a.vehicle) a.exitVehicle();
      var dp = a.distTo(target);
      if (dp > 1) stepTo(a, target, dp > 20 ? 4 : 1.4, dt);
      else {
        a.move(dt, 0, 0, false);
        if (player.distTo(a.pos) < 12) a.faceTo(Math.atan2(player.pos.x - a.pos.x, player.pos.z - a.pos.z), dt, 3);
      }
      // zwaaien als je in de buurt komt
      if (st.met && player.distTo(a.pos) < 10 && (!a.ai.waveT || G.time > a.ai.waveT)) {
        a.ai.waveT = G.time + 90;
        a.ai.waving = 2.5;
        GF.say(st.stage >= 2 ? U.pick(['Hé! Hier!', 'Hoiii!', 'Daar ben je!']) : 'Oh, hoi.', 'blij');
      }
      if (a.ai.waving > 0) { a.ai.waving -= dt; anim.wave = true; }
    }
    anim.speed = Math.hypot(a.vel.x, a.vel.z);
    anim.grounded = a.grounded;
    a.sync(dt, anim);
  };

  function stepTo(a, p, speed, dt) {
    var dx = p.x - a.pos.x, dz = p.z - a.pos.z;
    var d = Math.sqrt(dx * dx + dz * dz) || 1;
    a.move(dt, dx / d * speed, dz / d * speed, false);
    a.faceTo(Math.atan2(dx, dz), dt, 8);
  }

  GF.near = function () { return actor && !actor.vehicle && G.player.distTo(actor.pos) < 2.6; };

  GF.call = function () {
    if (!st.met) { G.emit('toast', { text: 'Je hebt Mika\'s nummer nog niet.', kind: 'bad' }); return; }
    var h = hour();
    if (h >= 23 || h < 8) { GF.message('Zzz… het is midden in de nacht! Morgen? 😴'); return; }
    if (G.time < st.upsetUntil) { GF.message('Ik heb even tijd voor mezelf nodig.'); return; }
    if (st.stage < 2) { GF.message('Hoi! Kom maar langs als je wilt, ik ben in de buurt van ' + ({ park: 'het park', kleding: 'Stijlzaak', ramen: 'Ramen Neon' }[scheduledPlace()] || 'thuis') + '.'); return; }
    st.following = true;
    ensureActor();
    if (actor.distTo(G.player.pos) > 50) {
      var p = G.player.pos;
      actor.pos.set(p.x + 3, G.world.surface(p.x + 3, p.z + 3, p.y + 1), p.z + 3);
    }
    GF.message('Ik kom eraan! 🏃‍♀️');
  };

  GF.buyGift = function (g) {
    if (!G.spend(g.price, 'Cadeau')) return false;
    st.inventory[g.id] = (st.inventory[g.id] || 0) + 1;
    G.emit('toast', { text: g.icon + ' ' + g.name + ' gekocht. Geef het aan Mika!', kind: 'good' });
    return true;
  };

  GF.init = function () {
    st = G.state.gf || defaultState();
    var d = defaultState();
    for (var k in d) if (!(k in st)) st[k] = d[k];
    G.state.gf = st;
    if (!GF._events) { setupEvents(); GF._events = true; }
    removeActor();
  };

  G.on('save', function (s) { s.gf = st; });
})();
