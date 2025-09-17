#!/bin/ash

cd /app/llonebot

FILE="default_config.json"

sed -i "/\"webui\": {/,/}/ {
        s/\"enable\": true/\"enable\": ${ENABLE_WEBUI}/g
    }" "$FILE"
sed -i "/\"webui\": {/,/}/ {
    s/\"port\":\s*3080/\"port\": ${WEBUI_PORT}/g
}" "$FILE"

sed -i "s/\"enableWs\":\s*true/\"enableWs\": ${ENABLE_ONEBOT_WS}/g" "$FILE"
sed -i "s/\"enableHttp\":\s*true/\"enableHttp\": ${ENABLE_ONEBOT_HTTP}/g" "$FILE"

sed -i "s/\"httpPort\":\s*3000/\"httpPort\": ${ONEBOT_HTTP_PORT}/g" "$FILE"
sed -i "s/\"wsPort\":\s*3001/\"wsPort\": ${ONEBOT_WS_PORT}/g" "$FILE"

sed -i "s|\"httpPostUrls\":\s*\[\]|\"httpPostUrls\": ${ONEBOT_HTTP_URLS}|g" "$FILE"
sed -i "s|\"wsReverseUrls\":\s*\[\]|\"wsReverseUrls\": ${ONEBOT_WS_URLS}|g" "$FILE"
sed -i "/\"ob11\": {/,/}/ {
      s/\"token\":\s*\"\"/\"token\": \"${ONEBOT_TOKEN}\"/g
    }" "$FILE"

sed -i "s/\"httpSecret\":\s*\"\"/\"httpSecret\": \"${ONEBOT_SECRET}\"/g" "$FILE"

sed -i "/\"satori\": {/,/}/ {
        s/\"enable\": true/\"enable\": ${ENABLE_SATORI}/g
    }" "$FILE"

sed -i "/\"satori\": {/,/}/ {
    s/\"token\":\s*\"\"/\"token\": \"${SATORI_TOKEN}\"/g
}" "$FILE"

sed -i "/\"satori\": {/,/}/ {
    s/\"port\":\s*5600/\"port\": ${SATORI_PORT}/g
}" "$FILE"

sed -i "s/\"onlyLocalhost\":\s*true/\"onlyLocalhost\": false/g" "$FILE"
sed -i "s|\"ffmpeg\":\s*\"\"|\"ffmpeg\": \"/usr/bin/ffmpeg\"|g" "$FILE"

WEBUI_TOKEN_FILE='/app/llonebot/data/webui_token.txt'

# Check dir
if [ ! -d "/app/llonebot/data" ]; then
  mkdir /app/llonebot/data
fi

if [ ! -f "$WEBUI_TOKEN_FILE" ]; then
  echo "$WEBUI_TOKEN" > "$WEBUI_TOKEN_FILE"
fi

port="13000"
host="pmhq"
if [ -n "$pmhq_port" ]; then
  port="$pmhq_port"
fi
if [ -n "$pmhq_host" ]; then
  port="$pmhq_host"
fi
node ./llonebot.js --pmhq-port=$port --pmhq-host=$host
