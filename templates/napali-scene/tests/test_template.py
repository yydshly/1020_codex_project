from pathlib import Path
import importlib.util
import json
import re
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('scene', ROOT / 'scene.py')
scene = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scene)


class TemplateContracts(unittest.TestCase):
    def test_source_modules_and_all_shader_templates_survive_build(self):
        with tempfile.TemporaryDirectory(prefix='napali-template-test-') as tmp:
            output = Path(tmp) / 'site'
            report = scene.build(ROOT / 'configs/baseline.json', output)
            original = (ROOT / 'vendor/napali/index.html').read_text(encoding='utf-8')
            built = (output / 'engine.html').read_text(encoding='utf-8')
            shaders = lambda text: re.findall(r'`(?:\\.|[^`])*`', text, re.DOTALL)
            self.assertEqual(shaders(original), shaders(built))
            self.assertFalse(report['worldQualityReduced'])
            self.assertFalse(report['customCamera'])
            self.assertEqual(report['geometryOverrides'], [])
            self.assertEqual(report['files']['engine.html'], scene.sha((output / 'engine.html').read_bytes()))

    def test_scene_changes_do_not_change_renderer(self):
        with tempfile.TemporaryDirectory(prefix='napali-template-test-') as tmp:
            a, b = Path(tmp) / 'a', Path(tmp) / 'b'
            scene.build(ROOT / 'configs/baseline.json', a)
            report = scene.build(ROOT / 'configs/coast-camera-study.json', b)
            self.assertTrue(report['customCamera'])
            shaders = lambda p: re.findall(r'`(?:\\.|[^`])*`', p.read_text(encoding='utf-8'), re.DOTALL)
            self.assertEqual(shaders(a / 'engine.html'), shaders(b / 'engine.html'))
            self.assertNotEqual((a / 'engine.html').read_bytes(), (b / 'engine.html').read_bytes())

    def test_refuse_unknown_parameters_invalid_routes_and_foreign_output(self):
        baseline = scene.read_json(ROOT / 'configs/baseline.json')
        with tempfile.TemporaryDirectory(prefix='napali-template-test-') as tmp:
            config_path = Path(tmp) / 'bad.json'
            for key, value in [('camH', 1100), ('hres', 900), ('fog', float('nan'))]:
                config = {**baseline, 'params': {key: value}}
                config_path.write_text(json.dumps(config), encoding='utf-8')
                with self.assertRaises(ValueError):
                    scene.read_config(config_path)
            config = {**baseline, 'camera': {'keyframes': [[1, 0, 20, 0, 0, 0, 10, 50], [0, 0, 20, 0, 0, 0, 10, 50]]}}
            config_path.write_text(json.dumps(config), encoding='utf-8')
            with self.assertRaises(ValueError):
                scene.read_config(config_path)
            (Path(tmp) / 'keep.txt').write_text('existing work', encoding='utf-8')
            with self.assertRaises(ValueError):
                scene.build(ROOT / 'configs/baseline.json', Path(tmp))
            self.assertEqual((Path(tmp) / 'keep.txt').read_text(), 'existing work')

    def test_configuration_text_cannot_escape_script(self):
        baseline = scene.read_json(ROOT / 'configs/baseline.json')
        with tempfile.TemporaryDirectory(prefix='napali-template-test-') as tmp:
            baseline['title'] = '</script><script>throw 1</script>'
            config = Path(tmp) / 'config.json'
            config.write_text(json.dumps(baseline), encoding='utf-8')
            output = Path(tmp) / 'site'
            scene.build(config, output)
            source = (output / 'engine.html').read_text(encoding='utf-8')
            self.assertNotIn('</script><script>throw 1', source)
            self.assertIn('\\u003c/script>', source)

    def test_original_geometry_can_be_reused_as_external_scene_data(self):
        baseline = scene.read_json(ROOT / 'configs/baseline.json')
        with tempfile.TemporaryDirectory(prefix='napali-template-test-') as tmp:
            baseline['geometry'] = str(ROOT / 'configs/geometry.original.json')
            config = Path(tmp) / 'config.json'
            config.write_text(json.dumps(baseline), encoding='utf-8')
            output = Path(tmp) / 'site'
            report = scene.build(config, output)
            self.assertEqual(set(report['geometryOverrides']), set(scene.GEOMETRY))
            self.assertTrue(report['glsl_unchanged'])


if __name__ == '__main__':
    unittest.main()
