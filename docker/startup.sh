#!/bin/sh

cd /app/llbot

FILE="default_config.json"
WEBUI_PORT="${WEBUI_PORT:-3080}"

sed -i "/\"webui\": {/,/}/ {
    s/\"port\":[[:space:]]*3080/\"port\": ${WEBUI_PORT}/g
}" "$FILE"

sed -i "/\"webui\": {/,/}/ {
    s/\"host\":[[:space:]]*\"127.0.0.1\"/\"host\": \"\"/g
}" "$FILE"

sed -i "s|\"ffmpeg\":[[:space:]]*\"\"|\"ffmpeg\": \"/usr/bin/ffmpeg\"|g" "$FILE"

mkdir -p /app/llbot/data

# 指定 QQ 重启后自动免扫码自动快速登录。
# 不设 QQ 则起在 WebUI 登录页, 由用户从快速登录列表点选账号 (或扫码)
if [ -n "$QQ" ]; then
  exec node --enable-source-maps ./llbot.js -q "$QQ"
fi
exec node --enable-source-maps ./llbot.js
