import os
import shutil
from pathlib import Path


workspace = Path(os.environ['GITHUB_WORKSPACE']).resolve()
assets = workspace / 'release-assets'

if assets.is_symlink() or assets.resolve() != workspace / 'release-assets':
    raise SystemExit('Unexpected release asset path; cleanup stopped')

if assets.is_dir():
    shutil.rmtree(assets)

print('Downloaded release assets removed')
