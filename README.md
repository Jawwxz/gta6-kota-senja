# Kota Senja

[![Make GTA 6](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/Jawwxz/gta6-kota-senja/rank.svg)](https://make.fun/bounty/gta6-01)
[![Reward](https://make.fun/badge/gta6-01/Jawwxz/gta6-kota-senja/reward.svg)](https://make.fun/bounty/gta6-01)

An original open-world driving game built for the
[Make GTA 6](https://make.fun/bounty/gta6-01) bounty on make.fun.
Dimas, a night courier for Bu Ratna's flower stall **Kios Bunga Senja**,
drives, fights and outruns the police across a dusk-purple Indonesian
night-market city, caught between two rival crews: **Geng Purnama** and
**Anak Senja**. Everything is original — no Rockstar names, characters,
maps or assets — and the game runs fully offline.

## Play

Serve it locally, then open http://localhost:8080:

```sh
node serve.ts
```

Or open `game/index.html` directly in a desktop browser.

## Controls

- **W A S D** — walk / drive
- **Shift** — sprint
- **E** — enter / exit a car (stealing a car that is not yours raises your wanted level)
- **F** — punch
- **Click** — shoot the pistol
- **P** — pause
- **Mouse** — look around

## Missions

1. **Antar Bunga** — pick up a bouquet at the warehouse, deliver it to the kiosk.
2. **Penyergapan** — survive a Geng Purnama ambush at the market.
3. **Rebut Wilayah** — take back the western corner from Anak Senja.
4. **Curi Sedan Emas** — steal the gold sedan and bring it to the garage.
5. **Penjaga Gudang** — clear the warehouse guards.
6. **Lari ke Dermaga** — outrun the police to the southern pier.

Progress, cash and position are saved in the browser (localStorage).
The HUD shows cash, health, ammo, wanted stars, speed and a live minimap.

## Tech

- three.js r160, vendored as a single file under `game/vendor/`
- No network requests: the game loads only local files
- Synthesized WebAudio: engine hum, gunshots, pickups, mission jingles
- `main.ts` hands the game in: it copies `game/` and `screenshots/` to
  `/output` and writes `/output/dossier.json` (run it with
  `MAKEFUN_OUTPUT_DIR=out node main.ts`)
