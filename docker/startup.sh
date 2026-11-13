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

mkdir -p /app/llbot/data

case "$PROTOCOL_MODE" in
  ""|direct|nativeqq) ;;
  *) echo "PROTOCOL_MODE=$PROTOCOL_MODE 不认识，只能是 direct 或 nativeqq" >&2; exit 1 ;;
esac

# NativeQQ: the official QQ installation and Bot share this container.
if [ "$PROTOCOL_MODE" = "nativeqq" ]; then
  exec node --enable-source-maps ./llbot.js --nativeqq --nativeqq-config="${NATIVEQQ_CONFIG:-/app/llbot/data/nativeqq_config.json}"
fi

# 纯协议 (PROTOCOL_MODE 为空或 direct): --direct 锁定登录方式, 标准镜像里没有 QQ, 不能切到桥接
# 指定 AUTO_LOGIN_QQ 重启后自动免扫码快速登录。
# 不设 AUTO_LOGIN_QQ 则起在 WebUI 登录页, 由用户从快速登录列表点选账号 (或扫码)
if [ -n "$AUTO_LOGIN_QQ" ]; then
  exec node --enable-source-maps ./llbot.js --direct -q "$AUTO_LOGIN_QQ"
fi
exec node --enable-source-maps ./llbot.js --direct
