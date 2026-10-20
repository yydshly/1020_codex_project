"""Maintain the ordered research catalog. Python standard library only."""

import argparse
import html
import json
from pathlib import Path
import re
import shutil
import sys
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
REPO = "https://github.com/yydshly/1020_codex_project"
START = "<!-- PROJECTS:START -->"
END = "<!-- PROJECTS:END -->"
STATUSES = {"待研究", "研究中", "已完成", "已归档"}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def text(value):
    """Escape user text for both Markdown tables and HTML."""
    return html.escape(value).replace("|", "&#124;").replace("\n", " ").replace("\r", " ")


def local_file(directory, relative):
    require(isinstance(relative, str) and relative, "文件路径必须为非空字符串")
    require("\\" not in relative, "文件路径请使用 /")
    path = directory / relative
    require(not Path(relative).is_absolute(), "必须使用相对路径")
    require(path.resolve().is_relative_to(directory.resolve()), "文件不能位于项目目录之外")
    require(path.is_file(), f"文件不存在：{path}")
    return path


def load_projects():
    projects = []
    ids = set()
    slugs = set()
    for directory in sorted((ROOT / "projects").iterdir()):
        if not directory.is_dir() or directory.name.startswith("."):
            continue
        metadata = directory / "project.json"
        require(metadata.is_file(), f"缺少元数据：{metadata}")
        p = json.loads(metadata.read_text(encoding="utf-8"))
        require(isinstance(p, dict), f"{metadata} 必须为 JSON 对象")
        ident = p.get("id")
        require(type(ident) is int and ident > 0, "id 必须为正整数")
        slug = p.get("slug", "")
        require(isinstance(slug, str) and re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug),
                "slug 只能包含小写字母、数字和连字符")
        require(ident not in ids and slug not in slugs, "项目 id 或 slug 重复")
        require(directory.name == f"{ident:03d}-{slug}", f"目录名与元数据不匹配：{directory}")
        for key in ("name", "summary", "repo", "status"):
            require(isinstance(p.get(key), str) and p[key].strip(), f"{key} 必须为非空字符串")
        url = urlparse(p["repo"])
        require(url.scheme == "https" and url.netloc == "github.com" and len(url.path.strip("/").split("/")) >= 2,
                "repo 必须为 GitHub 仓库的 HTTPS 地址")
        require(p["status"] in STATUSES, "不支持的研究状态")
        require(type(p.get("web")) is bool, "web 必须为布尔值")
        require(isinstance(p.get("cover"), str), "cover 必须为字符串")
        require(isinstance(p.get("cover_alt"), str), "cover_alt 必须为字符串")
        local_file(directory, "README.md")
        if p["cover"]:
            cover = local_file(directory, p["cover"])
            require(cover.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"},
                    "cover 必须是支持的图片格式")
            require(p["cover_alt"].strip(), "封面必须提供 cover_alt 图片说明")
        if p["web"]:
            local_file(directory, "web/index.html")
            require(not any(path.is_symlink() for path in [directory, directory / "web", *(directory / "web").rglob("*")]),
                    "Web 发布目录不能包含符号链接")
        ids.add(ident)
        slugs.add(slug)
        projects.append({**p, "directory": directory})
    return sorted(projects, key=lambda p: p["id"])


def catalog(projects):
    if not projects:
        return "当前还没有研究项目。第一个项目将从 **001** 开始。"
    lines = [
        "| 编号 | 项目 | 摘要 | 状态 | 入口 |",
        "| --- | --- | --- | --- | --- |",
    ]
    for p in projects:
        path = f"projects/{p['directory'].name}"
        links = f"[研究说明]({path}/README.md) · [上游]({p['repo']})"
        if p["web"]:
            links += f" · [Web 产物]({path}/web/)"
        lines.append(f"| {p['id']:03d} | {text(p['name'])} | {text(p['summary'])} | {p['status']} | {links} |")
    for p in projects:
        if p["cover"]:
            path = f"projects/{p['directory'].name}"
            lines.extend([
                "", f"### {p['id']:03d} · {text(p['name'])}", "",
                f'<a href="{path}/README.md"><img src="{path}/{html.escape(p["cover"], quote=True)}" '
                f'alt="{html.escape(p["cover_alt"], quote=True)}" width="720"></a>',
                "", text(p["cover_alt"]), "", text(p["summary"]),
            ])
    return "\n".join(lines)


def updated_readme(projects):
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    require(readme.count(START) == 1 and readme.count(END) == 1, "README 必须包含唯一索引标记")
    before, remainder = readme.split(START)
    _, after = remainder.split(END)
    return before + START + "\n" + catalog(projects) + "\n" + END + after


def sync(projects):
    (ROOT / "README.md").write_text(updated_readme(projects), encoding="utf-8")


