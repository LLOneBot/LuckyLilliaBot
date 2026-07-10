#!/bin/sh

cd /app/llbot

FILE="default_config.json"
WEBUI_PORT="${WEBUI_PORT:-3080}"

sed -i "/\"webui\": {/,/}/ {
    s/\"port\":\s*3080/\"port\": ${WEBUI_PORT}/g
}" "$FILE"

sed -i "/\"webui\": {/,/}/ {
    s/\"host\":\s*\"127.0.0.1\"/\"host\": \"\"/g
}" "$FILE"

sed -i "s|\"ffmpeg\":\s*\"\"|\"ffmpeg\": \"/usr/bin/ffmpeg\"|g" "$FILE"

mkdir -p /app/llbot/data

# 直连模式: 不带 --pmhq-port 启动即直连.
# QQ 显式指定要恢复的账号 (-q): 无头部署重启后自动免扫码恢复该号。
# 不设 QQ 则起在 WebUI 登录页, 由用户从快速登录列表点选账号 (或扫码) --
# 不再"data 里恰好一个 session 就自动用它", 那是替用户做了选择。
if [ -n "$QQ" ]; then
  exec node --enable-source-maps ./llbot.js -q "$QQ"
fi
exec node --enable-source-maps ./llbot.js
