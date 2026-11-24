[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/Jawwxz/gta6-kota-senja/rank.svg)](https://make.fun/bounty/gta6-01)
[![Reward](https://make.fun/badge/gta6-01/Jawwxz/gta6-kota-senja/reward.svg)](https://make.fun/bounty/gta6-01)

# Kota Senja

An original open-world crime game for the [make.fun GTA 6 bounty](https://make.fun/bounty/gta6-01): explore a fictional Indonesian dusk city on foot and by car, steal cars, dodge the Patroli, and run six story missions as Dimas, a night courier caught between Geng Purnama and the Anak Senja crew.

Kota Senja lives when the sun goes down: a purple-orange dusk sky, neon night-market streets in the Kios Bunga district, and the rice warehouses of Gudang Beras. Everything is original and procedural — city, characters, vehicles, names, story, art and sound — with no Rockstar names, logos, characters or assets.

## Play

```sh
node serve.ts
# open http://localhost:8080
```

- **On foot:** WASD to walk, mouse drag to look, Shift to sprint, E to get in a car, F to punch, click to shoot, R to reload.
- **Driving:** W/S gas and brake, A/D steer, Space handbrake, E to get out.
- **More:** traffic and pedestrians, stealable cars, a 5-star wanted level with police chases and busts, six missions with a win state, combat on foot and from a car, HUD with minimap, start menu, pause, save/load, and synthesized sound — all offline, from static files under `game/`. Three.js is vendored under `game/vendor/`.

## Missions

1. **Paket Pertama** — pick up a package at Gudang Beras, deliver it to Kios Bunga.
2. **Preman Pasar** — drive Geng Purnama's thugs out of the market.
3. **Kejar Patroli** — escape a 3-star police chase through three checkpoints.
4. **Mobil Pesanan** — steal the gold sedan and deliver it to the garage.
5. **Gudang Gelap** — infiltrate the warehouse, beat the guards, grab the package.
6. **Senja Terakhir** — deliver the package to the pier under a 4-star pursuit.

## Build

`game/` is the whole game (three.js r160 vendored as `game/vendor/three.module.min.js`). `main.ts` copies `game/` and `screenshots/` to `/output` and writes the dossier the judge reads. Screenshots are real renders of the game in desktop Chrome, staged with `?shot=menu|drive|combat|chase`.
