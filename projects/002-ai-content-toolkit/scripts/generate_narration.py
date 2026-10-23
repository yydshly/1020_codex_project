"""Generate the four authored lesson tracks; credentials stay outside the project."""
import argparse
import hashlib
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODEL = "speech-2.8-hd"
VOICE = "male-qn-qingse"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--env-file", type=Path, required=True)
    args = parser.parse_args()
    config = {}
    for line in args.env_file.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            config[key.strip()] = value.strip().strip("\"'")
    key = config.get("MINIMAX_API_KEY")
    base = config.get("MINIMAX_API_BASE", "https://api.minimaxi.com").rstrip("/")
    parsed = urllib.parse.urlsplit(base)
    if not key or parsed.scheme != "https" or parsed.hostname not in {
        "api.minimaxi.com", "api.minimax.io", "api.minimax.chat", "api.minimax.cn"
    } or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("Missing key or unsupported API endpoint configuration.")
    endpoint = urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, "/v1/t2a_v2", "", ""))
    tracks = json.loads((ROOT / "src/narration.json").read_text(encoding="utf-8"))
    out = ROOT / "assets/audio"
    out.mkdir(parents=True, exist_ok=True)
    manifest_path = out / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {}
    for track in tracks:
        payload = {
            "model": MODEL, "text": track["text"], "stream": False,
            "language_boost": "Chinese", "output_format": "hex",
            "voice_setting": {"voice_id": VOICE, "speed": 0.95, "vol": 1, "pitch": 0},
            "audio_setting": {"sample_rate": 32000, "bitrate": 128000, "format": "mp3", "channel": 1}
        }
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        fingerprint = hashlib.sha256(body).hexdigest()
        path = out / f'{track["id"]}.mp3'
        previous = manifest.get(track["id"], {})
        if path.exists() and previous.get("request_sha256") == fingerprint and previous.get("audio_sha256") == hashlib.sha256(path.read_bytes()).hexdigest():
            print(f'{track["id"]}: reused verified audio', flush=True)
            continue
        print(f'{track["id"]}: generating {len(track["text"])} characters', flush=True)
        request = urllib.request.Request(endpoint, data=body, headers={
            "Authorization": f"Bearer {key}", "Content-Type": "application/json"
        })
        try:
            with urllib.request.urlopen(request, timeout=180) as response:
                result = json.load(response)
        except urllib.error.HTTPError as error:
            raise RuntimeError(f"Speech request failed: HTTP {error.code}") from None
        except Exception:
            raise RuntimeError("Speech request failed before a usable response; no automatic retry.") from None
        code = result.get("base_resp", {}).get("status_code")
        if code != 0:
            raise RuntimeError(f"Speech service returned status code {code}; no automatic retry.")
        audio_hex = result.get("data", {}).get("audio")
        if not isinstance(audio_hex, str) or not audio_hex:
            raise RuntimeError("Speech service returned no audio.")
        audio = bytes.fromhex(audio_hex)
        if len(audio) < 1024:
            raise RuntimeError("Generated audio is unexpectedly short.")
        path.write_bytes(audio)
        extra = result.get("extra_info", {})
        manifest[track["id"]] = {
            "provider": "MiniMax", "model": MODEL, "voice_id": VOICE,
            "file": path.name, "text": track["text"], "speed": 0.95,
            "request_sha256": fingerprint, "audio_sha256": hashlib.sha256(audio).hexdigest(),
            "bytes": len(audio), "duration_ms": extra.get("audio_length"),
            "sample_rate": extra.get("audio_sample_rate"), "format": "mp3",
            "purpose": "Educational narration, not a Kokoro inference sample."
        }
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
        print(f'{track["id"]}: saved {len(audio)} bytes, duration_ms={extra.get("audio_length")}', flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # Never echo HTTP bodies, configuration values or credential-bearing requests.
        print(str(error) if isinstance(error, (RuntimeError, ValueError)) else "Narration generation failed; inspect the local inputs.", file=sys.stderr)
        sys.exit(1)
