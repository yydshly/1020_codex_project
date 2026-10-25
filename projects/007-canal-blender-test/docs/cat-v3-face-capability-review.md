# Cat V3 face capability review

Date: 2026-10-24. Read-only audit; no animation or model was changed.

## Evidence in the current files

- `web/roam-cat-v3.js` loads `web/models/cat-v3-rig.glb` and resets every bone
  to its recorded rest transform on every update (around lines 166–168).
- The current head motion (line 174) is approximately ±0.52° of local X rotation
  and ±1.43° of local Y rotation while idle. The local Y component tends to zero
  during locomotion. This is a quiet head sway, not deliberate attention.
- `web/cat-v3-study.js` passes speed, moving, time and ground height to update.
  It has no head target, eye target, blink, jaw or facial-expression controls.
- The GLB has one mesh primitive, one material, one skin, 21 joints, 40,078
  exported vertices, 49,000 triangles, zero morph targets and zero animation
  clips. The face belongs to the same textured surface as the rest of the cat.
- Joint names comprise root, spine, chest, neck, head, twelve leg joints and
  four tail joints. There are no eye, eyelid, jaw or mouth joints. No independent
  eye mesh is exposed by the asset structure. Whether local geometry can be
  repurposed as an eyelid requires a separate topology and visual inspection.
- Inspecting actual exported skin weights above 0.00001: head affects 8,463
  vertices and has no leg-weight overlap. Neck affects 5,258 vertices, including
  222 shared with fore_left_upper and 239 with fore_right_upper. Rotating neck
  can therefore deform shoulder skin even though leg-joint transforms stay put.
- The preparation metadata explicitly warns that the scan head is already
  slightly turned and that large rotations should be avoided. Bone local axes
  are not equivalent to the scene's Y-up / +Z-forward anatomical axes.

## Minimum independent experiment

Create a new `roam-cat-v3-attention.js` wrapper and a new study page. Import the
existing `createCat` rather than replacing it; use the same unchanged GLB.
On each frame, call the base `update` first, then apply a small head-only
attention offset. The original per-frame bone reset prevents accumulation.
Do not change root, chest, spine, neck, the leg solver, phase or paw contacts.

Start with a conservative relative yaw limit of ±8° while stationary and ±4°
while walking, and pitch within ±4°. These are trial limits, not anatomical
measurements. Preserve the scan's original direction and asymmetry instead of
forcing a straight-facing pose. Disable the offset immediately on reset; keep
separate damped state for target transitions and return to the neutral pose.

For stable axes, convert a small rotation expressed in the cat root frame into
world space, premultiply the head's post-base-update world quaternion, then
convert through the inverse parent world quaternion to set the head's local
quaternion. Do not interpret the bone-local Y Euler angle as a calibrated yaw.
Use a calibrated face-forward vector if a world-space attention point is added.

First controls: neutral, look gently left, look gently right, look slightly up,
and attention on/off. Label this as **head attention / head turning**. It does
not provide independent eyeball movement, blinking, or mouth animation.

## Verification gate

1. With attention disabled, replay the same deterministic walk, stop and turn
   inputs as V3. Root poses, all leg-joint transforms, foot contacts, gait phase
   and maximum reach error must match V3 within floating-point tolerance.
2. With attention enabled, repeat the same sequence and confirm these locomotion
   quantities stay unchanged. Check reset and 30/60 Hz playback for accumulated
   rotation, snapping and unwanted target drift.
3. Inspect front, three-quarter and side face close-ups at the trial extrema.
   Reject stretched throat, cheek tearing or shoulder movement. A successful
   numerical gait comparison cannot replace this visual check.
4. Check the old source/model hashes before and after. The old page remains an
   independent comparison; the new page alone references the wrapper.

## Eyes and mouth: current boundary

Reliable natural blinking is not an available switch on this asset. There are
no eyelid bones or closed-eye morph targets. A future separate model revision
would need identified eye contours, upper/lower eyelid topology or a carefully
prepared local morph, and inspection at open/half-closed/closed poses from more
than one angle. The photographed eye texture must not simply stretch across a
closed lid. A flat patch over the eye could imitate a blink from one view but
is not evidence of a working natural eyelid rig.

Independent gaze likewise needs separated/identified eyeball geometry and
appropriate pivots or another explicitly designed eye system. Rotating the
whole head moves the eye appearance with it; it is not independent eye motion.

Mouth opening needs a jaw/lip deformation setup and plausible inner-mouth
surfaces. The current single closed-mouth scan supplies no jaw control or
validated mouth interior. Keep the mouth unchanged in the minimal head study.

Recommended first acceptance: preserve the cat's present shape and proven walk,
and demonstrate a small, intentional head turn that returns smoothly to rest.
Evaluate real eyelids separately before adding a blink button or making claims
about facial expression quality.
