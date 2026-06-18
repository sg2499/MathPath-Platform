@echo off
setlocal
cd /d "%~dp0"

if not "%~1"=="" (
  powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Ship-MathPathChange.ps1" -PackagePath "%~1"
  if errorlevel 1 pause
  exit /b %errorlevel%
)

:MENU
cls
echo =====================================================
echo              MATHPATH DELIVERY CONSOLE
echo =====================================================
echo.
echo  [1] Ship a MathPath change package
echo  [2] Approve the latest validated pull request
echo  [3] Prepare or merge a rollback
echo  [4] Repair local console setup and Git guard
echo  [Q] Quit
echo.
choice /C 1234Q /N /M "Choose an option: "

if errorlevel 5 goto END
if errorlevel 4 goto SETUP
if errorlevel 3 goto ROLLBACK
if errorlevel 2 goto APPROVE
if errorlevel 1 goto SHIP

goto MENU

:SHIP
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Ship-MathPathChange.ps1"
if errorlevel 1 pause
goto MENU

:APPROVE
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Approve-MathPathMerge.ps1"
if errorlevel 1 pause
goto MENU

:ROLLBACK
set /P RUNID=Enter the delivery Run ID to roll back:
if "%RUNID%"=="" goto MENU
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Rollback-MathPathChange.ps1" -RunId "%RUNID%"
if errorlevel 1 pause
goto MENU

:SETUP
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Setup-MathPathDelivery.ps1" -CreateDesktopShortcut
if errorlevel 1 pause
goto MENU

:END
endlocal
