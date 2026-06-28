@echo off
set PATH=d:\erp\.tools\node;%PATH%
set WEB_ONLY=1
cd /d "%~dp0"
echo ERP Desktop (brauzer rejimi) ishga tushirilmoqda...
echo Brauzer: http://localhost:5173/
echo Oynani yopsangiz ham server ishlayveradi. To'xtatish: Ctrl+C
npm run dev
