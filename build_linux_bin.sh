#!/bin/bash
# ==============================================================================
# Wakefit RFID Standalone Executable Build Script for Linux
# ==============================================================================
set -e

echo "[1/3] Installing Python backend dependencies..."
python3 -m pip install -r requirements.txt || true
python3 -m pip install pyinstaller || true

echo ""
echo "[2/3] Building React Frontend UI..."
cd frontend
npm install
npm run build
cd ..

echo ""
echo "[3/3] Packaging into Standalone Executable (WakefitRFID_App)..."
python3 -m PyInstaller --clean --noconfirm wakefit_rfid.spec

echo ""
echo "=============================================================================="
echo "Build completed successfully!"
echo "Executable is located in: dist/WakefitRFID_App"
echo "=============================================================================="

