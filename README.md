[![SKYPOST — Island Courier](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![Rank](https://make.fun/badge/best-flight-game-20261126-0057/nemesisbug/best-flight-game-20261126-0057/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![Reward](https://make.fun/badge/best-flight-game-20261126-0057/nemesisbug/best-flight-game-20261126-0057/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

# SKYPOST — Island Courier

A bush-plane courier game for the [make.fun best flight game bounty](https://make.fun/bounty/best-flight-game-20261126-0057). You fly the Kestrel, a little amphibious mail plane, between the airstrips of a Pacific archipelago: thread golden rings, drop parcels on island strips, and bring her home before the fuel runs out.

## Play

```sh
node serve.ts
# open http://localhost:8080
```

No build step, no network requests — every file the game loads lives under `game/`.

## Controls

| Key | Action |
| --- | --- |
| ↑ / ↓ | Pitch down / up |
| ← / → | Bank and turn |
| W / S | Throttle up / down |
| G | Landing gear |
| F | Flaps |
| C | Chase / cockpit camera |
| P | Pause |
| R | Restart sortie |
| M | Sound on / off |

## The three sorties

- **First Light** (easy) — a dawn ring run: six golden rings, then land back on Coral Strip.
- **Island Hop** (medium) — the mail run: land on Palm Strip and Lighthouse Strip with parcels, in a breeze.
- **Storm Mail** (hard) — a squall is coming in: six rings on low fuel and a crosswind landing.

Landing takes discipline: gear down, flaps out, gentle descent, slow speed, lined up with the strip. Come in too fast or too steep and the Kestrel breaks. Fuel burns with the throttle, and a stall below 30 knots drops the nose — mind the airspeed.

## How it is built

- `game/src/config.js` — world, palette, flight tuning, runways, rings, sorties.
- `game/src/random.js` — the seeded generator behind the archipelago.
- `game/src/terrain.js` — heightfield islands, runway pads, palms, clouds.
- `game/src/plane.js` — arcade flight physics: lift, stall, banked turns, landings.
- `game/src/input.js` — keyboard and mouse input.
- `game/src/audio.js` — synthesised engine, wind, chimes and thuds (Web Audio, no files).
- `game/src/render.js` — the software 3D renderer: chase and cockpit cameras, terrain mesh, the Kestrel herself.
- `game/src/hud.js` — the instrument HUD: airspeed, altitude, heading, horizon, fuel, mission checklist.
- `game/src/missions.js` — the objective engine: rings, landings, scoring, medals.
- `game/src/shots.js` — the staged screenshot scenes (real play, autopilot-flown).
- `game/src/main.js` — the loop and the screens.

The renderer is hand-rolled canvas 2D — no engine, no vendored library — and every sound is synthesised, so the game runs fully offline from its own files.

## Screenshots

`?shot=cover` flies the First Light ring run, `?shot=cockpit` sits in the cockpit, `?shot=landing` rides the final approach to Coral Strip, and `?shot=title` holds the title screen over the ring run in flight. Each scene is staged by an autopilot flying the real physics, so every screenshot is a genuine render of the game.

## License

MIT — see [LICENSE](LICENSE).
