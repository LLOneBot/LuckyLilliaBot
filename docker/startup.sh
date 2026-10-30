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

# PMHQ is native: the official QQ installation and Bot share this container.
if [ "$PROTOCOL_MODE" = "pmhq" ]; then
  if [ -n "$PMHQ_HOST$PMHQ_PORT" ]; then
    echo "PMHQ_HOST/PMHQ_PORT 已停用，请使用包含 QQ 的本机 PMHQ 镜像和 PMHQ_CONFIG" >&2
    exit 1
  fi
  exec node --enable-source-maps ./llbot.js --pmhq --pmhq-config="${PMHQ_CONFIG:-/app/llbot/data/pmhq_config.json}"
fi

# 指定 AUTO_LOGIN_QQ 重启后自动免扫码快速登录。
# 不设 AUTO_LOGIN_QQ 则起在 WebUI 登录页, 由用户从快速登录列表点选账号 (或扫码)
if [ -n "$AUTO_LOGIN_QQ" ]; then
  exec node --enable-source-maps ./llbot.js -q "$AUTO_LOGIN_QQ"
fi
exec node --enable-source-maps ./llbot.js
