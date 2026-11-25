# Aelar: Training Grounds

A browser-based 3D game prototype (Three.js), recreating the scene in `reference/01-original-screenshot.png` as a playable level that runs full screen on an iPhone in landscape.

Plan, status and review notes: [docs/PROJECT.md](docs/PROJECT.md).

## Build and run

```sh
npm install
./build.sh                # bundles src/ into dist/
npm run serve             # http://localhost:8765
```

Controls: on touch screens, drag the left half to walk and the right half to look. On desktop, WASD to move, drag to look, Space to attack, Shift to dodge, 1 to 5 for abilities and the potion.

## Layout

- `src/` game code: `layout.js` (heights, masks, walkability), `world.js` (environment), `characters.js` (placeholder hero and Master Ryn), `hud.js`, `effects.js`, `main.js` (renderer, input, quests, loop)
- `assets/hud/` HUD art cut from `reference/05-hud-only.png` by `tools/prep_hud.py`
- `assets/tex/` tiling textures made from `reference/09-material-swatches.png` by `tools/prep_tex.py`
- `tools/shot.js` renders the game headless; `?shot=1` freezes the camera at the reference angle for comparisons

`build.sh` also writes `dist/page.html`, the variant published as a claude.ai Artifact.
