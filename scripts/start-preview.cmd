@echo off
cd /d "%~dp0\.."
call npm.cmd run db:sync
if errorlevel 1 exit /b %errorlevel%
"C:\Program Files\nodejs\node.exe" "node_modules\next\dist\bin\next" start -p 3000 > "next-start-preview.out.log" 2> "next-start-preview.err.log"
