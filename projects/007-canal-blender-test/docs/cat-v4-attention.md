# V4 head attention experiment

Open `web/cat-v4-attention-study.html`. This is a separate page; the V3 pages,
animation module and model remain unchanged. The old V3 can also be selected
inside the new page for comparison.

The new wrapper imports the original V3 factory, runs the original update,
then applies a bounded head-only offset in the cat root frame. It does not
change the neck, body, limb solver or skin weights. Yaw is bounded to 8 degrees
at rest; the bound contracts continuously to 4 degrees by 0.15 m/s. Pitch is
bounded to 4 degrees. Natural mode alternates short attention holds with longer
neutral intervals, instead of adding a constant left/right oscillation.

The face controls deliberately say head movement. Independent eyes, eyelids
and jaw remain absent. No fake eyelid covers or mouth opening were added.

The CPU regression decodes the real GLB geometry and skin, omitting texture
decode only in memory. Across 1,800 frames at 30 and 60 Hz, all non-head joint
matrices, foot points and gait parameters matched V3 exactly. Reset, bounds,
disable/return and old source hashes passed. See
`assets/cat-v4-attention-matrix-check.json`.

The browser check used D3D11 and passed left/right/down/natural/off actions,
V3 comparison, walking, phone controls and overflow checks without console or
shader errors. It saved six screenshots and an approximately eight-second
left/right/down clip. See `assets/cat-v4-attention-browser-check.json` and
`assets/cat-v4-attention-motion.webm`.

Visual inspection found no obvious facial tears or severe stretching at the
trial extrema. The existing faceted white throat/chest surface is still visible
in both versions; the work does not replace the cat model or improve its surface.
The findings and screenshot names are in
`assets/cat-v4-attention-visual-review.json`.

Verification commands:

```powershell
node projects/007-canal-blender-test/scripts/check_cat_v4_attention.mjs
python projects/007-canal-blender-test/scripts/check_cat_v4_attention_browser.py
```
