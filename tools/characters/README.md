# Character pipeline

1. `crop.py` cuts the front, back and three-quarter views (Aelar) and front, side and back views (Ryn) out of the sheets.
2. `submit.py aelar|ryn` sends them to Meshy multi-image to 3D (`ai_model latest`, remesh to 20k triangles, A-pose, 2K texture). 30 credits each.
3. Rig with `POST /openapi/v1/rigging` (`input_task_id`, `height_meters` 1.85 / 1.75), 5 credits each.
4. Animate with `POST /openapi/v1/animations` (`action_ids`): Aelar 0 Idle, 30 Casual Walk, 14 Run 2, 219 Right-hand Sword Slash, 242 Charged Slash, 97 Left Slash; Ryn 0 Idle, 313 Talk with Hands Open. 3 credits per clip.
5. Blender 4.2 headless: `build_aelar.py` (splits the back sword off, recolours the cape under it, exports the hand sword, renames clips, shrinks the texture to 1024 JPEG) and `process.py` for Ryn.
6. `viewer.html` + `shoot.js` render previews with three.js in headless Chromium.

The Meshy key is read from `MESHY_API_KEY`.
