@echo off
setlocal
set "PROJECT_DIR=%~dp0"
set "NODE_DIR=C:\Users\sanga\Documents\tools\nodejs"
set "PATH=%NODE_DIR%;%PATH%"

if not exist "%PROJECT_DIR%logs" mkdir "%PROJECT_DIR%logs"

start "Reminder Agent Backend" /D "%PROJECT_DIR%backend" cmd /k npm run dev
start "Reminder Agent Frontend" /D "%PROJECT_DIR%frontend" cmd /k npm run dev -- --host 127.0.0.1

echo Backend:  http://localhost:4000
echo Frontend: http://127.0.0.1:5173
