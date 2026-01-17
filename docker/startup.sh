#!/bin/ash

cd /app/llbot

FILE="default_config.json"

sed -i "/\"webui\": {/,/}/ {
    s/\"port\":\s*3080/\"port\": ${WEBUI_PORT}/g
}" "$FILE"

sed -i "/\"webui\": {/,/}/ {
    s/\"host\":\s*\"127.0.0.1\"/\"host\": \"\"/g
}" "$FILE"

sed -i "s|\"ffmpeg\":\s*\"\"|\"ffmpeg\": \"/usr/bin/ffmpeg\"|g" "$FILE"


# Check dir
if [ ! -d "/app/llbot/data" ]; then
  mkdir /app/llbot/data
fi


port="13000"
host="pmhq"
if [ -n "$pmhq_port" ]; then
  port="$pmhq_port"
fi
if [ -n "$pmhq_host" ]; then
  host="$pmhq_host"
fi

node --enable-source-maps ./llbot.js --pmhq-port=$port --pmhq-host=$host
