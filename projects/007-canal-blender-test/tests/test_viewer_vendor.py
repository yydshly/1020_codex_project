import hashlib
import json
from pathlib import Path
import re
import unittest


PROJECT_DIR = Path(__file__).resolve().parents[1]
WEB_DIR = PROJECT_DIR / 'web'
VENDOR_DIR = WEB_DIR / 'vendor' / 'three'
STATIC_IMPORT = re.compile(
    r'\b(?:import|export)\s*'
    r'(?:\{[^}]*\}|\*[^;]*?|[A-Za-z_$][\w$]*(?:\s*,\s*\{[^}]*\})?)'
    r'''\s*from\s*["']([^"']+)["']'''
)
SIDE_EFFECT_IMPORT = re.compile(r'''\bimport\s*["']([^"']+)["']''')


def module_imports(source):
    without_comments = re.sub(r'/\*[\s\S]*?\*/|(?m:^\s*//.*$)', '', source)
    return set(STATIC_IMPORT.findall(without_comments)) | set(SIDE_EFFECT_IMPORT.findall(without_comments))


class ViewerVendorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = json.loads((VENDOR_DIR / 'sources.json').read_text(encoding='utf-8'))
        cls.records = {record['path']: record for record in cls.manifest['files']}

    def test_vendor_files_match_pinned_source_hashes_and_sizes(self):
        self.assertEqual(self.manifest['package'], 'three')
        self.assertEqual(self.manifest['version'], '0.180.0')
        for relative, record in self.records.items():
            with self.subTest(path=relative):
                contents = (VENDOR_DIR / relative).read_bytes()
                self.assertEqual(len(contents), record['bytes'])
                self.assertEqual(hashlib.sha256(contents).hexdigest(), record['sha256'])
                self.assertEqual(record['url'], 'https://cdn.jsdelivr.net/npm/three@0.180.0/' + relative)

    def test_all_static_imports_resolve_to_bundled_local_modules(self):
        import_map = self.manifest['import_map_relative_to_web_root']
        for relative, record in self.records.items():
            if not relative.endswith('.js'):
                continue
            with self.subTest(path=relative):
                module_path = VENDOR_DIR / relative
                imports = module_imports(module_path.read_text(encoding='utf-8'))
                self.assertEqual(imports, set(record['imports']))
                for specifier in imports:
                    if specifier.startswith('.'):
                        resolved = (module_path.parent / specifier).resolve()
                    else:
                        self.assertIn(specifier, import_map)
                        resolved = (WEB_DIR / import_map[specifier]).resolve()
                    self.assertTrue(resolved.is_relative_to(VENDOR_DIR.resolve()))
                    self.assertTrue(resolved.is_file(), f'{relative} imports missing {specifier}')
                    self.assertIn(resolved.relative_to(VENDOR_DIR).as_posix(), self.records)

    def test_all_local_modules_are_recorded_and_entrypoints_are_present(self):
        recorded = {relative for relative in self.records if relative.endswith('.js')}
        actual = {path.relative_to(VENDOR_DIR).as_posix() for path in VENDOR_DIR.rglob('*.js')}
        self.assertEqual(actual, recorded)
        for entrypoint in ('build/three.module.min.js', 'examples/jsm/controls/OrbitControls.js', 'examples/jsm/loaders/GLTFLoader.js', 'examples/jsm/objects/Reflector.js', 'examples/jsm/loaders/RGBELoader.js', 'examples/jsm/loaders/HDRLoader.js'):
            self.assertIn(entrypoint, recorded)
        for target in self.manifest['import_map_relative_to_web_root'].values():
            self.assertFalse(target.startswith(('http:', 'https:', '//')))
            self.assertTrue((WEB_DIR / target).exists())

    def test_upstream_mit_license_is_preserved(self):
        license_text = (VENDOR_DIR / self.manifest['license_file']).read_text(encoding='utf-8')
        self.assertEqual(self.manifest['license'], 'MIT')
        self.assertIn('The MIT License', license_text)
        self.assertIn('Copyright © 2010-2025 three.js authors', license_text)
        self.assertIn('Permission is hereby granted', license_text)


if __name__ == '__main__':
    unittest.main()
