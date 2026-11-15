@echo off
setlocal
title Sistema Quantic - Inicio de todos los servicios
pushd "%~dp0"
if errorlevel 1 goto carpeta_error

echo Sistema Quantic
echo Iniciando el sistema principal, la interfaz y todos los servicios.
echo Se conservaran los datos del entorno local de prueba.
echo MySQL debe estar encendido y configurado en srv-servicios-adicionales/.env.
echo Mantener esta ventana abierta. Usar Ctrl+C para detener los servicios.
echo.

where.exe node >nul 2>&1
if errorlevel 1 goto node_error
call node -e "const [major, minor] = process.versions.node.split('.').map(Number); process.exit(major > 22 || (major === 22 && minor >= 13) ? 0 : 1)"
if errorlevel 1 goto version_error

call node scripts/iniciar-prueba-local.cjs
set "quantic_exit=%errorlevel%"
echo.
if "%quantic_exit%"=="0" goto terminado
echo No se pudo completar el arranque. Revisa el mensaje anterior.
echo Los registros estan en tmp\prueba-local.
goto terminar

:terminado
echo Sistema detenido.
:terminar
popd
echo Presiona una tecla para cerrar esta ventana.
pause >nul
exit /b %quantic_exit%

:node_error
echo No se encontro Node.js. Instala Node.js 22.13 o posterior y vuelve a abrir este archivo.
set "quantic_exit=1"
goto terminar

:version_error
echo Se necesita Node.js 22.13 o posterior para iniciar todos los servicios.
set "quantic_exit=1"
goto terminar

:carpeta_error
echo No se pudo abrir la carpeta del proyecto.
pause
exit /b 1
