# V5 eye location and topology audit

Only new scripts, original-byte texture extraction, and diagnostic artifacts
were written. The V3 model, texture inside the GLB, skin and animation remain
unchanged. The final authoring input is
`assets/cat-v5-eye-landmarks-final.json`, not the initial screenshot picks.

Coordinates are Three root space, in metres, Y-up and +Z-forward. `screenLeft`
and `screenRight` refer to the established face camera, not asserted anatomical
left/right. They can be mapped to the chosen morph names explicitly.

| Root-space frame origin | X | Y | Z |
| --- | ---: | ---: | ---: |
| Screen-left eye | 0.06804863 | 0.34000000 | 0.21728747 |
| Screen-right eye | 0.09553928 | 0.34000000 | 0.17653836 |

These origins remain fixed for the eye-local curves; they sit about 2–3 mm
below the visual aperture centre. Do not recenter them without also shifting
the curve coordinates. The between-eye line implies a horizontal face-forward
direction of approximately `[0.829, 0, 0.559]`, about 56 degrees toward +X from
root +Z. Individual eye planes diverge naturally; their fitted axes are in the
JSON and should not be replaced with mirrored world-axis masks.

The final eye contours were refined against CPU orthographic projections of
the original texture on original triangles. Red aperture contours and cyan
closure lines are saved as `cat-v5-eye-screenLeft-aperture.png` and
`cat-v5-eye-screenRight-aperture.png`. Coordinates of the semantic picks are
actual barycentric surface hits, but their placement on the texture boundary
has approximately 1 mm interpretation accuracy. One upper-lid pick was moved
0.2 mm to hit an adjacent triangle; this adjustment is recorded.

The refined screen-left aperture spans 23.4 mm horizontally and approximately
17.5 mm vertically; screen-right spans 24.8 by 16.8 mm. The JSON contains
piecewise upper/lower curves, four surface landmarks per eye with UV/triangle
indices, conservative depth gates, nearby fur support bounds and touched faces.

There are 45 and 51 exported vertices inside the refined aperture polygons,
respectively. Broader eye neighbourhoods have 340 and 445 vertices, or 314 and
398 distinct positions when welded at 1 micrometre. These counts permit a
bounded geometric closure experiment, but they do not imply animation-ready
eyelid topology. The triangulation is irregular, with large pupil triangles
and several UV seams. See the `*-topology.png` diagnostics.

The eye is not a separate globe. Its colour and pupil are regions of the same
skin texture. Deform by root/local position so all coincident UV-seam vertices
receive the same motion. Account for entire triangles touching the aperture,
because visible iris colour can occur inside triangles whose vertices sample
non-green pixels. Pixel colour alone cannot distinguish pupil, iris, eyelid
and nearby fur reliably.

For a first closure trial, compress the geometric aperture toward the slanted
canthus line and move the nearby upper/lower fur toward it, feathering outside
the supplied support bounds. Do not extend the lower/nose-facing region
indiscriminately. A 0.3–0.5 mm compressed aperture can still leave a visibly
green slit in a close-up; the closed geometry needs a narrower slit and/or
slight inward motion with actual lid occlusion. Verify open, half and fully
closed poses from both eye-plane views and the usual front/three-quarter views.
This audit does not claim that the resulting morph is natural before those
poses have been built and reviewed.
