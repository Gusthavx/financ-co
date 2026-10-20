@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title Instalar Financ.co
echo.
echo  Financ.co
echo.

rem Procura um Python de verdade (o atalho da Microsoft Store não conta)
set "PY="
py -3 -c "import sys" >nul 2>nul && set "PY=py -3"
if not defined PY python -c "import sys" >nul 2>nul && set "PY=python"
if defined PY goto instalar

echo  Este PC ainda não tem Python. Vou instalar pelo winget (pode pedir permissão).
winget install Python.Python.3.12 --silent --accept-source-agreements --accept-package-agreements
set "PY=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
if exist "%PY%" goto instalar
echo.
echo  Não consegui instalar o Python sozinho.
echo  Instale por https://www.python.org/downloads/ e rode este arquivo de novo.
echo.
pause
exit /b 1

:instalar
%PY% "%~dp0instalador.py" instalar
if errorlevel 1 (
  echo.
  echo  A instalação não terminou. Veja a mensagem acima.
)
echo.
pause
