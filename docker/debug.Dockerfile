FROM node:lts-alpine

ARG LLONEBOT_VERSION

RUN set -eux; \
    ALPINE_VERSION=$(grep -oE '[0-9]+\.[0-9]+' /etc/alpine-release); \
    [ -n "$ALPINE_VERSION" ] || { echo "Error: Failed to get Alpine version"; exit 1; }; \
    echo "https://mirrors.aliyun.com/alpine/v$ALPINE_VERSION/main" > /etc/apk/repositories; \
    echo "https://mirrors.aliyun.com/alpine/v$ALPINE_VERSION/community" >> /etc/apk/repositories; \
    apk update; \
    apk add --no-cache tzdata ffmpeg; \
    cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime; \
    echo "Asia/Shanghai" > /etc/timezone; \
    rm -rf /var/cache/apk/*

RUN apk add unzip

WORKDIR /app/llonebot

COPY docker/startup.sh /startup.sh

RUN chmod +x /startup.sh

RUN touch /.dockerenv

#RUN wget https://github.com/LLOneBot/LLOneBot/releases/download/v$LLONEBOT_VERSION/LLOneBot.zip -O /app/llonebot.zip

COPY /dist /app/llonebot

#RUN unzip /app/llonebot.zip -d /app/llonebot \
#    && rm /app/llonebot.zip

ENTRYPOINT ["/startup.sh"]
