"""Pinned Na Pali renderer + bounded scene configuration. Python 3.10+, no packages."""
from pathlib import Path
import argparse
import functools
import hashlib
import html
import http.server
import importlib.util
import json
import math
import re
import shutil
import zipfile

ROOT = Path(__file__).resolve().parent
BOUNDS = {
    'mtnH': (160, 600), 'mtnL': (260, 1000), 'vw': (50, 220),
    'K': (0.0005, 0.006), 'eiters': (4, 6000), 'en': (64, 1024),
    'hres': (256, 4096), 'treeDens': (0.5, 2.5), 'vegRange': (500, 3000),
    'wind': (3, 16), 'waveScale': (0.3, 2.5), 'chop': (0.3, 2),
    'fog': (0.00005, 0.0006), 'sunEl': (20, 75), 'sunAz': (-90, 90),
    'expo': (0.7, 1.4), 'sat': (0.8, 1.2), 'spp': (1, 16),
}
GEOMETRY = ('COAST_IMG', 'VALLEYS_IMG', 'CLIFFS_IMG', 'MASSIF_IMG', 'BEACHES_IMG', 'SHELVES_IMG')


def require(ok, message):
    if not ok:
        raise ValueError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def number(value, low, high, name):
    require(type(value) in (int, float) and math.isfinite(value) and low <= value <= high,
            f'{name} must be finite, {low}..{high}')


def verify_vendor():
    lock = read_json(ROOT / 'upstream.lock.json')
    for item in lock['files']:
        data = (ROOT / 'vendor/napali' / item['path']).read_bytes()
        require(sha(data) == item['sha256'], 'Pinned upstream changed: ' + item['path'])
    return lock


def read_config(path):
    config = read_json(path)
    require(config.get('schema') == 'napali-scene-v1', 'Unknown scene schema')
    require(set(config) <= {'schema', 'id', 'title', 'description', 'params', 'render', 'camera', 'geometry'}, 'Unknown scene configuration property')
    require(re.fullmatch(r'[a-z0-9][a-z0-9-]{0,63}', config.get('id', '')), 'Invalid scene id')
    require(isinstance(config.get('title'), str) and 0 < len(config['title']) <= 100, 'Title required')
    require(isinstance(config.get('description'), str), 'Description required')
    params = config.get('params', {})
    require(isinstance(params, dict), 'params must be an object')
    for key, value in params.items():
        require(key in BOUNDS, f'Parameter is not exposed: {key}. Change the adapter explicitly first.')
        number(value, *BOUNDS[key], key)
        if key in ('hres', 'en'):
            require(value == int(value) and int(value) & (int(value) - 1) == 0, key + ' must be a power of two')
        if key in ('eiters', 'spp'):
            require(value == int(value), key + ' must be an integer')
    render = config.get('render', {})
    require(set(render) <= {'scale', 'autoQuality', 'startTime'}, 'Unknown render property')
    number(render.get('scale', 0.5), 0.25, 1, 'render.scale')
    require(type(render.get('autoQuality', True)) is bool, 'autoQuality must be boolean')
    number(render.get('startTime', 0), 0, 600, 'render.startTime')
    camera = config.get('camera', {})
    require(isinstance(camera, dict) and set(camera) <= {'keyframes'}, 'Unknown camera property')
    if 'keyframes' in camera:
        keys = camera['keyframes']
        require(isinstance(keys, list) and 2 <= len(keys) <= 64, 'Need 2..64 cinematic camera keys')
        last = -1
        for key in keys:
            require(isinstance(key, list) and len(key) == 8, 'Camera key = [time,x,y,z,lookX,lookY,lookZ,fov]')
            for value in key:
                number(value, -10000, 10000, 'camera key')
            require(last < key[0] <= 600 and 20 <= key[7] <= 90, 'Camera time must increase; fov 20..90')
            require(math.dist(key[1:4], key[4:7]) > 0.01, 'Camera cannot look at its own position')
            last = key[0]
        require(keys[0][0] == 0, 'Camera must start at time zero')
        # The source cinematic camera eases into the reference composition at its end.
        require(keys[-1][1:7] == [0, 1000, 0, 0, 0, 839.1] and keys[-1][7] == 38,
                'Keep the reference end key, or adapt and validate the source settle logic first')
    if config.get('geometry'):
        require(isinstance(config['geometry'], str), 'geometry must be a JSON file path')
        geometry = read_json(path.parent / config['geometry'])
        require(isinstance(geometry, dict) and set(geometry) <= set(GEOMETRY), 'Unknown geometry field')
        for name, rows in geometry.items():
            require(isinstance(rows, list) and 1 <= len(rows) <= 128, name + ' must contain 1..128 rows')
            if name == 'VALLEYS_IMG':
                require(all(isinstance(row, list) and 2 <= len(row) <= 64 for row in rows), 'Valley needs 2..64 axis points')
                rows = [point for row in rows for point in row]
            for row in rows:
                require(isinstance(row, list) and (len(row) >= 6 and len(row) % 2 == 0 if name == 'COAST_IMG' else len(row) == 4), 'Invalid geometry row: ' + name)
                for value in row:
                    number(value, -2000, 6000, name)
    else:
        geometry = {}
    return config, geometry


