@echo off
cd /d "%~dp0"
echo Starting CLUTCH... (the minimised "CLUTCH server" window must stay open while you play)
start "CLUTCH server" /min "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" serve.py
timeout /t 2 /nobreak >nul
start "" http://localhost:8955
