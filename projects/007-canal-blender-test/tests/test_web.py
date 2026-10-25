from datetime import date
from html.parser import HTMLParser
import importlib.util
import json
import math
from pathlib import Path
import re
import unittest
from urllib.parse import unquote, urlsplit


PROJECT_DIR = Path(__file__).resolve().parents[1]
WEB_DIR = PROJECT_DIR / 'web'
ASSETS_DIR = PROJECT_DIR / 'assets'
SPEC = importlib.util.spec_from_file_location('package_web', PROJECT_DIR / 'scripts' / 'package_web.py')
PACKAGER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PACKAGER)


class LocalLinks(HTMLParser):
    def __init__(self):
        super().__init__()
        self.targets = []

    def handle_starttag(self, tag, attributes):
        for name, value in attributes:
            if name in ('src', 'href') and value:
                self.targets.append(value)


class WebPackageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.experiment = PACKAGER.read_json(WEB_DIR / 'data' / 'experiment.json')

    def test_media_is_exact_allowlist_and_byte_identical(self):
        actual = {path.name for path in (WEB_DIR / 'media').iterdir()}
        self.assertEqual(actual, set(PACKAGER.MEDIA_FILES))
        self.assertEqual(set(self.experiment['original_image_sha256']), set(PACKAGER.MEDIA_FILES))
        for filename in PACKAGER.MEDIA_FILES:
            with self.subTest(filename=filename):
                source_hash = PACKAGER.sha256(ASSETS_DIR / filename)
                self.assertEqual(PACKAGER.sha256(WEB_DIR / 'media' / filename), source_hash)
                self.assertEqual(self.experiment['original_image_sha256'][filename], source_hash)

    def test_data_is_exact_allowlist_and_statistics_are_unchanged(self):
        actual = {path.name for path in (WEB_DIR / 'data').iterdir()}
        self.assertEqual(actual, set(PACKAGER.DATA_FILES) | {'experiment.json'})
        for filename in PACKAGER.DATA_FILES:
            with self.subTest(filename=filename):
                source_hash = PACKAGER.sha256(ASSETS_DIR / filename)
                self.assertEqual(PACKAGER.sha256(WEB_DIR / 'data' / filename), source_hash)
                self.assertEqual(self.experiment['original_statistics_sha256'][filename], source_hash)

    def test_version_measurements_match_recorded_statistics(self):
        baseline = PACKAGER.read_json(ASSETS_DIR / 'render-v2-stats.json')['complexity_before']
        for version, filename in PACKAGER.VERSION_FILES.items():
            with self.subTest(version=version):
                source = PACKAGER.read_json(ASSETS_DIR / filename)
                published = self.experiment['versions'][version]
                self.assertEqual(published['render_seconds'], source['render_seconds'])
                self.assertEqual(published['total_seconds'], source['total_seconds'])
                self.assertEqual(published['samples'], source['samples_max'])
                self.assertEqual(published['resolution'], source['resolution'])
                self.assertEqual(published['statistics_file'], filename)
                measured = baseline if version == 'v1' else source['complexity_after']
                for field, source_field in PACKAGER.COMPLEXITY_FIELDS.items():
                    self.assertEqual(published['complexity'][field], measured[source_field])
        self.assertEqual(self.experiment['latest_version'], 'v4')
        self.assertEqual(self.experiment['complexity'], self.experiment['versions']['v4']['complexity'])

    def test_alignment_metrics_are_reproducible_and_scoped(self):
        report = PACKAGER.read_json(WEB_DIR / 'data' / self.experiment['alignment_report'])
        self.assertIn('not whole-image similarity', self.experiment['alignment_scope'])
        baseline = report['baseline_v3']
        aligned = report['aligned_v4']
        self.assertEqual([point['name'] for point in baseline['anchors']], [point['name'] for point in aligned['anchors']])
        for version in (baseline, aligned):
            errors = []
            for point in version['anchors']:
                projected = point['projected_normalized_top_left']
                target = point['target_normalized_top_left']
                error = math.hypot((projected[0] - target[0]) * 1672, (projected[1] - target[1]) * 942)
                self.assertAlmostEqual(error, point['error_pixels'], places=4)
                errors.append(error)
            self.assertAlmostEqual(math.sqrt(sum(error ** 2 for error in errors) / len(errors)), version['rms_anchor_error_pixels_at_1672x942'], places=4)
        stats = PACKAGER.read_json(WEB_DIR / 'data' / 'render-v4-stats.json')
        self.assertTrue(stats['v3_unchanged'])
        self.assertTrue(stats['final_artifact_reopened'])
        self.assertTrue(stats['finite_geometry'])
        self.assertFalse(stats['material_changes'])
        self.assertEqual(stats['complexity_before'], stats['complexity_after'])

    def test_experiment_facts_and_scope_are_explicit(self):
        date.fromisoformat(self.experiment['date'])
        first = PACKAGER.read_json(ASSETS_DIR / 'render-stats.json')
        self.assertEqual(self.experiment['blender'], first['blender'])
        self.assertEqual(self.experiment['hardware'], first['devices'])
        for field in ('reference_is_source_post', 'reference_used_as_texture', 'mcp_used', 'dsh_used', 'online_image_to_3d_used', 'source_post_reproduced', 'model_equivalence_tested'):
            self.assertIs(self.experiment[field], False, field)
        self.assertIn('excludes analysis', self.experiment['timing_scope'])
        self.assertIn('load an existing scene', self.experiment['timing_scope'])
        self.assertEqual(self.experiment['original_image_sha256']['reference.png'], first['reference_sha256'])

    def test_published_json_contains_no_local_absolute_paths(self):
        for path in (WEB_DIR / 'data').glob('*.json'):
            with self.subTest(filename=path.name):
                values = [json.loads(path.read_text(encoding='utf-8-sig'))]
                while values:
                    value = values.pop()
                    if isinstance(value, dict):
                        values.extend(value.values())
                    elif isinstance(value, list):
                        values.extend(value)
                    elif isinstance(value, str):
                        self.assertIsNone(re.search(r'(?i)(?:(?<![a-z0-9])[a-z]:[\\/]|file://|\\\\)', value))
                        self.assertFalse(value.startswith(('/home/', '/Users/', '/mnt/')))

    def test_original_control_guide_scope_is_explicit(self):
        guide = self.experiment['control_guide_original']
        self.assertEqual(guide['file'], 'control-guide-original.png')
        self.assertIn('AI-generated explanatory summary', guide['origin'])
        self.assertIs(guide['is_measured_render'], False)
        self.assertIs(guide['source_post_timing_costs_reverified'], False)
        self.assertIs(guide['is_capability_ranking'], False)
        self.assertIn('not a render measured in this experiment', guide['note'])
        self.assertIn('not reverified in this round', guide['note'])
        self.assertIn('not a capability ranking', guide['note'])

    def test_original_and_exploration_guides_coexist(self):
        for filename in ('control-guide-original.png', 'exploration-guide.svg'):
            with self.subTest(filename=filename):
                self.assertIn(filename, PACKAGER.MEDIA_FILES)
                self.assertTrue((ASSETS_DIR / filename).is_file())
                self.assertTrue((WEB_DIR / 'media' / filename).is_file())
        self.assertEqual(
            self.experiment['original_image_sha256']['control-guide-original.png'],
            '859a81d93dd20b277f4df5fe887775466816b77fda3e053428e510edbb474206',
        )

    def test_html_local_src_and_href_targets_exist(self):
        html_files = sorted(WEB_DIR.rglob('*.html'))
        self.assertTrue(html_files, 'The website must include an HTML entry point.')
        for html_file in html_files:
            parser = LocalLinks()
            parser.feed(html_file.read_text(encoding='utf-8-sig'))
            for raw_target in parser.targets:
                target = raw_target.strip()
                parsed = urlsplit(target)
                if not target or target.startswith(('#', '../../')) or parsed.scheme or parsed.netloc:
                    continue
                relative_path = unquote(parsed.path)
                if not relative_path:
                    continue
                with self.subTest(html=html_file.name, target=target):
                    self.assertFalse(relative_path.startswith('/'), 'Local links must work when opening this website from a subdirectory.')
                    destination = (html_file.parent / relative_path).resolve()
                    self.assertTrue(destination.exists(), f'Missing local target: {target}')


if __name__ == '__main__':
    unittest.main()
