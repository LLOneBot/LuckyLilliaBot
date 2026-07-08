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

# 直连模式: 不带 --pmhq-port 启动即直连; -q <uin> 用于重启后恢复对应 session
uin="$QQ_UIN"
if [ -z "$uin" ]; then
  # 没配 QQ 号时, data 下恰好只有一个 session 文件就用它恢复
  count=0
  for f in /app/llbot/data/qq-session-*.json; do
    [ -e "$f" ] || continue
    count=$((count + 1))
    only="$f"
  done
  if [ "$count" = "1" ]; then
    uin=$(basename "$only" .json)
    uin="${uin#qq-session-}"
  fi
fi
if [ -n "$uin" ]; then
  exec node --enable-source-maps ./llbot.js -q "$uin"
fi
exec node --enable-source-maps ./llbot.js
