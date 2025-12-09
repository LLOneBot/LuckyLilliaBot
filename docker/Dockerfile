FROM node:lts

ARG LLONEBOT_VERSION

RUN set -eux; \
    apt update; \
    apt install --no-cache tzdata ffmpeg unzip wget; \
    cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime; \
    echo "Asia/Shanghai" > /etc/timezone; \
    rm -rf /var/cache/apk/*

WORKDIR /app/llonebot

COPY docker/startup.sh /startup.sh

RUN chmod +x /startup.sh

RUN wget https://github.com/LLOneBot/LLOneBot/releases/download/v$LLONEBOT_VERSION/LLOneBot.zip -O /app/llonebot.zip

#COPY /dist/llonebot.zip /app/llonebot.zip

RUN unzip /app/llonebot.zip -d /app/llonebot \
    && rm /app/llonebot.zip

ENTRYPOINT ["/startup.sh"]
