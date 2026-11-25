# Character models

Made with Meshy (multi-image to 3D from the character sheets in `reference/`), rigged and animated with Meshy's rigging and animation API, then cleaned up in Blender (headless). Scripts are in `tools/characters/`.

| File | What | Triangles | Texture | Size |
| --- | --- | --- | --- | --- |
| `aelar.glb` | Aelar, skinned, 24-bone biped rig, sword on his back as a separate mesh | about 20.5k | 1024 JPEG base colour | 2.5 MB |
| `aelar_sword.glb` | The same greatsword on its own, for his hand during attacks | about 1k | 1024 JPEG | 0.25 MB |
| `ryn.glb` | Master Ryn, skinned, same rig | about 19.7k | 1024 JPEG base colour | 1.8 MB |

All models face +Z, feet at y = 0, metres. Aelar is about 1.78 m to the top of his hair (1.85 m to the sword pommel), Ryn about 1.70 m.
Materials are unlit-friendly base colour only (no PBR maps), roughness 0.85, metalness 0.

## Clips

All clips are in place (no root motion to strip).

- `aelar.glb`: `idle` (4.0 s), `walk` (4.17 s), `run` (0.67 s), `attack` (1.5 s, right-hand slash), `attack_charged` (2.17 s), `attack_left` (3.17 s, two-swing combo)
- `ryn.glb`: `idle` (4.0 s), `talk` (3.96 s, talking with open hands)

## Objects in `aelar.glb`

- `AelarBody`: the character. Where the sword lies on the cape, the cape has been recoloured red so it looks right when the sword is off his back.
- `BackSword`: the sheathed greatsword, skinned to the spine. Hide it while the hand sword is shown.
- `Rig`: the armature. The hand bone is `RightHand`.

## Drawing the sword (three.js)

```js
const sword = (await loader.loadAsync('assets/models/aelar_sword.glb')).scene;
const hand = hero.getObjectByName('RightHand');
hand.add(sword);
sword.position.set(0, 8.5, 0);                               // bone-local units are centimetres
sword.quaternion.set(-0.21225, 0.6745, 0.6745, 0.21225);
sword.scale.setScalar(100);                                  // undo the rig's 0.01 scale
sword.visible = false;

function setSwordDrawn(drawn) {
  sword.visible = drawn;
  hero.getObjectByName('BackSword').visible = !drawn;
}
```

`aelar_sword.glb` has its grip at the origin with the blade along +Y, so other grips are easy to tune.

## Known limits

- A few small dark slivers of the sword handle stay floating above his right shoulder when `BackSword` is hidden. They are only visible during attacks.
- The cape is part of the skinned body, so it moves with the legs and spine rather than as cloth.
- Hands have no finger bones; the hand sword is held by a closed-ish fist pose from the clip.
