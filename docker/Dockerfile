FROM node:lts-alpine3.19

ARG LLONEBOT_VERSION

RUN set -eux; \
    # 获取当前系统 Alpine 主要版本 (如 3.19)
    ALPINE_VERSION=$(cut -d '.' -f1,2 /etc/alpine-release); \
    # 检查版本号是否有效
    [ -n "$ALPINE_VERSION" ] || { echo "Error: Failed to get Alpine version"; exit 1; }; \
    # 配置阿里云镜像源
#    echo "https://mirrors.aliyun.com/alpine/v$ALPINE_VERSION/main" > /etc/apk/repositories; \
#    echo "https://mirrors.aliyun.com/alpine/v$ALPINE_VERSION/community" >> /etc/apk/repositories; \
    # 更新索引
    apk update; \
    # 安装时区工具
    apk add --no-cache tzdata ffmpeg unzip wget; \
    # 设置时区为上海
    cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime; \
    echo "Asia/Shanghai" > /etc/timezone; \
    # 清理缓存减少镜像体积
    rm -rf /var/cache/apk/*

WORKDIR /app/llonebot

COPY docker/startup.sh /startup.sh

RUN chmod +x /startup.sh

RUN wget https://github.com/LLOneBot/LLOneBot/releases/download/v$LLONEBOT_VERSION/LLOneBot.zip -O /app/llonebot.zip

#COPY /dist/llonebot.zip /app/llonebot.zip

RUN unzip /app/llonebot.zip -d /app/llonebot \
    && rm /app/llonebot.zip

ENTRYPOINT ["/startup.sh"]
