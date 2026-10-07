#!/usr/bin/env python3
"""
Automated Build Script for Wakefit RFID Standalone Executable
Steps:
1. Compiles the React + TypeScript frontend (`npm run build` in `frontend/`).
2. Installs / verifies PyInstaller.
3. Packages the FastAPI backend, SQLite database logic, and React build into a single executable using `wakefit_rfid.spec`.
"""
import os
import sys
import subprocess
import shutil
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = ROOT_DIR / "frontend"
DIST_DIR = ROOT_DIR / "dist"
NPM_COMMAND = "npm.cmd" if os.name == "nt" else "npm"


def run_command(cmd, cwd=ROOT_DIR):
    printable_cmd = subprocess.list2cmdline(cmd) if isinstance(cmd, list) else cmd
    print(f"\n[RUNNING] {printable_cmd} (in {cwd})")
    res = subprocess.run(cmd, shell=isinstance(cmd, str), cwd=str(cwd))
    if res.returncode != 0:
        print(f"[ERROR] Command failed with exit code {res.returncode}: {cmd}")
        sys.exit(res.returncode)


def main():
    print("=" * 60)
    print(" Building Standalone Wakefit RFID & FG Marriage Application")
    print("=" * 60)

    # 1. Build Frontend
    print("\n--- Step 1: Building React Production Bundle ---")
    if not (
        (FRONTEND_DIR / "node_modules" / "typescript" / "bin" / "tsc").exists()
        and (FRONTEND_DIR / "node_modules" / "vite" / "bin" / "vite.js").exists()
    ):
        print("Installing frontend npm dependencies from the lockfile...")
        run_command([NPM_COMMAND, "ci"], cwd=FRONTEND_DIR)
    else:
        print("Reusing the installed frontend npm dependencies.")

    run_command([NPM_COMMAND, "run", "build"], cwd=FRONTEND_DIR)

    if not (FRONTEND_DIR / "dist" / "index.html").exists():
        print("[ERROR] Frontend build failed: frontend/dist/index.html not found.")
        sys.exit(1)
    print("[SUCCESS] Frontend built successfully.")

    # 2. Install backend dependencies, including the pinned PyInstaller package.
    print("\n--- Step 2: Installing Python build dependencies ---")
    run_command(
        [sys.executable, "-m", "pip", "install", "-r", str(ROOT_DIR / "requirements.txt")]
    )

    # 3. Run PyInstaller
    print("\n--- Step 3: Compiling Executable with PyInstaller ---")
    spec_file = ROOT_DIR / "wakefit_rfid.spec"
    run_command(
        [sys.executable, "-m", "PyInstaller", "--clean", "--noconfirm", str(spec_file)],
        cwd=ROOT_DIR,
    )

    print("\n" + "=" * 60)
    print(" [BUILD COMPLETE]")
    print(f" Executable artifact generated in: {DIST_DIR}")
    for item in DIST_DIR.glob("WakefitRFID_App*"):
        size_mb = item.stat().st_size / (1024 * 1024)
        print(f" -> Output File: {item.name} ({size_mb:.1f} MB)")
    print("=" * 60)


if __name__ == "__main__":
    main()

