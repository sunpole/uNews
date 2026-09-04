@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Prepare-uNewsSelfShot.ps1" %*
exit /b %ERRORLEVEL%
