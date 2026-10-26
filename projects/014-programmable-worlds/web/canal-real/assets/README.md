# Canal reference material assets

Powered by [Poly Haven](https://polyhaven.com). These files were downloaded from its official API and are **CC0 1.0** assets. The scene consumes only these local files; it does not query the API at runtime. License: <https://polyhaven.com/license>. API terms: <https://github.com/Poly-Haven/Public-API/blob/master/ToS.md>.

`manifest.json` records each file's original download URL, API MD5, verified local SHA-256, size, asset page and artist names. The reproducible acquisition script is `src/canal_photoreal/acquire-assets.py`.

| Asset | Source scan / model dimensions | Intended role |
|---|---|---|
| worn_brick_wall | 2 × 2 m scan | Weathered masonry, with metric UVs |
| cobblestone_01 | 2.4 × 2.4 m scan | Wet paving and joints |
| stone_wall_02 | 2 × 2 m scan | Quay and coping stone |
| wood_peeling_paint_weathered | 0.762 × 0.762 m scan | Exterior weathered paint and joinery |
| roof_slates_02 | 3 × 3 m scan | Real slate joints, colour variation and roughness |
| worn_cracked_plaster | 1.8 × 1.8 m scan | Worn interior plaster |
| kloofendal_overcast_puresky | 2K scene-linear HDR | Measured sky radiance and reflections |
| tree_small_02 | Source bounding box 2.92 × 4.29 × 4.65 m, before glTF axis conversion | One detailed foreground tree; 2.06 M triangles |
| periwinkle_plant | Six individually modeled small-plant variants | Wall-base growth, pots and cracks |

Model glTF diffuse JPEGs do not carry alpha. Explicit source leaf/plant opacity PNGs are also retained; the runtime must assign these to the leaf `alphaMap` and its shadow material. Opacity, normal and roughness textures are data maps; diffuse textures are sRGB colour maps. Textures use OpenGL normal convention. Preserve metric texture scale when changing geometry dimensions.

These are surface and foliage assets for a rendered 3D scene, not pre-rendered backgrounds or substitutes for the interactive effect.
