#!/usr/bin/env python3
"""
Wakefit RFID & Finished Goods Marriage System - Standalone Desktop Launcher
Starts the integrated FastAPI backend & React frontend, then opens the UI in the default browser.
"""
import os
import sys
import time
import threading
import webbrowser
from pathlib import Path
import uvicorn

# Configure paths for standalone bundled execution
if getattr(sys, 'frozen', False):
    # PyInstaller temporary extraction directory
    BASE_DIR = Path(getattr(sys, '_MEIPASS', Path(sys.executable).parent))
    APP_DIR = Path(sys.executable).resolve().parent
else:
    BASE_DIR = Path(__file__).resolve().parent
    APP_DIR = BASE_DIR

# Add backend directory to Python sys.path
backend_path = BASE_DIR / "backend"
if backend_path.exists() and str(backend_path) not in sys.path:
    sys.path.insert(0, str(backend_path))

# Set working directory to APP_DIR so database & uploads stay persistent next to executable
os.chdir(str(APP_DIR))


def open_browser():
    """Wait for server startup and open the application in the default web browser."""
    time.sleep(1.5)
    url = "http://127.0.0.1:8000"
    print(f"\n=======================================================")
    print(f" Wakefit RFID & FG Marriage System is LIVE!")
    print(f" Opening UI in your browser: {url}")
    print(f" Swagger API Docs: {url}/docs")
    print(f" Press Ctrl+C in this terminal to safely stop the server.")
    print(f"=======================================================\n")
    try:
        webbrowser.open(url)
    except Exception as e:
        print(f"Note: Could not automatically open browser: {e}")


def main():
    # Import the FastAPI application
    try:
        from backend.main import app
    except ImportError:
        import main as backend_main
        app = backend_main.app

    # Start browser opener in background thread
    threading.Thread(target=open_browser, daemon=True).start()

    # Run Uvicorn server
    port = int(os.environ.get("PORT", 8000))
    host = os.environ.get("HOST", "0.0.0.0")
    
    uvicorn.run(
        app,
        host=host,
        port=port,
        log_level="info",
        access_log=True,
    )


if __name__ == "__main__":
    main()

