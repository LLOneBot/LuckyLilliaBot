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

# PMHQ 有头模式: QQ 客户端跑在独立 pmhq 容器, llbot 靠 --pmhq-port/--pmhq-host 连过去.
# 账号登录由 pmhq 容器的 AUTO_LOGIN_QQ 处理, llbot 侧不传 -q (session 在 pmhq 卷里).
if [ "$PROTOCOL_MODE" = "pmhq" ]; then
  PMHQ_PORT="${PMHQ_PORT:-13000}"
  PMHQ_HOST="${PMHQ_HOST:-pmhq}"
  exec node --enable-source-maps ./llbot.js --pmhq-port="$PMHQ_PORT" --pmhq-host="$PMHQ_HOST"
fi

# 指定 QQ 重启后自动免扫码自动快速登录。
# 不设 QQ 则起在 WebUI 登录页, 由用户从快速登录列表点选账号 (或扫码)
if [ -n "$QQ" ]; then
  exec node --enable-source-maps ./llbot.js -q "$QQ"
fi
exec node --enable-source-maps ./llbot.js
