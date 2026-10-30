@echo off
cd /d "%~dp0bin\llbot"
node.exe --enable-source-maps llbot.js %*
