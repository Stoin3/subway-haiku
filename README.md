# Metro Rush 3D

Een 3D endless runner in de stijl van Subway Surfers: ontwijk de metrotreinen, spring over de barrières, verzamel zo veel mogelijk muntjes en verbreek je highscore. De snelheid neemt steeds toe.

Werkt in Google Chrome en Firefox (desktop en telefoon). Geen build-stap en geen externe modelbestanden: alle 3D-modellen (runner, metrotreinen, munten, barrières, gebouwen) worden in de code opgebouwd met [Three.js](https://threejs.org/).

## Starten

Open `index.html` direct in je browser, of start een statische server in deze map, bijvoorbeeld:

```bash
python3 -m http.server 8000
# daarna http://localhost:8000
```

Er is internet nodig om Three.js en het lettertype (Fredoka) te laden.

## Besturing

| Actie | Toetsenbord | Telefoon |
| --- | --- | --- |
| Van baan wisselen | ← → of A D | swipe links / rechts |
| Springen | ↑, W of Spatie | swipe omhoog of tik |
| Snel omlaag (in de lucht) | ↓ of S | swipe omlaag |
| Pauze | P of Esc | |
| Geluid aan/uit | M | |

## Spelregels

- Treinen blokkeren één of twee banen. Er is altijd minstens één vrije baan.
- Barrières moet je overspringen (of ontwijken met een baanwissel).
- Munten leveren 10 punten op. Je score is de afstand in meters plus 10 punten per munt.
- Hoe langer je overleeft, hoe sneller de runner loopt (tot 130 km/u).
- Highscores (de top 10) worden in de browser opgeslagen (`localStorage`) en staan op het startscherm.

## Bestanden

- `index.html`: de pagina, het HUD en de menu's (start, pauze, game over).
- `css/style.css`: de opmaak.
- `js/models.js`: procedurele 3D-modellen (runner, metrowagons, munten, barrières, omgeving).
- `js/game.js`: spellogica, rijen met obstakels, botsingen, highscores, geluid en invoer.
