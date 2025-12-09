FROM node:lts-alpine

ARG LLONEBOT_VERSION

RUN set -eux; \
    echo "https://dl-cdn.alpinelinux.org/alpine/edge/main" > /etc/apk/repositories; \
    echo "https://dl-cdn.alpinelinux.org/alpine/edge/community" >> /etc/apk/repositories; \
    echo "https://dl-cdn.alpinelinux.org/alpine/edge/testing" >> /etc/apk/repositories; \
    apk update; \
    apk add --no-cache tzdata ffmpeg; \
    cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime; \
    echo "Asia/Shanghai" > /etc/timezone; \
    rm -rf /var/cache/apk/*

RUN apk add unzip wget

WORKDIR /app/llonebot

COPY docker/startup.sh /startup.sh

RUN chmod +x /startup.sh

RUN wget https://github.com/LLOneBot/LLOneBot/releases/download/v$LLONEBOT_VERSION/LLOneBot.zip -O /app/llonebot.zip

#COPY /dist/llonebot.zip /app/llonebot.zip

RUN unzip /app/llonebot.zip -d /app/llonebot \
    && rm /app/llonebot.zip

ENTRYPOINT ["/startup.sh"]
