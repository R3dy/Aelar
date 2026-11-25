# Training Grounds prototype

A browser-based 3D game prototype, derived from a single reference screenshot, built to look as close as possible to that screenshot when running full screen on an iPhone in landscape.

Status as of 2026-11-25: first playable build is live and has had one round of render-and-compare tuning.

- Playable link (private Artifact): https://claude.ai/artifact/UfyPKmr4QW9YubgyX1tzFG
- Source: `training-grounds/` (build with `./build.sh`; see `training-grounds/src`)
- Side-by-side with the reference: `training-grounds/comparison/round1-side-by-side.png`

Honest fidelity read after round 1: layout, HUD and camera framing are close (the HUD is cut from the HUD render, so it matches very closely). The 3D scene is roughly 60 to 65% of the reference: the characters are simple placeholders, and trees, grass, the house roof and materials lack the painted detail. The 95% matched-frame target needs modeled assets, starting with the two characters.

## Goal

Recreate the scene in `reference/01-original-screenshot.png` as a playable prototype, so that a screenshot of the running game from the matched camera could pass for the original.

Fidelity targets:

| Measure | Target |
| --- | --- |
| Matched frame (same camera as the reference) | about 95% |
| In motion (walking around the area) | about 90% |

## What the prototype includes

Updated 2026-11-25 with the quest chain from the [quest chain design](https://claude.ai/artifact/BxRi4e1nrm9gEve6ZrUvRg) (PRs #5 to #8):

- Third-person movement and camera with touch controls (a joystick ring appears where the left thumb lands)
- A six-quest chain (`src/quests.js`): A Familiar Face (talk to Ryn), The Drill (3-hit combo, ability, dodge the live dummy; unlocks Whirlwind in slot 6), Ambush at the Bridge (3 straw bandits), Scattered Charms (4 charms), The Sentinel Wakes (Stone Sentinel mini boss, blade drop), Ascension (level up to 2, pick a talent)
- Enemies with telegraphed attacks (red glow, ground decal, sound), HP bars, damage to the hero, death and respawn, potion pickups
- Stone Sentinel (`src/sentinel.js`): 600 HP, slam and sweep, a shockwave ring under 50% HP, boss bar, intro camera, slow-motion defeat
- Progression: XP bar (600 XP total), level 2 with max HP 280, a three-branch talent pick (Blade, Flame, Frost) with locked Lv 3 teasers, the Sentinel-forged blade (+20% sword damage, orange glow)
- Game feel: synthesized audio (`src/audio.js`), hit-stop, camera shake, white hit flash, crits, guidance that follows the current quest, New quest banners, an end card with run stats
- Full HUD from the reference, plus the XP bar, slot 6 and the boss bar

## Technical approach

- Three.js, single landscape page, iPhone safe-area handling
- Blender, run headless by script, for modeling, rigging, UV work and light baking
- HUD built in HTML, CSS and SVG, with icon and portrait art taken from the HUD render
- Image-to-3D service for the two characters, fed from the character sheets, then cleaned up and rigged in Blender (untested; needs an account and a browser session)
- Baked lighting, a painted backdrop for sky and distant cliffs, and post-processing tuned to the reference shot
- Render-and-compare loop: screenshot the running game at iPhone resolution, compare against the reference, adjust, repeat

Known limits: animation quality from auto-rigging, and foliage density and soft shadows on mobile browsers.

## Reference renders

Workflow: Claude writes a prompt, Royce feeds it to the image model that made the original, Claude reviews the result and accepts it or asks for a revision.

| # | Asset | Status | File |
| --- | --- | --- | --- |
| 0 | Original screenshot | Have | `reference/01-original-screenshot.png` |
| 1 | Hero (Aelar) character sheet | Accepted, v2, 9/10 | `reference/03-hero-sheet-v2-accepted.png` |
| 2 | Clean plate (no HUD, no hero) | Accepted, 9/10 | `reference/04-clean-plate-accepted.png` |
| 3 | HUD on its own | Prompt written, awaiting render | |
| 4 | Top-down view of the training grounds | To do | |
| 5 | Master Ryn character sheet | To do | |
| 6 | Prop and building sheet | To do | |
| 7 | Material swatches | To do | |
| 8 | Reverse-angle shot (optional) | To do | |
| 9 | Ability effect frames (optional) | To do | |

Made in-house, no render needed: grass, flowers and trees, waterfall and pond, sky, path markers, animations, lighting, game logic.

## Review notes

### Hero sheet v1 (superseded, 8/10)

Good pose, lighting and consistency. Problems: slim longsword instead of the screenshot's greatsword, style drifted toward gritty realism with brown rusted armor, low resolution per figure, close-up at three-quarter angle, tattoos inconsistent, side view showed the right side with arms down.

### Hero sheet v2 (accepted, 9/10)

Fixed: greatsword worn diagonally over the cape, clean charcoal-and-gold style matching the screenshot, front-facing head close-up, tattoos consistent.

Not fixed: side view still shows the right side with the arm down, and the sword looks near vertical there. Take the sword position from the back view. Resolution appeared unchanged at about 1,700 px wide.

### Clean plate (accepted, 9/10)

Camera and layout held, removals are clean, filled-in areas are plausible. The image was repainted, not edited, so it is slightly more saturated and sharper than the original and some cliff and tree details shifted. Use this as the reference for the environment, and the original for the HUD and overall composition.

## Prompts

### Hero sheet, first prompt

Attach: original screenshot.

```
Using the attached game screenshot as the exact style and design reference, create a character model sheet for the player character, Aelar: the dark-haired warrior seen from behind in the foreground, whose face appears in the portrait at top left.

Match the screenshot's art style exactly: the same stylized, painterly 3D look, the same proportions, materials and colour palette. This is the same character model, not a redesign.

Layout: one wide 16:9 image on a plain, flat mid-grey background.

Main row, four full-body views of him standing in a relaxed A-pose (arms held about 30 degrees out from the body, feet shoulder-width apart), all at the same scale with heads and feet aligned:
1. Front
2. Left side
3. Back
4. Three-quarter front

In these four views he wears the full outfit from the screenshot: dark leather and plate armor with a shoulder pauldron, bracers, a belt with pouches, an armored skirt, the tattered crimson cape with its pale emblem, and the greatsword sheathed across his back.

Smaller insets along the bottom:
- Back view with the cape and sword removed, showing the armor underneath
- The cape laid flat, showing the whole emblem and the torn edges
- The greatsword on its own, full length, showing the hilt and guard
- A front-facing close-up of his head and shoulders with a neutral expression

Lighting: soft, even and neutral from the front, with no cast shadows, no rim light, no coloured light and no ground shadow. Use a flat, straight-on camera at chest height with no perspective distortion.

Do not include any interface elements, text, labels, scenery, visual effects or other characters. Keep every detail consistent across all views: the same face, hair, armor pieces, strap positions and cape emblem.
```

### Hero sheet, revision prompt (produced the accepted v2)

Attach: original screenshot and hero sheet v1.

```
Attached are two images: the original game screenshot, and a character model sheet you made from it. The sheet is close. Please produce a revised version that keeps the same layout, pose, flat neutral lighting, plain mid-grey background, face, hair and outfit design, and makes only the changes below.

1. Resolution. Render at the highest resolution you can, ideally 4K wide (3840 x 2160). The full-body figures need enough detail to be used as texture reference.

2. Sword. Replace the slim longsword with the greatsword from the screenshot: a long, broad, heavy blade in dark steel with gold inlay running down its centre and a gold-accented guard. He wears it diagonally across his back with the hilt above his right shoulder and the blade lying on top of the cape, fully visible from behind and reaching down to about his left hip. Show it this way in all four full-body views, and show the same greatsword in the standalone sword inset.

3. Art style. Match the screenshot's look more closely. It is brighter, cleaner and more stylized than the first sheet: smoother surfaces, more saturated colour, and far less rust, grime and fine surface noise. The armor should be the dark charcoal leather and dark metal seen in the screenshot, not weathered brown.

4. Side view. Show his left side (facing left), with arms in the same A-pose as the other views.

5. Head close-up. Make it directly front-facing and symmetrical, with a neutral expression and the same flat, even lighting as the rest of the sheet.

6. Consistency. The tattoos on his upper arms should appear the same in every view where the upper arms are visible, front and back.

Everything else stays the same: four full-body views in the main row (front, left side, back, three-quarter front) at the same scale with heads and feet aligned, and the insets along the bottom (back view without cape and sword, cape laid flat, greatsword alone, head close-up). No interface elements, text, labels, scenery, effects or other characters.
```

### Clean plate (accepted)

Attach: original screenshot.

```
Using the attached game screenshot, recreate the exact same image with two things removed:

1. The entire user interface: the portrait, name, level badge, health and mana bars at top left; the compass strip and distance readout at top centre; the clock, minimap and gear button at top right; the "Training Grounds" quest tracker on the right; the four menu buttons at bottom left; the ability bar at bottom centre; and the two round action buttons at bottom right. Also remove the "Master Ryn" name label and the yellow exclamation-mark icon above the old man.

2. The player character: the dark-haired warrior with the red cape and sword in the foreground.

Everything else must stay exactly as it is: the same camera position, angle and framing, the same lighting and time of day, the same art style and colours, and every object in the same place. Keep the old man standing by the house, the house, lanterns, banners, stone archway and stairs, watchtower, cliffs, waterfall, bridge, pond, training dummies, trees, rocks, flowers, and the glowing golden markers along the path.

Where the interface and the warrior were, fill in the scene naturally: continue the stone path and grass where he stood, and continue the sky, tree canopy, roof, cliffs, grass and rocks behind where the interface was.

Same aspect ratio and the highest resolution you can produce. No text, labels or interface elements anywhere in the image.
```

### HUD on its own (awaiting render)

Attach: original screenshot.

```
Using the attached game screenshot, recreate only the user interface, with the entire game world removed and replaced by a plain, flat mid-grey background.

Keep every interface element exactly as it appears in the screenshot, in the same position, at the same size, with the same design, colours and text:

- Top left: the diamond-framed character portrait, the "Lv 1" badge, the name "Aelar", the red health bar reading "240 / 240" with its heart icon, and the blue mana bar reading "100 / 100" with its diamond icon.
- Top centre: the compass strip with "W" and "N", the gold diamond marker, and "32 m" below it.
- Top right: the sun icon with "10:24 AM", the round minimap with its ornate frame and gold player arrow, and the gear button.
- Right side: the gold emblem and "Training Grounds" heading, with three checkbox lines: "Talk to Master Ryn", "Learn Combat (0/3)", "Use an Ability (0/1)".
- Bottom left: four square buttons showing a bag, a helmet, an open book and a gear.
- Bottom centre: the ability bar with four skill icons numbered 1 to 4 (orange slash, blue lightning, orange fire streak, blue swirl), a red potion numbered 5 with a count of 3, and three locked slots with padlock icons.
- Bottom right: the small round button with a running figure and the large round button with crossed swords.

Also include, in their original positions, the yellow exclamation-mark icon and the "Master Ryn" name label.

Do not include any part of the game world: no scenery, no characters, no path markers. Only the interface on flat grey, with no shadows or gradients in the background.

Same aspect ratio and the highest resolution you can produce, so the small icons are sharp.
```

## Build notes

- Blender is not available in the cloud container, so all geometry is built procedurally in Three.js code instead of modeled and baked in Blender. Lighting is real-time (sun with shadows, sky fill, lantern lights, bloom and a colour grade), not baked.
- HUD art is cut from `reference/05-hud-only.png` by `tools/prep_hud.py`; numbers, quest lines, compass and minimap are drawn live on top.
- Tiling textures are made from `reference/09-material-swatches.png` by `tools/prep_tex.py`.
- `?shot=1` on the game URL freezes the camera at the reference angle for comparisons; `tools/shot.js` renders it headless.

## Next steps

1. Characters: replace the placeholder Aelar and Master Ryn with image-to-3D models (needs the user's account and browser session).
2. Environment detail: house roof seen from above as in the reference, leafier trees, softer grass, more of the pond and dummy area in frame.
3. Test on a real iPhone and tune performance.
4. Further render-and-compare rounds.
