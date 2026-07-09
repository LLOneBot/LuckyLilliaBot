# 必须用 glibc 基础镜像 (debian): 直连模式的 sign-proxy .node 是 glibc 链接的, alpine/musl 加载不了
FROM node:24-bookworm-slim

ARG LLBOT_VERSION

RUN set -eux; \
    # 国内构建可打开 apt 镜像源
    # sed -i 's|deb.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources; \
    apt-get update; \
    apt-get install -y --no-install-recommends tzdata ffmpeg unzip wget ca-certificates; \
    ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime; \
    echo "Asia/Shanghai" > /etc/timezone; \
    rm -rf /var/lib/apt/lists/*

ENV TZ=Asia/Shanghai

WORKDIR /app/llbot

COPY docker/startup.sh /startup.sh

RUN chmod +x /startup.sh

RUN wget https://github.com/LLOneBot/LuckyLilliaBot/releases/download/v$LLBOT_VERSION/LLBot.zip -O /app/llbot.zip

#COPY /dist/llonebot.zip /app/llonebot.zip

RUN unzip /app/llbot.zip -d /app/llbot \
    && rm /app/llbot.zip

# data 持久化: 声明为卷, 未显式挂载时也走匿名卷 (compose 重建/镜像更新可复用), 不落容器可写层
VOLUME ["/app/llbot/data"]

ENTRYPOINT ["/startup.sh"]
