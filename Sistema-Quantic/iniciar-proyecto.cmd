@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo No se encontro Node.js. Instala Node.js 22 o posterior y vuelve a abrir esta ventana.
  pause
  exit /b 1
)
node "%~dp0scripts\iniciar-proyecto.cjs"
if errorlevel 1 pause
