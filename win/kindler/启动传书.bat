@echo off
chcp 65001 >nul
title Kindle 一键传书
color 0B
echo ===================================================
echo       正在检测当前电脑的局域网 IP 地址...
echo ===================================================
echo.

:: 自动提取真实的 192.168 开头的 IPv4 地址（避开虚拟网卡）
for /f "delims=" %%a in ('powershell -NoProfile -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.IPAddress -like '192.168.*'} | Select-Object -First 1 -ExpandProperty IPAddress"') do set "LOCAL_IP=%%a"

if defined LOCAL_IP (
    echo  [提示] 请在 Kindle 浏览器中，输入以下网址：
    echo.
    echo       http://%LOCAL_IP%:3000
    echo.
) else (
    echo  [注意] 没找到 192.168 开头的局域网 IP，请检查电脑是否连上了 Wi-Fi。
)

echo ===================================================
echo.
echo  ▶ 正在启动传书服务...
echo  ▶ 3秒后将自动为你打开电脑浏览器...
echo.
echo  [注意] 请不要关闭这个黑框框！关了服务就停了！
echo.

:: 倒计时3秒，让你看清上面的IP地址
timeout /t 3 /nobreak >nul

:: 自动打开电脑上的浏览器
start http://localhost:3000

:: 在当前窗口启动服务
node server.js
