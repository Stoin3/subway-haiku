# Havenstad

Een open-wereld 3D-stad in je browser (Chrome / Firefox, desktop met muis en toetsenbord). Steel auto's en helikopters, pleeg overvallen, ontloop de politie, sloop gebouwen, bouw je eigen pand, pas je kleding aan in een echte winkel en bouw een relatie op met Mika.

Alles is eigen werk en wordt live gegenereerd: de stad, de 3D-modellen (personages, auto's, helikopters, wapens), de texturen, de muziek en alle geluiden. Er worden geen gekopieerde assets gebruikt; alleen de rendering-bibliotheek [Three.js](https://threejs.org/) wordt via een CDN geladen.

Het oorspronkelijke spel **Metro Rush** staat nog in `metro.html` en is in de stad te spelen in de arcadehal.

## Starten

Open `index.html` in Chrome of Firefox, of start een statische server:

```bash
python3 -m http.server 8000
# open daarna http://localhost:8000
```

Er is internet nodig om Three.js en de lettertypen te laden. Onder **Instellingen** kies je de grafische kwaliteit (Laag / Normaal / Ultra).

## Besturing

| Actie | Toets |
| --- | --- |
| Lopen / rijden | WASD |
| Rondkijken | Muis |
| Sprinten | Shift |
| Springen / handrem | Spatie |
| Schieten / slaan | Linkermuis |
| Richten (sniper: inzoomen) | Rechtermuis |
| Herladen (in de auto: radio) | R |
| Wapen kiezen | 1-8 of scrollen |
| Granaat gooien | G |
| Instappen / auto stelen / uitstappen | F |
| Praten / interactie / missie starten | E |
| Toeteren | H |
| Handen omhoog (overgeven) | X |
| Bouwmodus (op de bouwplaats) | B |
| Telefoon / kaart / pauze | Tab / M / Esc |
| Helikopter | Spatie omhoog, Shift omlaag, W/S kantelen, A/D draaien, Q/E zijwaarts |

## Wat zit erin

- **Grote open stad** van ongeveer 2 bij 2 km: centrum met wolkenkrabbers, woonwijken, haven met containers, stadspark met vijver, boulevard, strand en zee, heuvels met bos.
- **Licht en sfeer**: dag/nacht-cyclus (1 speldag = 24 minuten) met zon, maan, sterren en wolken; realtime schaduwen; PBR-materialen met reflecties van de lucht; filmische tonemapping en bloom; verlichte ramen, lantaarns en neonborden 's nachts; golvend spiegelend water.
- **Echte sloop**: gebouwen bestaan uit blokken. Explosies slaan er gaten in, en een draagconstructie-berekening laat alles wat niet meer gedragen wordt instorten. Het puin heeft physics en stapelt zich op tot puinhopen waar je overheen kunt klimmen.
- **Voertuigen**: zes automodellen plus taxi en politie, met grip, drift (handrem), gewichtsverplaatsing, schade, rook, brand en explosies. Drie soorten helikopters met een vliegmodel; je kunt op daken landen.
- **Vuurwapens**: pistool, machinepistool, jachtgeweer, aanvalsgeweer, precisiegeweer met vizier, raketwerper en granaten. Kogels raken lichaamsdelen (hoofdschoten doen extra schade), auto's en gebouwen.
- **Politie en wanted-niveau** (1-5 sterren): getuigen bellen de politie, agenten achtervolgen je in auto's en te voet, arresteren of schieten, en vanaf 3 sterren komt er een helikopter met zoeklicht. Ontsnap door uit het zicht te blijven, of laat je auto overspuiten bij Spuit & Weg.
- **Levende stad**: voetgangers met unieke uiterlijken en eigen (gesynthetiseerde) stemmen, die vluchten, schreeuwen of terugvechten; verkeer dat rechts rijdt, afslaat, remt en toetert.
- **Overvallen**: richt in een Buurtsuper je wapen op de kassamedewerker, of kraak de kluis van de Goudmunt Bank.
- **Missies** (non-lineair, vrij te kiezen via lichtzuilen op de kaart): Gestolen Glans, Spoedpakket, De Goudmunt-kraak, Sloopbevel, Vliegles, Havenrace, Bouwopdracht, Kraaiennest, Een bijzondere ontmoeting en Taxidienst.
- **Kledingwinkel Stijlzaak**: loop naar binnen, ga het pashokje in (met echte spiegel) en pas je kleding live aan: bovenstukken, broeken, rokken, schoenen, kapsels, hoofddeksels, brillen en kleuren. Een kogelwerend vest geeft bepantsering. Thuis kun je gekochte kleding gratis wisselen.
- **Mika**: een eigen anime-geïnspireerd personage met een relatiesysteem van Vreemden tot Relatie. Ze heeft een dagschema, voorkeuren voor cadeaus en kleuren (ze merkt je outfit op), gesprekken met keuzes en dates bij Ramen Neon, op het strand of in de arcade. Je kunt een date ook missen. Ze loopt en rijdt met je mee en reageert op je rijstijl en op misdaad. Ze stuurt berichtjes, en als jullie een relatie hebben, krijg je extra's.
- **Bouwsimulatie**: bouw op de bouwplaats met beton, baksteen, hout, glas, staal en dakpannen. Elk materiaal heeft een eigen sterkte en een stabiliteitsberekening bepaalt hoe ver iets mag uitsteken; wat niet gedragen wordt, stort in. Je bouwwerk levert dagelijks huur op.
- **Geld heeft een functie**: wapens, munitie, bepantsering, kleding, cadeaus en dates, eten en het ziekenhuis, bouwmateriaal, overspuiten, boetes en ziekenhuisrekeningen. Je verdient het met missies, overvallen, taxiritten, huur en (in een relatie) zakgeld van Mika.
- **Geluid**: alles live gesynthetiseerd met Web Audio, inclusief 3D-positionering en galm, motoren, rotoren, sirenes, NPC-stemmen en drie generatieve radiozenders.
- **Opslaan**: automatisch, in je appartement of via de telefoon (`localStorage`).

## Eerlijk over de grenzen

- Echte ray tracing bestaat niet in WebGL. Havenstad gebruikt PBR-materialen, realtime schaduwen, omgevingsreflecties, tonemapping en bloom om er zo goed mogelijk uit te zien.
- Animaties zijn procedureel (er is geen motion capture), maar wel met overgangen, secundaire beweging en ragdoll-achtig vallen.
- Getest in Chromium. Firefox gebruikt dezelfde standaard-API's, maar is niet automatisch getest.

## Bestanden

- `index.html`, `css/ow.css`: de pagina en de interface van Havenstad.
- `js/ow/`: de spelmodules (`core`, `audio`, `env`, `city`, `fx`, `characters`, `vehicles`, `actors`, `weapons`, `npc`, `girlfriend`, `construction`, `missions`, `ui`, `main`).
- `metro.html`, `css/style.css`, `js/models.js`, `js/game.js`: het arcadespel Metro Rush.
