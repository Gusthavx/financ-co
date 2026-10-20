@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title Desinstalar Financ.co
echo.
echo  Financ.co
echo.

set "PY="
py -3 -c "import sys" >nul 2>nul && set "PY=py -3"
if not defined PY python -c "import sys" >nul 2>nul && set "PY=python"
if not defined PY if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" set "PY=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
if not defined PY (
  echo  Não achei o Python neste PC para rodar a remoção.
  echo  Apague a pasta %LOCALAPPDATA%\Financ.co e os atalhos manualmente.
  echo.
  pause
  exit /b 1
)

%PY% "%~dp0instalador.py" desinstalar
echo.
pause
