# alpine (musl) base: 直连模式的 sign-proxy 现在有 musl 变体 (sign-proxy.linux-x64-musl.node),
# Bot loader (pickTriple) 在 musl 上自动选它, 所以能用 alpine, 镜像比 debian 小一半 (~540MB vs ~880MB).
# 前提: 本 Dockerfile 拉的 release LLBot.zip 必须含 musl .node -- 即 v8.0.8+ 的发布产物;
# 拿它 build 更老版本 (zip 里只有 glibc .node) 会在 alpine 上加载 sign-proxy 失败。
FROM node:24-alpine

ARG LLBOT_VERSION
# 国内构建可传 --build-arg ALPINE_MIRROR=mirrors.tuna.tsinghua.edu.cn (或 aliyun/ustc) 换 apk 源。
ARG ALPINE_MIRROR=""
# 国内构建可传 --build-arg GH_PROXY=https://gh-proxy.com/ 给 release 下载加代理前缀 (含末尾 /)。
ARG GH_PROXY=""

RUN set -eux; \
    if [ -n "$ALPINE_MIRROR" ]; then \
      sed -i "s|dl-cdn.alpinelinux.org|${ALPINE_MIRROR}|g" /etc/apk/repositories; \
    fi; \
    # sed: alpine 自带 busybox sed 不认 startup.sh 里的 \s (GNU 扩展), 装 GNU sed 覆盖。
    apk add --no-cache ffmpeg tzdata sed unzip wget ca-certificates; \
    ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime; \
    echo "Asia/Shanghai" > /etc/timezone

ENV TZ=Asia/Shanghai

WORKDIR /app/llbot

COPY docker/startup.sh /startup.sh
RUN chmod +x /startup.sh

RUN wget "${GH_PROXY}https://github.com/LLOneBot/LuckyLilliaBot/releases/download/v${LLBOT_VERSION}/LLBot.zip" -O /app/llbot.zip \
    && unzip /app/llbot.zip -d /app/llbot \
    && rm /app/llbot.zip

# data 持久化: 声明为卷, 未显式挂载时也走匿名卷 (compose 重建/镜像更新可复用), 不落容器可写层
VOLUME ["/app/llbot/data"]

ENTRYPOINT ["/startup.sh"]