def create(args):
    projects = load_projects()
    require(re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", args.slug), "slug 格式不正确")
    require(args.slug not in {p["slug"] for p in projects}, "slug 已存在")
    require(args.name.strip() and args.summary.strip(), "名称和摘要不能为空")
    url = urlparse(args.repo)
    require(url.scheme == "https" and url.netloc == "github.com" and len(url.path.strip("/").split("/")) >= 2,
            "请提供 GitHub 仓库的 HTTPS 地址")
    ident = max((p["id"] for p in projects), default=0) + 1
    directory = ROOT / "projects" / f"{ident:03d}-{args.slug}"
    directory.mkdir()
    p = dict(id=ident, slug=args.slug, name=args.name, summary=args.summary,
             repo=args.repo, status="待研究", cover="", cover_alt="", web=False)
    (directory / "project.json").write_text(json.dumps(p, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    template = (ROOT / "templates/project/README.md").read_text(encoding="utf-8")
    for key in ("id", "name", "summary", "repo"):
        template = template.replace("{{" + key + "}}", f"{ident:03d}" if key == "id" else str(p[key]))
    (directory / "README.md").write_text(template, encoding="utf-8")
    for name in ("assets", "notes", "src", "web"):
        (directory / name).mkdir()
        (directory / name / ".gitkeep").touch()
    sync(load_projects())
    print(f"Created projects/{directory.name}")


def build(projects):
    output = ROOT / "_site"
    # Only remove our fixed, generated output directory inside this repository.
    require(not output.is_symlink() and output.resolve() == ROOT.resolve() / "_site",
            "生成目录必须为仓库内的 _site，且不能是链接")
    if output.exists():
        shutil.rmtree(output)
    output.mkdir()
    (output / ".nojekyll").touch()
    cards = []
    for p in projects:
        name = p["directory"].name
        destination = output / "projects" / name
        if p["web"]:
            shutil.copytree(p["directory"] / "web", destination,
                            ignore=shutil.ignore_patterns(".gitkeep", ".env", ".env.*", ".git", "node_modules"))
        image = ""
        if p["cover"]:
            cover = local_file(p["directory"], p["cover"])
            image_name = f"{name}{cover.suffix.lower()}"
            (output / "covers").mkdir(exist_ok=True)
            shutil.copyfile(cover, output / "covers" / image_name)
            image = f'<img src="covers/{image_name}" alt="{html.escape(p["cover_alt"], quote=True)}" loading="lazy">'
        demo = f'<a href="projects/{name}/">打开演示 →</a>' if p["web"] else ""
        cards.append(
            f'<article>{image}<p class="meta">{p["id"]:03d} / {p["status"]}</p>'
            f'<h2>{html.escape(p["name"])}</h2><p>{html.escape(p["summary"])}</p>'
            f'<nav><a href="{REPO}/tree/main/projects/{name}">研究说明</a>'
            f'<a href="{html.escape(p["repo"], quote=True)}">上游仓库</a>{demo}</nav></article>'
        )
    body = "\n".join(cards) or '<p class="empty">研究集已就绪，等待收录第一个项目。</p>'
    page = """<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>GitHub 项目研究集</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f7f6f2;color:#202c31;
font:16px/1.75 system-ui,sans-serif}main{max-width:1120px;margin:auto;padding:64px 24px}
header{margin-bottom:48px;max-width:780px}h1{font-size:clamp(32px,6vw,56px);
letter-spacing:-.04em;line-height:1.15}h2{font-size:24px;line-height:1.4}
a{color:#165e55;text-underline-offset:4px}a:focus-visible{outline:3px solid #165e55;outline-offset:4px}
.meta{font-size:13px;letter-spacing:.1em;color:#50625e}.grid{display:grid;
grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:24px}
article{background:white;border:1px solid #dddeda;padding:24px;border-radius:12px;
overflow-wrap:anywhere}article img{width:100%;aspect-ratio:16/9;object-fit:contain;background:#f7f6f2}
nav{display:flex;flex-wrap:wrap;gap:16px}.empty{padding:36px 0;border-top:1px solid #ccc}
footer{margin-top:60px;color:#50625e;font-size:14px}
</style></head><body><main><header><p class="meta">RESEARCH / BUILD / SHARE</p>
<h1>GitHub 项目研究集</h1><p>记录值得研究的开源项目，从原理理解到实践验证。</p>
<a href="REPOSITORY">浏览 GitHub 仓库 ↗</a></header>
<section class="grid" aria-label="研究项目">CARDS</section>
<footer>按项目编号排序 · 持续积累研究与实践</footer></main></body></html>
"""
    (output / "index.html").write_text(page.replace("REPOSITORY", REPO).replace("CARDS", body), encoding="utf-8")
    print(f"Built _site with {len(projects)} project(s)")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    new = commands.add_parser("new", help="创建并自动编号")
    new.add_argument("slug")
    for flag in ("name", "repo", "summary"):
        new.add_argument(f"--{flag}", required=True)
    for name in ("sync", "check", "build"):
        commands.add_parser(name)
    args = parser.parse_args()
    try:
        if args.command == "new":
            create(args)
            return
        projects = load_projects()
        if args.command == "sync":
            sync(projects)
        elif args.command == "check":
            require((ROOT / "README.md").read_text(encoding="utf-8") == updated_readme(projects),
                    "README 索引未同步，请运行 python scripts/projects.py sync")
            print(f"Catalog OK: {len(projects)} project(s)")
        else:
            build(projects)
    except (ValueError, OSError) as error:
        print(f"Error: {error}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
