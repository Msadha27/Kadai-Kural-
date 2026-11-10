@echo off
setlocal
cd /d "%~dp0"
if not exist .venv\Scripts\python.exe (
  echo Creating local Python environment...
  py -3 -m venv .venv 2>nul
  if errorlevel 1 python -m venv .venv
  if errorlevel 1 (
    echo Python 3.10 or newer was not found. Install Python from https://www.python.org/downloads/windows/ then run this file again.
    pause
    exit /b 1
  )
)
.venv\Scripts\python.exe -m pip install --upgrade pip
if errorlevel 1 goto failed
.venv\Scripts\python.exe -m pip install -r requirements.txt
if errorlevel 1 goto failed
echo.
echo Open http://localhost:8000 in your browser. Press Ctrl+C here to stop the server.
.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
if errorlevel 1 goto failed
exit /b 0
:failed
echo Setup or server startup failed. Check Python and internet access, then try again.
pause
exit /b 1