def replace_array(source, name, value):
    pattern = r'const ' + name + r' = \[[\s\S]*?\n?\];'
    source, count = re.subn(pattern, lambda _: 'const ' + name + ' = ' + json.dumps(value, separators=(',', ':')) + ';', source, count=1)
    require(count == 1, 'Source array anchor changed: ' + name)
    return source


def build(config_path, output):
    lock = verify_vendor()
    config, geometry = read_config(config_path)
    output = output.resolve()
    require(output != ROOT and not ROOT.is_relative_to(output) and not output.is_relative_to(ROOT / 'vendor')
            and not output.is_relative_to(ROOT / 'engine') and not output.is_relative_to(ROOT / 'configs'), 'Unsafe output directory')
    if output.exists() and any(output.iterdir()):
        require((output / 'scene-build.json').is_file(), 'Output is not a managed scene build; choose an empty directory')
    spec = importlib.util.spec_from_file_location('napali_adapter', ROOT / 'engine/build_runtime.py')
    adapter = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(adapter)
    content, report = adapter.build()
    source = content.decode('utf-8').replace('\r\n', '\n')
    original_templates = re.findall(r'`(?:\\.|[^`])*`', source, re.DOTALL)
    query = {**config.get('params', {}), 'rs': config.get('render', {}).get('scale', 0.5),
             'auto': int(config.get('render', {}).get('autoQuality', True)),
             't': config.get('render', {}).get('startTime', 0)}
    config_json = json.dumps(config, ensure_ascii=False).replace('<', '\\u003c')
    query_json = json.dumps({k: str(v) for k, v in query.items()})
    initialization = ('const TEMPLATE_CONFIG = ' + config_json + ';\nconst Q = new URLSearchParams(' + query_json + ');\n'
                      "addEventListener('error',event=>{const message='Error: '+event.message;const load=document.getElementById('loadtxt');if(load)load.textContent=message;if(parent!==window)parent.postMessage({type:'napali-template-error',detail:message},location.origin);});\n"
                      'const requested = new URLSearchParams(location.search);\n'
                      "for (const [key,lo,hi] of [['t',0,600],['rs',0.25,1]]) { if(requested.has(key)){const n=Number(requested.get(key));if(Number.isFinite(n)&&n>=lo&&n<=hi)Q.set(key,String(n));} }\n"
                      "if(requested.get('hud')==='1')Q.set('hud','1');\n")
    require(source.count('const Q = new URLSearchParams(location.search);') == 1, 'Query anchor changed')
    source = source.replace('const Q = new URLSearchParams(location.search);', initialization)
    for name, rows in geometry.items():
        source = replace_array(source, name, rows)
    if config.get('camera', {}).get('keyframes'):
        source = replace_array(source, 'CINE', config['camera']['keyframes'])
    require(re.findall(r'`(?:\\.|[^`])*`', source, re.DOTALL) == original_templates,
            'GLSL/template preservation failed')
    source = source.replace('</body>', '<script src="adapter.js"></script>\n</body>')
    source = re.sub(r'<title>.*?</title>', '<title>' + html.escape(config['title']) + '</title>', source, count=1)
    output.mkdir(parents=True, exist_ok=True)
    files = {'engine.html': source, 'scene-config.json': json.dumps(config, ensure_ascii=False, indent=2) + '\n'}
    for name in ('controller.js', 'controller.css', 'adapter.js', 'launcher.js', 'launcher.css', 'embed.js'):
        files[name] = (ROOT / 'engine' / name).read_text(encoding='utf-8')
    files['index.html'] = (ROOT / 'engine/launcher.html').read_text(encoding='utf-8')
    for name, value in files.items():
        (output / name).write_bytes(value.encode('utf-8'))
    shutil.copyfile(ROOT / 'vendor/napali/LICENSE', output / 'LICENSE.napali')
    report.update({'schema': 'napali-build-v1', 'scene': config['id'], 'upstreamCommit': lock['commit'],
                   'configSHA256': sha(config_path.read_bytes()), 'glsl_unchanged': True,
                   'geometrySHA256': sha(json.dumps(geometry, sort_keys=True, separators=(',', ':')).encode()),
                   'geometryOverrides': list(geometry), 'customCamera': bool(config.get('camera', {}).get('keyframes')),
                   'worldQualityReduced': config.get('params', {}).get('eiters', 4000) < 4000 or config.get('params', {}).get('en', 1024) < 1024 or config.get('params', {}).get('hres', 4096) < 4096,
                   'files': {name: sha((output / name).read_bytes()) for name in files}})
    report['runtime_sha256'] = report['files']['engine.html']
    (output / 'scene-build.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    for name in ('build', 'serve', 'verify'):
        child = commands.add_parser(name)
        child.add_argument('--config', type=Path, default=ROOT / 'configs/baseline.json')
        if name != 'verify':
            child.add_argument('--output', type=Path, default=ROOT / 'build')
        if name == 'serve':
            child.add_argument('--port', type=int, default=8820)
    new = commands.add_parser('new')
    new.add_argument('--output', type=Path, required=True)
    new.add_argument('--name', default='my-coast')
    package = commands.add_parser('package')
    package.add_argument('--output', type=Path, default=ROOT.parent / 'napali-scene-starter.zip')
    args = parser.parse_args()
    if args.command == 'package':
        verify_vendor()
        destination = args.output.resolve()
        require(destination.suffix.lower() == '.zip' and not destination.is_relative_to(ROOT), 'ZIP must be outside the template directory')
        destination.parent.mkdir(parents=True, exist_ok=True)
        count = 0
        with zipfile.ZipFile(destination, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            for file in sorted(ROOT.rglob('*')):
                if not file.is_file() or any(part in {'build', 'artifacts', '__pycache__', 'node_modules', '.git'} for part in file.relative_to(ROOT).parts):
                    continue
                info = zipfile.ZipInfo('napali-scene/' + file.relative_to(ROOT).as_posix(), (2026, 10, 27, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                archive.writestr(info, file.read_bytes())
                count += 1
        print(json.dumps({'status': 'packaged', 'files': count, 'bytes': destination.stat().st_size, 'sha256': sha(destination.read_bytes()), 'output': str(destination)}))
        return
    if args.command == 'new':
        require(re.fullmatch(r'[a-z0-9][a-z0-9-]{0,63}', args.name), 'Invalid scene name')
        destination = args.output.resolve()
        require(not destination.exists(), 'Destination already exists; nothing overwritten')
        require(not destination.is_relative_to(ROOT), 'Create the scene outside the template')
        shutil.copytree(ROOT, destination, ignore=shutil.ignore_patterns('build', '__pycache__', 'artifacts', '*.log'))
        config = read_json(destination / 'configs/baseline.json')
        config.update({'id': args.name, 'title': args.name})
        (destination / 'configs/scene.json').write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print('Created ' + str(destination) + '\nNext: python scene.py serve --config configs/scene.json')
        return
    config_path = args.config.resolve()
    if args.command == 'verify':
        lock = verify_vendor()
        config, geometry = read_config(config_path)
        print(json.dumps({'status': 'passed', 'vendorFiles': len(lock['files']), 'scene': config['id'], 'geometryOverrides': list(geometry)}))
        return
    report = build(config_path, args.output)
    print(json.dumps({'status': 'built', 'output': str(args.output.resolve()), 'glslUnchanged': report['glsl_unchanged'], 'worldQualityReduced': report['worldQualityReduced']}), flush=True)
    if args.command == 'serve':
        require(1024 <= args.port <= 65535, 'Port must be 1024..65535')
        handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(args.output.resolve()))
        with http.server.ThreadingHTTPServer(('127.0.0.1', args.port), handler) as server:
            print(f'Open http://127.0.0.1:{args.port}/ — explicit Start; no browser opened. Ctrl+C stops this server.', flush=True)
            server.serve_forever()


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, json.JSONDecodeError) as error:
        raise SystemExit(str(error))
