"""Build a local, full-atlas DEM grid aligned to Jiangshan's Mercator projector.

The output retains measured elevation (including negative bathymetry), in metres.
Clamping, vertical exaggeration and other presentation choices belong to the renderer.
Only this script's atlas terrain cache and two atlas-elevation outputs are written.
"""

from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path
import hashlib
import io
import json
import math
import time
import urllib.request

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "web/assets"
CACHE = ROOT / "assets/atlas-terrain-source"
BOUNDS = dict(west=66, east=142, south=14, north=55)
SCREEN_WIDTH, SCREEN_HEIGHT = 1000, 700
GRID_WIDTH, GRID_HEIGHT = 361, 253
ZOOM = 4
DEGREES = 180 / math.pi


def latitude_to_mercator(latitude):
    return math.log(math.tan(math.pi / 4 + math.radians(latitude) / 2))


NORTH_MERCATOR = latitude_to_mercator(BOUNDS["north"])
longitude_span = BOUNDS["east"] - BOUNDS["west"]
mercator_span_degrees = (
    NORTH_MERCATOR - latitude_to_mercator(BOUNDS["south"])
) * DEGREES
SCALE = min(SCREEN_WIDTH / longitude_span, SCREEN_HEIGHT / mercator_span_degrees)
PAD_X = (SCREEN_WIDTH - longitude_span * SCALE) / 2
PAD_Y = (SCREEN_HEIGHT - mercator_span_degrees * SCALE) / 2


def screen_to_geo(x, y):
    longitude = (x - PAD_X) / SCALE + BOUNDS["west"]
    mercator = NORTH_MERCATOR - (y - PAD_Y) / (SCALE * DEGREES)
    latitude = (2 * math.atan(math.exp(mercator)) - math.pi / 2) * DEGREES
    return longitude, latitude


def tile_xy(longitude, latitude):
    return (
        (longitude + 180) / 360 * 2**ZOOM,
        (1 - math.asinh(math.tan(math.radians(latitude))) / math.pi)
        / 2
        * 2**ZOOM,
    )


def acquire(pair):
    x, y = pair
    url = f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{ZOOM}/{x}/{y}.png"
    target = CACHE / f"{ZOOM}-{x}-{y}.png"
    if target.exists():
        data = target.read_bytes()
    else:
        for attempt in range(3):
            try:
                with urllib.request.urlopen(url, timeout=40) as response:
                    data = response.read()
                # Validate before retaining a response as a source tile.
                with Image.open(io.BytesIO(data)) as candidate:
                    if candidate.size != (256, 256):
                        raise ValueError(f"Unexpected terrain tile dimensions: {candidate.size}")
                    candidate.load()
                target.write_bytes(data)
                break
            except Exception:
                if attempt == 2:
                    raise
                time.sleep(attempt + 1)
    image = Image.open(io.BytesIO(data)).convert("RGB")
    if image.size != (256, 256):
        raise ValueError(f"Invalid cached terrain tile: {target.name}")
    return pair, image, {
        "tile": [ZOOM, x, y],
        "url": url,
        "local_file": str(target.relative_to(ROOT)).replace("\\", "/"),
        "sha256": hashlib.sha256(data).hexdigest(),
        "bytes": len(data),
    }


def main():
    ASSETS.mkdir(parents=True, exist_ok=True)
    CACHE.mkdir(parents=True, exist_ok=True)
    west, north = screen_to_geo(0, 0)
    east, south = screen_to_geo(SCREEN_WIDTH, SCREEN_HEIGHT)
    left, top = tile_xy(west, north)
    right, bottom = tile_xy(east, south)
    tiles = [
        (x, y)
        for x in range(math.floor(left), math.floor(right) + 1)
        for y in range(math.floor(top), math.floor(bottom) + 1)
    ]
    with ThreadPoolExecutor(max_workers=6) as executor:
        records = list(executor.map(acquire, tiles))
    images = {pair: image for pair, image, _ in records}
    heights = []
    for row in range(GRID_HEIGHT):
        y = row / (GRID_HEIGHT - 1) * SCREEN_HEIGHT
        for column in range(GRID_WIDTH):
            x = column / (GRID_WIDTH - 1) * SCREEN_WIDTH
            tx, ty = tile_xy(*screen_to_geo(x, y))
            r, g, b = images[(math.floor(tx), math.floor(ty))].getpixel(
                (min(255, math.floor(tx % 1 * 256)), min(255, math.floor(ty % 1 * 256)))
            )
            heights.append(round(r * 256 + g + b / 256 - 32768))

    assert len(heights) == GRID_WIDTH * GRID_HEIGHT
    assert min(heights) < -1000 and max(heights) > 5000
    projection = {
        "type": "MercatorProjector",
        "width": SCREEN_WIDTH,
        "height": SCREEN_HEIGHT,
        "bounds": BOUNDS,
        "scale": SCALE,
        "padX": PAD_X,
        "padY": PAD_Y,
    }
    payload = {
        "width": GRID_WIDTH,
        "height": GRID_HEIGHT,
        "heights": heights,
        "projection": projection,
        "sample_bounds": {"west": west, "east": east, "south": south, "north": north},
        "units": "meters",
        "ordering": "row-major; screen (0,0) at top left; x eastward, y southward",
        "source": "Mapzen Terrain Tiles / AWS Open Data",
        "accessed": date.today().isoformat(),
    }
    target = ASSETS / "atlas-elevation.json"
    target.write_text(json.dumps(payload, separators=(",", ":")) + "\n", encoding="utf-8")
    manifest = {
        "source": "https://registry.opendata.aws/terrain-tiles/",
        "format_reference": "https://github.com/tilezen/joerd/blob/master/docs/formats.md",
        "attribution_reference": "https://github.com/tilezen/joerd/blob/master/docs/attribution.md",
        "attribution": (
            "Global SRTM / GMTED2010 terrain data courtesy of the U.S. Geological Survey; "
            "global ETOPO1 terrain data from U.S. NOAA."
        ),
        "format": "Terrarium: (R*256+G+B/256)-32768 metres",
        "zoom": ZOOM,
        "accessed": date.today().isoformat(),
        "tiles": [record for _, _, record in records],
        "grid": {"width": GRID_WIDTH, "height": GRID_HEIGHT, "samples": len(heights)},
        "projection": projection,
        "sample_bounds": payload["sample_bounds"],
        "sampling": "Nearest source pixel at each inverse-projected screen grid vertex; rounded to integer metres.",
        "value_range_meters": [min(heights), max(heights)],
        "output": "web/assets/atlas-elevation.json",
        "output_sha256": hashlib.sha256(target.read_bytes()).hexdigest(),
        "presentation": "No height clamping or exaggeration in this dataset; renderers may apply documented display transforms.",
        "license": "Source dataset terms retained; see attribution_reference. No blanket relicensing is asserted.",
    }
    (ASSETS / "atlas-elevation-source.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps({
        "grid": [GRID_WIDTH, GRID_HEIGHT],
        "samples": len(heights),
        "value_range_meters": manifest["value_range_meters"],
        "tiles": len(records),
        "sample_bounds": payload["sample_bounds"],
        "output_bytes": target.stat().st_size,
        "output_sha256": manifest["output_sha256"],
    }, indent=2))


if __name__ == "__main__":
    main()
