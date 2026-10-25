"""Copy the reviewed public snapshot into an isolated checkout, without deleting files."""
from pathlib import Path
import argparse
import hashlib
import importlib.util
import json
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
REPO_URL = 'https://github.com/yydshly/1020_codex_project.git'


def sha(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--checkout', required=True)
    args = parser.parse_args()
    checkout = Path(args.checkout).resolve()
    if not (checkout / '.git').exists() or checkout == ROOT.parents[1]:
        raise RuntimeError('Use an isolated Git checkout, not the active research workspace.')
    remote = subprocess.check_output(['git', '-C', str(checkout), 'remote', 'get-url', 'origin'], text=True).strip()
    if remote.rstrip('/') != REPO_URL:
        raise RuntimeError('Unexpected publication destination.')
    dest = checkout / 'projects' / ROOT.name
    dest.mkdir(parents=True, exist_ok=True)
    copied = []

    def copy(source, relative):
        target = dest / relative
        if not target.resolve().is_relative_to(dest):
            raise RuntimeError('Invalid destination.')
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        if sha(source) != sha(target):
            raise RuntimeError('Copy verification failed: ' + str(relative))
        copied.append({'path': str(relative).replace('\\', '/'), 'sha256': sha(target), 'bytes': target.stat().st_size, 'transformation': 'none'})

    for file in sorted((ROOT / 'web').rglob('*')):
        if file.is_file():
            if file.is_symlink() or file.suffix.lower() in ('.zip', '.blend', '.log', '.key', '.pem'):
                raise RuntimeError('Unexpected private/local file in web snapshot: ' + file.name)
            copy(file, file.relative_to(ROOT))
    copy(ROOT / 'project.json', Path('project.json'))
    spec = importlib.util.spec_from_file_location('package_web', ROOT / 'scripts/package_web.py')
    package = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(package)
    for name in set(package.MEDIA_FILES + package.DATA_FILES) | {'reference-initial.png', 'reference-complex.png', 'reference-options.json'}:
        copy(ROOT / 'assets' / name, Path('assets') / name)
    for file in (ROOT / 'web/research-evidence/docs').glob('*.md'):
        copy(file, Path('docs') / file.name)
    for file in (ROOT / 'scripts').iterdir():
        if file.is_file() and file.suffix in ('.py', '.mjs', '.ps1'):
            copy(file, Path('scripts') / file.name)
    # These two tests require local .blend sources, which this web snapshot does not publish.
    local_only = {'test_lookdev_export.py', 'test_viewer_export.py'}
    for file in (ROOT / 'tests').iterdir():
        if file.is_file() and file.name not in local_only and file.suffix in ('.py', '.mjs'):
            copy(file, Path('tests') / file.name)
    readme = (ROOT / 'README.md').read_text(encoding='utf-8').split('\n---\n\n## 以下为 V4 时期历史说明')[0]
    readme = readme.replace('原 V4 主页原字节保留为 [research-v4-original.html](web/research-v4-original.html)；原 README 原字节保留为 [README-v4-original.md](artifacts/research-closure/README-v4-original.md)。', '原 V4 主页原字节保留为 [research-v4-original.html](web/research-v4-original.html)；上次仅本地整理稿保留为 [research-closure-local-original.html](web/research-closure-local-original.html)。原始 README 与 Blender 工程继续在本地研究目录保留。')
    readme += '''

## 公开归档范围

本提交发布完整网页、历史交互页面、GLB、实际效果素材、经过路径净化的文档与证据、实验脚本记录，以及必要的三档参考和完整概述原图。原始 `.blend` 工程、大型逐帧诊断、模型下载包、缓存与运行日志保留在本地，不随静态网页归档上传。

`scripts/` 记录实际实验实现；重新生成部分结果仍需本地对应工程、原始资料及 Blender，不能把本归档当成无需依赖的一键生成器。已发布的 `web/` 可独立静态托管，三维查看依赖已随网页打包。

本次选择三档中最简单预算版建模，不代表另外两张也已实现三维还原。源图、解释概述、真实渲染和实时网页的归属均在研究页区分。

发布流程与线上核验以 GitHub Actions 的对应提交记录为准：[Deploy Pages](https://github.com/yydshly/1020_codex_project/actions/workflows/deploy-pages.yml)。
'''
    (dest / 'README.md').write_text(readme, encoding='utf-8')
    (dest / '.gitignore').write_text('/artifacts/\n*.blend\n*.blend1\n*.zip\n*.log\n__pycache__/\n.cache/\n!web/vendor/three/build/\n!web/vendor/three/build/**\n', encoding='utf-8')
    (dest / '.gitattributes').write_text('web/** -text\nassets/** -text\ndocs/** -text\nscripts/** -text\ntests/** -text\nproject.json -text\nREADME.md -text\n', encoding='utf-8')
    notes = dest / 'notes'
    notes.mkdir(exist_ok=True)
    (notes / 'publication-manifest.json').write_text(json.dumps({'scope': 'Public research snapshot; no scene changes or new modelling.', 'files': copied, 'local_only_excluded': ['raw Blender projects', 'model download packages', 'raw diagnostic logs and caches'], 'readme': 'Public summary generated from the current research README; historical detail remains in preserved web pages.'}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    (notes / 'release.md').write_text('''# 007 图生 3D 研究发布

本次发布三档参考图、专门生成的完整概述、实际图生 3D 过程、源帖与我们的效果、全部历史网页，以及能力边界和投入产出。

本地验证：17 项网页、模型与依赖测试通过；三档原图与概述图 SHA 核对，原场景和旧版本保留检查通过。公开副本包含经过路径净化的证据。实际线上发布结果以本提交对应 GitHub Actions / GitHub Pages 环境为准，不以本地通过替代部署成功。

页面：<https://yydshly.github.io/1020_codex_project/projects/007-canal-blender-test/>；完整概述：<https://yydshly.github.io/1020_codex_project/projects/007-canal-blender-test/overview.html>。

目录摘要强调已经实现从图像生成可编辑、可漫游三维原型；高保真还原与真实动作未达目标。仅最简单预算图实际建模，未对三档或不同模型作公平基准。
''', encoding='utf-8')
    print(json.dumps({'checkout': str(checkout), 'copied_files': len(copied), 'copied_bytes': sum(p['bytes'] for p in copied), 'project': dest.name}, ensure_ascii=False))


if __name__ == '__main__':
    main()
