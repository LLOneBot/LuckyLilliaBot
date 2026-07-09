# 必须用 glibc 基础镜像 (debian): 直连模式的 sign-proxy .node 是 glibc 链接的, alpine/musl 加载不了
FROM node:24-bookworm-slim

RUN set -eux; \
    # 国内构建可打开 apt 镜像源
    # sed -i 's|deb.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources; \
    apt-get update; \
    apt-get install -y --no-install-recommends tzdata ffmpeg; \
    ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime; \
    echo "Asia/Shanghai" > /etc/timezone; \
    rm -rf /var/lib/apt/lists/*

ENV TZ=Asia/Shanghai

WORKDIR /app/llbot

COPY docker/startup.sh /startup.sh

RUN chmod +x /startup.sh

RUN touch /.dockerenv

COPY /dist /app/llbot

# data 持久化: 声明为卷, 未显式挂载时也走匿名卷 (compose 重建/镜像更新可复用), 不落容器可写层
VOLUME ["/app/llbot/data"]

ENTRYPOINT ["/startup.sh"]
