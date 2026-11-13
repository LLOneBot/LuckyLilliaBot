FROM node:24-alpine

ARG LLBOT_VERSION

RUN set -eux; \
    apk add --no-cache tzdata unzip wget ca-certificates; \
    ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime; \
    echo "Asia/Shanghai" > /etc/timezone

ENV TZ=Asia/Shanghai

WORKDIR /app/llbot

COPY docker/startup.sh /startup.sh
RUN chmod +x /startup.sh

RUN set -eux; \
    wget "https://github.com/LLOneBot/LuckyLilliaBot/releases/download/v${LLBOT_VERSION}/LuckyLillia.zip" -O /app/llbot.zip; \
    unzip /app/llbot.zip -d /app/llbot; \
    rm /app/llbot.zip; \
    cd /app/llbot

VOLUME ["/app/llbot/data"]

ENTRYPOINT ["/startup.sh"]
