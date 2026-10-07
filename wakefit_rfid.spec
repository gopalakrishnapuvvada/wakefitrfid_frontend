# -*- mode: python ; coding: utf-8 -*-
import sys
import os
from pathlib import Path

block_cipher = None

ROOT_DIR = Path(SPECPATH).resolve()


def collect_backend_data():
    """Include backend runtime assets without copying its development database."""
    backend_dir = ROOT_DIR / 'backend'
    excluded_suffixes = {'.db', '.sqlite', '.sqlite3'}
    collected = []

    for current_dir, directory_names, file_names in os.walk(backend_dir):
        directory_names[:] = [
            name for name in directory_names
            if name not in {'__pycache__', '.pytest_cache'}
        ]
        current_path = Path(current_dir)
        for file_name in file_names:
            source = current_path / file_name
            if source.suffix.lower() in excluded_suffixes or source.suffix.lower() == '.pyc':
                continue
            destination = source.parent.relative_to(ROOT_DIR)
            collected.append((str(source), str(destination)))

    return collected

datas = [
    (str(ROOT_DIR / 'frontend' / 'dist'), os.path.join('frontend', 'dist')),
] + collect_backend_data()

hiddenimports = [
    'uvicorn',
    'uvicorn.logging',
    'uvicorn.loops',
    'uvicorn.loops.auto',
    'uvicorn.protocols',
    'uvicorn.protocols.http',
    'uvicorn.protocols.http.auto',
    'uvicorn.protocols.http.h11_impl',
    'uvicorn.protocols.http.httptools_impl',
    'uvicorn.protocols.websockets',
    'uvicorn.protocols.websockets.auto',
    'uvicorn.protocols.websockets.websockets_impl',
    'uvicorn.protocols.websockets.wsproto_impl',
    'uvicorn.lifespan',
    'uvicorn.lifespan.on',
    'uvicorn.lifespan.off',
    'fastapi',
    'starlette',
    'starlette.middleware.cors',
    'starlette.staticfiles',
    'starlette.responses',
    'pydantic',
    'pydantic.deprecated.decorator',
    'sqlalchemy',
    'sqlalchemy.engine',
    'sqlalchemy.dialects.sqlite',
    'sqlalchemy.dialects.sqlite.pysqlite',
    'sqlalchemy.orm',
    'sqlalchemy.sql.default_comparator',
    'multipart',
    'python_multipart',
    'websockets',
    'backend.main',
    'backend.models',
    'backend.schemas',
    'backend.utils.database',
    'backend.utils.dependencies',
    'backend.api.routers.master_data',
    'backend.api.routers.devices',
    'backend.api.routers.roles',
    'backend.api.routers.transactions',
    'backend.api.routers.production',
    'backend.uaim_device.service',
    'backend.uaim_device.api.routes',
    'backend.uaim_device.api.websocket',
]

a = Analysis(
    ['launcher.py'],
    pathex=[str(ROOT_DIR), str(ROOT_DIR / 'backend')],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='WakefitRFID_App',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,
)

