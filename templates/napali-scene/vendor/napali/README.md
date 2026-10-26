# napali

A drone flight over the Na Pali coast (Kauai), rendered entirely in code.

No textures, no images, no 3D models, no downloaded assets. Terrain, erosion, coastline, ocean, surf and foam, reefs,
palms and forest, rock, clouds, haze, lighting and the colour grade are all generated in WebGL2 shaders and a little
JavaScript, in a single self-contained `index.html`.

![Four frames from the flight](media/overview.jpg)

Built with Claude Code (Claude Opus 5.5) over 13 rounds of agent work, most of them with parallel specialists for water,
sky, terrain and vegetation, a merge step, and a judge that compared each round against a set of reference photos of the
coast.

## Run it

Open `index.html` in a recent Chrome (or any browser with WebGL2) and wait for the shaders to compile. The first load can
take 30-90 s; after that it starts quickly.

| URL | What it shows |
|---|---|
| `index.html` | the drone flight in real time |
| `index.html?mode=still` | the final aerial composition as a high-quality still (`&spp=16` by default) |

In the flight view: `Space` pause, `R` restart, `←` / `→` skip 5 s, `F` fullscreen, `H` toggle the HUD.

The page needs a decent GPU. It was developed on a laptop with an integrated GPU, where a 1672x941 frame takes about
1-2 s offline, so the real-time view drops resolution automatically.

## Render a video

The tools in `tools/` drive headless Chrome over the DevTools protocol. They need Node 22+, Chrome and ffmpeg on the PATH.

```bash
# a still of the final aerial composition (shot.mjs renders mode=still)
node tools/shot.mjs out.png "spp=4&hud=0"

# the whole flight: out.mp4 width height fps samples-per-frame extra-url-params
node tools/video.mjs flight.mp4 1920 1080 30 4 "hud=0&bandpx=5000"

# contact sheet of single frames at the given flight times (seconds)
node tools/video.mjs --sheet sheet.png "10,40,80,120" 960 540 "hud=0"
```

Useful environment variables for `video.mjs`:

| Variable | Effect |
|---|---|
| `SPEED=2.5` | play the flight 2.5x faster (motion blur is scaled to match) |
| `T0=11 T1=22` | render only that part of the video (seconds of video), e.g. to render in crash-safe segments |
| `FRAME_PAUSE_MS=60` | let the GPU idle between frames |
| `ANGLE=vulkan` | ANGLE backend (much faster shader compile than D3D11 on Windows) |
| `CHROME=/path/to/chrome` | Chrome binary if it is not in the default location |

Only one render runs on the GPU at a time: `tools/cdp.mjs` holds a machine-wide lock in the temp folder and rests the GPU
for 20 s after each render. `bandpx` splits each frame into smaller GPU chunks. Both exist because several parallel
renders crashed the graphics driver on an integrated GPU.

The published video was rendered at 1080p30 with 4 samples per frame and `SPEED=2.5` (1,584 frames).

## Build from the parts

`index.html` is generated. Edit the parts in `tools/` and rebuild:

```bash
node tools/rebuild.cjs
```

| File | Contents |
|---|---|
| `v2_template_backup.html` | page, terrain generation and erosion passes, FFT ocean, post-processing chain |
| `v3_geo.glsl` | signed-distance geometry: terrain, rock relief, trees, palms, canopy, ray march, shadows |
| `v3_shade.glsl` | materials and lighting for land, rock, sand and vegetation |
| `v4_water.glsl` | water shading: depth colour, reefs, foam, surf, glints |
| `v4_sky.glsl` | sky dome, volumetric cumulus, cirrus |
| `tweaks.cjs` | string patches on the template: vegetation mask, beach profile, haze, the colour grade |
| `patch_v3.cjs`, `patch_v4.cjs` | splice the GLSL parts and the plant placement pass into the template |
| `v2_flight.js` | camera paths (cinematic flight and FPV keys) |
| `v2_coast.txt`, `v2_coastsdf.txt`, `v2_build.txt` | coastline polygon and terrain build data |

Most look parameters are exposed as URL knobs (see `num('...')` calls in the page), so they can be tuned without a rebuild.

## Credits

- Code: Leon Lin ([@LexnLin](https://x.com/LexnLin)), built with [Claude Code](https://claude.com/claude-code).
- The music in the published video is "Heroic Age" by Kevin MacLeod ([incompetech.com](https://incompetech.com)),
  licensed under [Creative Commons: By Attribution 4.0](http://creativecommons.org/licenses/by/4.0/). It is not part of
  this repository.
- The reference photos used to judge the renders are not included.

## License

[MIT](LICENSE)
