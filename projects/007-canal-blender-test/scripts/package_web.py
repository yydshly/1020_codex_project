import argparse
from datetime import date
import hashlib
import json
from pathlib import Path
import shutil


PROJECT_DIR = Path(__file__).resolve().parents[1]
EXPERIMENT_DATE = '2026-10-23'
MEDIA_FILES = (
    'reference.png',
    'render.png',
    'render-v2.png',
    'render-v3.png',
    'render-v4.png',
    'overview.png',
    'overview-v4.png',
    'exploration-guide.svg',
    'control-guide-original.png',
)
DATA_FILES = (
    'render-stats.json',
    'render-v2-stats.json',
    'render-v3-stats.json',
    'render-v4-stats.json',
    'alignment-v4.json',
    'viewer-source-audit.json',
    'scene-checks.json',
)
VERSION_FILES = {
    'v1': 'render-stats.json',
    'v2': 'render-v2-stats.json',
    'v3': 'render-v3-stats.json',
    'v4': 'render-v4-stats.json',
}
COMPLEXITY_FIELDS = {
    'objects': 'objects',
    'vertices': 'mesh_vertices',
    'faces': 'mesh_faces',
    'lights': 'lights',
    'modifiers': 'modifiers',
}


def sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def complexity(source):
    return {key: source[source_key] for key, source_key in COMPLEXITY_FIELDS.items()}


def experiment_data(assets, experiment_date):
    date.fromisoformat(experiment_date)
    statistics = {version: read_json(assets / filename) for version, filename in VERSION_FILES.items()}
    checks = read_json(assets / 'scene-checks.json')
    original_hashes = {filename: sha256(assets / filename) for filename in MEDIA_FILES}
    first = statistics['v1']
    baseline = statistics['v2']['complexity_before']
    if baseline['objects'] != first['object_count'] or baseline['mesh_vertices'] != first['mesh_vertices']:
        raise ValueError('Saved baseline complexity does not match the first render statistics.')
    if original_hashes['reference.png'] != first['reference_sha256']:
        raise ValueError('Reference image hash does not match the render statistics.')
    versions = {}
    for version, source in statistics.items():
        measured_complexity = baseline if version == 'v1' else source['complexity_after']
        versions[version] = {
            'render_seconds': source['render_seconds'],
            'total_seconds': source['total_seconds'],
            'samples': source['samples_max'],
            'resolution': source['resolution'],
            'complexity': complexity(measured_complexity),
            'statistics_file': VERSION_FILES[version],
            'execution_scope': 'Build scene and render once' if version == 'v1' else 'Load saved scene, adjust, save, reopen and render once',
        }
    return {
        'date': experiment_date,
        'blender': first['blender'],
        'hardware': first['devices'],
        'render_engine': 'Cycles',
        'method': 'Codex-authored Python scripts, local Blender bpy execution, Cycles rendering and visual iteration',
        'reference_is_source_post': False,
        'reference_origin': 'Separately generated concept image selected in this conversation for this local experiment',
        'reference_used_as_texture': checks['reference_used_as_texture'],
        'mcp_used': False,
        'dsh_used': False,
        'online_image_to_3d_used': False,
        'source_post_reproduced': False,
        'model_equivalence_tested': False,
        'control_guide_original': {
            'file': 'control-guide-original.png',
            'origin': 'Earlier AI-generated explanatory summary from this conversation',
            'is_measured_render': False,
            'source_post_timing_costs_reverified': False,
            'is_capability_ranking': False,
            'note': 'Earlier explanatory summary, not a render measured in this experiment. Source-post timing and costs shown inside the image were not reverified in this round. This image is not a capability ranking.',
        },
        'versions': versions,
        'complexity': versions['v4']['complexity'],
        'latest_version': 'v4',
        'alignment_report': 'alignment-v4.json',
        'alignment_scope': 'Manually selected anchor projection errors only; not whole-image similarity or a model capability benchmark.',
        'complexity_unchanged_across_versions': len({json.dumps(item['complexity'], sort_keys=True) for item in versions.values()}) == 1,
        'baseline_complexity_source': 'render-v2-stats.json:complexity_before; objects and vertices cross-checked against render-stats.json',
        'timing_scope': 'One recorded script execution per final render; excludes analysis, coding, preview iterations and total project time. Later versions load an existing scene.',
        'geometry_scope': 'Counts describe base meshes and objects. Existing positions, vertex coordinates, materials and compositor nodes may change.',
        'validation_scope': checks['scope'],
        'original_image_sha256': original_hashes,
        'original_statistics_sha256': {filename: sha256(assets / filename) for filename in DATA_FILES},
        'source_links': {
            'research_starting_post': 'https://x.com/cccch1mneyyyy/status/2112080631689826482',
            'blender_python': 'https://docs.blender.org/api/4.5/info_overview.html',
            'blender_command_line': 'https://docs.blender.org/manual/en/4.5/advanced/command_line/arguments.html',
            'dsh_plugin': 'https://github.com/sixtysevenlf/dsh-blender-plugin',
            'mcp_for_blender': 'https://github.com/ahujasid/mcp-for-blender',
        },
        'source_post_verification': 'Public page returned HTTP 403 during this audit; original inputs, costs and timing were not independently verified.',
    }


def package(project_dir=PROJECT_DIR, experiment_date=EXPERIMENT_DATE):
    assets = project_dir / 'assets'
    for filename in MEDIA_FILES + DATA_FILES:
        if not (assets / filename).is_file():
            raise FileNotFoundError(f'Required allowlisted asset is missing: {filename}')
    experiment = experiment_data(assets, experiment_date)
    media_dir = project_dir / 'web' / 'media'
    data_dir = project_dir / 'web' / 'data'
    media_dir.mkdir(parents=True, exist_ok=True)
    data_dir.mkdir(parents=True, exist_ok=True)
    for filenames, destination in ((MEDIA_FILES, media_dir), (DATA_FILES, data_dir)):
        for filename in filenames:
            source = assets / filename
            target = destination / filename
            shutil.copy2(source, target)
            if sha256(source) != sha256(target):
                raise RuntimeError(f'Copied asset failed hash verification: {filename}')
    (data_dir / 'experiment.json').write_text(json.dumps(experiment, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return experiment


def main():
    parser = argparse.ArgumentParser(description='Package allowlisted original images and measured experiment data for the local website.')
    parser.add_argument('--date', default=EXPERIMENT_DATE, help='Experiment date in YYYY-MM-DD format.')
    options = parser.parse_args()
    package(experiment_date=options.date)
    print(f'Packaged {len(MEDIA_FILES)} unchanged media files and {len(DATA_FILES) + 1} data files.')


if __name__ == '__main__':
    main()
