#!/usr/bin/env python3
"""Losslessly pack the two selected scenes; never modify their source files.

Only the selected R5/R1 manifests and their 49 lightmaps are read. Outputs are
written under --output, one candidate per asset plus a verification manifest.
The browser decoder contract is recorded as gzip / shuffle4-gzip /
shuffle8-gzip / shuffle8-delta-gzip. A codec always returns original bytes.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
from pathlib import Path
import sys
import time


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def shuffle8(raw: bytes) -> bytes:
    if len(raw) % 8:
        raise ValueError("RGBA16F data must contain whole 8-byte pixels")
    return b"".join(raw[channel::8] for channel in range(8))


def unshuffle8(planes: bytes) -> bytes:
    if len(planes) % 8:
        raise ValueError("Shuffled bytes must contain eight equal planes")
    pixels = len(planes) // 8
    raw = bytearray(len(planes))
    for channel in range(8):
        raw[channel::8] = planes[channel * pixels:(channel + 1) * pixels]
    return bytes(raw)


def delta_planes(planes: bytes, restore: bool = False) -> bytes:
    # Optional second experiment, only if the first shuffle pass is too large.
    # Each plane starts with its literal first byte. Subsequent bytes are the
    # difference from the previous original byte modulo 256. No row reset.
    import numpy as np
    data = np.frombuffer(planes, dtype=np.uint8).reshape(8, -1)
    if restore:
        return np.cumsum(data, axis=1, dtype=np.uint8).tobytes()
    out = np.empty_like(data)
    out[:, 0] = data[:, 0]
    np.subtract(data[:, 1:], data[:, :-1], out=out[:, 1:])
    return out.tobytes()


def restore(packed: bytes, codec: str) -> bytes:
    raw = gzip.decompress(packed)
    if codec == "shuffle4-gzip":
        if len(raw) % 4:
            raise ValueError("Four byte planes have unequal lengths")
        stride = len(raw) // 4
        restored = bytearray(len(raw))
        for channel in range(4):
            restored[channel::4] = raw[channel * stride:(channel + 1) * stride]
        return bytes(restored)
    if codec == "shuffle8-delta-gzip":
        raw = delta_planes(raw, restore=True)
    if codec in {"shuffle8-gzip", "shuffle8-delta-gzip"}:
        raw = unshuffle8(raw)
    elif codec != "gzip":
        raise ValueError(f"Unknown codec {codec}")
    return raw


def write_new_or_equal(path: Path, data: bytes, expected_previous_sha: str | None = None) -> None:
    """Never replace an existing unrelated file, even in the output folder."""
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        previous = path.read_bytes()
        if previous != data:
            if expected_previous_sha is None or digest(previous) != expected_previous_sha:
                raise FileExistsError(f"Existing output has different bytes: {path}")
            # The sole allowed replacement is an output from our validated
            # previous manifest, whose complete bytes still match that record.
            with path.open("wb") as handle:
                handle.write(data)
    else:
        with path.open("xb") as handle:
            handle.write(data)


def source_path(root: Path, relative: str) -> Path:
    result = (root / relative).resolve()
    result.relative_to(root)
    return result


def collect(root: Path) -> list[dict]:
    assets = [
        {"sourceFile": "web/canal-real/baked-r4/canal-lightmapped.glb",
         "packedFile": "geometry/canal-lightmapped.glb.gz", "sourceEncoding": "identity"},
        {"sourceFile": "web/canal-real/assets/tree_small_02/tree_small_02.bin",
         "packedFile": "geometry/tree-small-02.bin.gz", "sourceEncoding": "identity"},
    ]
    for scene, relative in [
        ("canal-r5", "web/canal-real/baked-r5/manifest.json"),
        ("station-oak2048", "web/shipyard-station/baked-r1/manifest-oak2048.json"),
    ]:
        manifest_file = source_path(root, relative)
        manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
        for group in manifest["groups"]:
            runtime = group["runtime"]
            source = (manifest_file.parent / runtime["file"]).resolve()
            assets.append({
                "sourceFile": source.relative_to(root).as_posix(),
                "packedFile": f"{scene}/{source.name}",
                "sourceEncoding": "gzip", "manifest": relative,
                "meshName": group["meshName"], "width": runtime["width"],
                "height": runtime["height"], "channels": runtime["channels"],
                "expectedSourceSHA256": runtime["sha256"],
                "expectedRawSHA256": runtime["raw_sha256"],
                "expectedSourceBytes": runtime["bytes"],
                "expectedRawBytes": runtime["raw_bytes"],
            })
    if len(assets) != 51 or len({a["sourceFile"] for a in assets}) != 51:
        raise ValueError("Expected exactly two geometry files and 49 unique GI maps")
    return assets


def pack_one(root: Path, output: Path, asset: dict, delta: bool, previous: dict | None = None,
             geometry_shuffle: bool = False) -> dict:
    started = time.perf_counter()
    source = source_path(root, asset["sourceFile"]).read_bytes()
    source_hash = digest(source)
    if asset.get("expectedSourceSHA256", source_hash) != source_hash:
        raise ValueError(f"Source gzip checksum mismatch: {asset['sourceFile']}")
    if asset.get("expectedSourceBytes", len(source)) != len(source):
        raise ValueError(f"Source gzip byte count mismatch: {asset['sourceFile']}")
    raw = gzip.decompress(source) if asset["sourceEncoding"] == "gzip" else source
    raw_hash = digest(raw)
    if asset.get("expectedRawSHA256", raw_hash) != raw_hash:
        raise ValueError(f"Raw checksum mismatch: {asset['sourceFile']}")
    if asset.get("expectedRawBytes", len(raw)) != len(raw):
        raise ValueError(f"Raw byte count mismatch: {asset['sourceFile']}")
    sizes = {}
    if asset["sourceEncoding"] == "gzip":
        if len(raw) != asset["width"] * asset["height"] * 8:
            raise ValueError("Unexpected RGBA16F dimensions")
        packed, codec = source, "gzip"
        sizes["original-gzip"] = len(source)
        planes = shuffle8(raw)
        candidate = gzip.compress(planes, compresslevel=6, mtime=0)
        sizes["shuffle8-gzip"] = len(candidate)
        if len(candidate) < len(packed):
            packed, codec = candidate, "shuffle8-gzip"
        if delta:
            candidate = gzip.compress(delta_planes(planes), compresslevel=6, mtime=0)
            sizes["shuffle8-delta-gzip"] = len(candidate)
            if len(candidate) < len(packed):
                packed, codec = candidate, "shuffle8-delta-gzip"
    else:
        packed, codec = gzip.compress(raw, compresslevel=6, mtime=0), "gzip"
        sizes["gzip"] = len(packed)
        if geometry_shuffle:
            if len(raw) % 4:
                raise ValueError("Geometry byte count must be a multiple of four")
            candidate = gzip.compress(b"".join(raw[c::4] for c in range(4)), compresslevel=6, mtime=0)
            sizes["shuffle4-gzip"] = len(candidate)
            if len(candidate) < len(packed):
                packed, codec = candidate, "shuffle4-gzip"
    target = output / asset["packedFile"]
    write_new_or_equal(target, packed, previous["packedSHA256"] if previous else None)
    # Verification deliberately reads the actual output file from disk.
    read_back = target.read_bytes()
    restored = restore(read_back, codec)
    if restored != raw or digest(restored) != raw_hash:
        raise ValueError(f"Bit-for-bit restoration failed: {target}")
    if len(read_back) >= 100 * 1024 * 1024:
        raise ValueError(f"Packed file reaches 100 MiB: {target}")
    result = {k: v for k, v in asset.items() if not k.startswith("expected")}
    result.update({
        "codec": codec, "sourceBytes": len(source), "sourceSHA256": source_hash,
        "rawBytes": len(raw), "rawSHA256": raw_hash,
        "packedBytes": len(read_back), "packedSHA256": digest(read_back),
        "savedBytes": len(source) - len(read_back), "candidateBytes": sizes,
        "shuffleStride": 8 if codec.startswith("shuffle8") else 4 if codec == "shuffle4-gzip" else None,
        "bitForBitRestored": True, "verifiedRestoredSHA256": digest(restored),
        "seconds": round(time.perf_counter() - started, 3),
    })
    print(json.dumps({"asset": asset["sourceFile"], "codec": codec,
                      "sourceBytes": len(source), "packedBytes": len(read_back),
                      "savedBytes": result["savedBytes"], "verified": True,
                      "seconds": result["seconds"]}), flush=True)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-project", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--delta", action="store_true", help="Also test byte delta per shuffled plane (NumPy)")
    parser.add_argument("--refine-delta", action="store_true", help="Refine only the 49 GI outputs owned by an existing verified manifest")
    parser.add_argument("--geometry-shuffle", action="store_true", help="Also compare reversible 4-byte planes for the two binary models")
    parser.add_argument("--refine-geometry", action="store_true", help="Refine only the two owned geometry outputs with four byte planes")
    parser.add_argument("--existing-site-bytes", type=int, default=593260366)
    parser.add_argument("--project-base-bytes", type=int, default=662427966)
    parser.add_argument("--site-budget-bytes", type=int, default=1000000000)
    args = parser.parse_args()
    root, output = args.source_project.resolve(), args.output.resolve()
    if output.drive.upper() != "C:":
        raise ValueError("This publishing experiment requires all output on C:")
    if root == output or root in output.parents:
        raise ValueError("Output must be outside the original project")
    manifest_path = output / "manifest.json"
    previous_bytes, previous = None, None
    if args.refine_delta or args.refine_geometry:
        previous_bytes = manifest_path.read_bytes()
        previous = json.loads(previous_bytes)
        if previous.get("schema") != "programmable-worlds-lossless-scene-assets-v1" or not previous.get("allBitForBitRestored"):
            raise ValueError("Refinement requires this script's complete verified manifest")
        if [a["sourceFile"] for a in previous["assets"]] != [a["sourceFile"] for a in collect(root)]:
            raise ValueError("Previous output manifest covers a different source set")
        for asset in previous["assets"]:
            if digest((output / asset["packedFile"]).read_bytes()) != asset["packedSHA256"]:
                raise ValueError("An owned output changed after the first packing run")
        write_new_or_equal(output / ("manifest.before-" + digest(previous_bytes)[:12] + ".json"), previous_bytes)
    elif manifest_path.exists():
        raise FileExistsError("Finished manifest already exists; use a new output directory")
    started = time.perf_counter()
    assets = []
    for index, asset in enumerate(collect(root)):
        old = previous["assets"][index] if previous else None
        if old and ((asset["sourceEncoding"] == "identity" and not args.refine_geometry) or
                    (asset["sourceEncoding"] == "gzip" and not args.refine_delta)):
            assets.append(old)
            continue
        assets.append(pack_one(root, output, asset, args.delta or args.refine_delta, old,
                               args.geometry_shuffle or args.refine_geometry))
    # All 51 original files must still match after the entire CPU-only run.
    for asset in assets:
        if digest(source_path(root, asset["sourceFile"]).read_bytes()) != asset["sourceSHA256"]:
            raise ValueError(f"Original source changed during packing: {asset['sourceFile']}")
    before = sum(a["sourceBytes"] for a in assets)
    after = sum(a["packedBytes"] for a in assets)
    saved = before - after
    projected_project = args.project_base_bytes - saved
    manifest = {
        "schema": "programmable-worlds-lossless-scene-assets-v1", "gzipLevel": 6,
        "assetCount": len(assets), "sourceBytes": before, "packedBytes": after,
        "savedBytes": saved, "savedFraction": saved / before,
        "allBitForBitRestored": True, "allOriginalFilesUnchanged": True,
        "maxPackedFileBytes": max(a["packedBytes"] for a in assets),
        "projection": {"projectBaseBytes": args.project_base_bytes,
                       "projectBytesAfterReplacement": projected_project,
                       "existingSiteBytes": args.existing_site_bytes,
                       "siteBytesAfterReplacement": args.existing_site_bytes + projected_project,
                       "budgetBytes": args.site_budget_bytes,
                       "underBudget": args.existing_site_bytes + projected_project < args.site_budget_bytes,
                       "scope": "Byte accounting estimate, before publication metadata and final full-site build."},
        "decoder": {"gzip": "gzip-decompress",
                    "shuffle4-gzip": "gzip-decompress; output[4*i+c]=planes[c*(length/4)+i]",
                    "shuffle8-gzip": "gzip-decompress; output[8*i+c]=planes[c*(length/8)+i]",
                    "shuffle8-delta-gzip": "gzip-decompress; cumulative sum mod256 independently in each of eight planes; unshuffle8",
                    "deltaPlaneReset": "Only the first byte of each complete plane is literal; never reset at image rows."},
        "seconds": round(time.perf_counter() - started, 3), "assets": assets,
    }
    if previous:
        manifest["refinedFrom"] = {"manifestSHA256": digest(previous_bytes), "packedBytes": previous["packedBytes"],
                                   "additionalSavedBytes": previous["packedBytes"] - after}
    write_new_or_equal(manifest_path, (json.dumps(manifest, indent=2) + "\n").encode(),
                       digest(previous_bytes) if previous_bytes else None)
    print(json.dumps({k: v for k, v in manifest.items() if k not in {"assets", "decoder"}}), flush=True)


if __name__ == "__main__":
    main()
