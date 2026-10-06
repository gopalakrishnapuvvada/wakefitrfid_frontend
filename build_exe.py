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


def run_command(cmd, cwd=ROOT_DIR):
    print(f"\n[RUNNING] {cmd} (in {cwd})")
    res = subprocess.run(cmd, shell=True, cwd=str(cwd))
    if res.returncode != 0:
        print(f"[ERROR] Command failed with exit code {res.returncode}: {cmd}")
        sys.exit(res.returncode)


def main():
    print("=" * 60)
    print(" Building Standalone Wakefit RFID & FG Marriage Application")
    print("=" * 60)

    # 1. Build Frontend
    print("\n--- Step 1: Building React Production Bundle ---")
    if not (FRONTEND_DIR / "node_modules").exists():
        print("Installing frontend npm dependencies...")
        run_command("npm install", cwd=FRONTEND_DIR)
    
    run_command("npm run build", cwd=FRONTEND_DIR)

    if not (FRONTEND_DIR / "dist" / "index.html").exists():
        print("[ERROR] Frontend build failed: frontend/dist/index.html not found.")
        sys.exit(1)
    print("[SUCCESS] Frontend built successfully.")

    # 2. Check / Install PyInstaller
    print("\n--- Step 2: Checking PyInstaller ---")
    try:
        import PyInstaller
        print(f"PyInstaller version {PyInstaller.__version__} is installed.")
    except ImportError:
        print("Installing PyInstaller...")
        run_command(f"{sys.executable} -m pip install pyinstaller")

    # 3. Run PyInstaller
    print("\n--- Step 3: Compiling Executable with PyInstaller ---")
    spec_file = ROOT_DIR / "wakefit_rfid.spec"
    run_command(f"{sys.executable} -m PyInstaller --clean --noconfirm \"{spec_file}\"", cwd=ROOT_DIR)

    print("\n" + "=" * 60)
    print(" [BUILD COMPLETE]")
    print(f" Executable artifact generated in: {DIST_DIR}")
    for item in DIST_DIR.glob("WakefitRFID_App*"):
        size_mb = item.stat().st_size / (1024 * 1024)
        print(f" -> Output File: {item.name} ({size_mb:.1f} MB)")
    print("=" * 60)


if __name__ == "__main__":
    main()

