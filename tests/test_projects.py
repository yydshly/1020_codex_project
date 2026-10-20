import argparse
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("projects", Path(__file__).resolve().parents[1] / "scripts/projects.py")
projects = importlib.util.module_from_spec(spec)
spec.loader.exec_module(projects)


class CatalogTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        original = projects.ROOT
        self.addCleanup(setattr, projects, "ROOT", original)
        projects.ROOT = Path(self.temp.name)
        (projects.ROOT / "projects").mkdir()
        (projects.ROOT / "README.md").write_text(
            f"# Research\n{projects.START}\n{projects.END}\n", encoding="utf-8")
        templates = projects.ROOT / "templates/project"
        templates.mkdir(parents=True)
        (templates / "README.md").write_text("# {{id}} {{name}}\n{{repo}}\n{{summary}}", encoding="utf-8")

    def add(self, ident, slug, web=False, cover=""):
        directory = projects.ROOT / "projects" / f"{ident:03d}-{slug}"
        directory.mkdir()
        (directory / "README.md").write_text("# Research", encoding="utf-8")
        data = dict(id=ident, slug=slug, name="中文名称", summary="A | B < C",
                    repo="https://github.com/example/repo", status="研究中",
                    cover=cover, cover_alt="界面截图" if cover else "", web=web)
        (directory / "project.json").write_text(json.dumps(data), encoding="utf-8")
        return directory

    def test_numeric_order_and_duplicate_ids(self):
        self.add(1000, "later")
        self.add(2, "earlier")
        self.assertEqual([p["id"] for p in projects.load_projects()], [2, 1000])
        self.add(2, "duplicate")
        with self.assertRaisesRegex(ValueError, "重复"):
            projects.load_projects()

    def test_new_uses_max_id_and_syncs_readme(self):
        self.add(7, "existing")
        projects.create(argparse.Namespace(slug="new-project", name="新项目", summary="研究",
                                           repo="https://github.com/example/new"))
        directory = projects.ROOT / "projects/008-new-project"
        self.assertTrue((directory / "notes/.gitkeep").is_file())
        self.assertIn("# 008 新项目", (directory / "README.md").read_text(encoding="utf-8"))
        readme = (projects.ROOT / "README.md").read_text(encoding="utf-8")
        self.assertIn("008-new-project", readme)
        self.assertIn("A &#124; B &lt; C", readme)

    def test_cover_cannot_escape_project(self):
        self.add(1, "escape", cover="../../README.md")
        with self.assertRaisesRegex(ValueError, "目录之外"):
            projects.load_projects()

    def test_missing_web_entry_rejected(self):
        self.add(1, "missing", web=True)
        with self.assertRaisesRegex(ValueError, "文件不存在"):
            projects.load_projects()

    def test_build_isolates_demos_and_copies_covers(self):
        for ident, slug in [(1, "first"), (2, "second")]:
            directory = self.add(ident, slug, web=True, cover="assets/cover.svg")
            (directory / "web").mkdir()
            (directory / "web/index.html").write_text(f"<h1>{slug}</h1>", encoding="utf-8")
            (directory / "web/.env").write_text("PRIVATE=secret", encoding="utf-8")
            (directory / "assets").mkdir()
            (directory / "assets/cover.svg").write_text('<svg xmlns="http://www.w3.org/2000/svg"/>')
        projects.build(projects.load_projects())
        output = projects.ROOT / "_site"
        self.assertEqual((output / "projects/001-first/index.html").read_text(), "<h1>first</h1>")
        self.assertEqual((output / "projects/002-second/index.html").read_text(), "<h1>second</h1>")
        self.assertFalse((output / "projects/001-first/.env").exists())
        self.assertTrue((output / "covers/001-first.svg").exists())
        self.assertIn('href="projects/002-second/"', (output / "index.html").read_text(encoding="utf-8"))
        self.assertIn('>example/repo</a>', (output / "index.html").read_text(encoding="utf-8"))
        self.assertIn('[example/repo](https://github.com/example/repo)', projects.catalog(projects.load_projects()))
        self.assertIn('[在线研究页](https://yydshly.github.io/1020_codex_project/projects/001-first/)',
                      projects.catalog(projects.load_projects()))
        self.assertIn('<a href="https://yydshly.github.io/1020_codex_project/projects/001-first/"><img',
                      projects.catalog(projects.load_projects()))
        self.assertIn('>在线研究页 →</a>', (output / "index.html").read_text(encoding="utf-8"))
        (output / "stale.html").touch()
        projects.build(projects.load_projects())
        self.assertFalse((output / "stale.html").exists())


if __name__ == "__main__":
    unittest.main()
