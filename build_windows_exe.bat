@echo off
REM ==============================================================================
REM Wakefit RFID Standalone Executable Build Script for Windows
REM ==============================================================================

echo [1/3] Installing Python backend dependencies...
python -m pip install -r requirements.txt
python -m pip install pyinstaller

echo.
echo [2/3] Building React Frontend UI...
cd frontend
call npm install
call npm run build
cd ..

echo.
echo [3/3] Packaging into Windows Standalone Executable (WakefitRFID_App.exe)...
python -m PyInstaller --clean --noconfirm wakefit_rfid.spec

echo.
echo ==============================================================================
echo Build completed successfully!
echo Executable is located in: dist\WakefitRFID_App.exe
echo ==============================================================================
pause

