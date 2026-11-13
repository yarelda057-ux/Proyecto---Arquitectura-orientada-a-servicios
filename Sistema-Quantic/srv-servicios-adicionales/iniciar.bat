@echo off
title Quantic Technology - Microservicio de Servicios Adicionales
cd /d "%~dp0"
echo ============================================================
echo  Quantic Technology S.A.C.
echo  Microservicio: Directorio de Servicios Adicionales TI
echo ============================================================
echo.

IF NOT EXIST "node_modules\" (
  echo [Info] Primera ejecucion detectada: Instalando dependencias...
  call npm install
  echo.
)

IF NOT EXIST ".env" (
  IF EXIST ".env.example" (
    echo [Info] Generando archivo de configuracion .env...
    copy .env.example .env
  )
)

echo [Info] Iniciando servidor Node.js y API REST en puerto 3002...
echo Presione Ctrl + C para detener el servidor cuando lo desee.
echo.
timeout /t 2 /nobreak >nul
start http://localhost:3002
call npm start
pause