# alpine (musl): COPY 本机预构建的 dist (含 musl sign-proxy .node) 直接打包, 不在容器里 build。
# 本地快速出包/调试用: 先 `yarn build-webui && yarn build` 出 dist, 再 docker/debug-build-amd64.ps1。
# loader (pickTriple) 在 musl 上自动选 sign-proxy.linux-x64-musl.node, 所以 alpine 能跑。
FROM node:24-alpine

# 国内构建可传 --build-arg ALPINE_MIRROR=mirrors.tuna.tsinghua.edu.cn (或 aliyun/ustc) 换 apk 源。
ARG ALPINE_MIRROR=""
RUN set -eux; \
    if [ -n "$ALPINE_MIRROR" ]; then \
      sed -i "s|dl-cdn.alpinelinux.org|${ALPINE_MIRROR}|g" /etc/apk/repositories; \
    fi; \
    # sed: alpine 自带 busybox sed 不认 startup.sh 里的 \s (GNU 扩展), 装 GNU sed 覆盖。
    apk add --no-cache ffmpeg tzdata sed; \
    ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime; \
    echo "Asia/Shanghai" > /etc/timezone

ENV TZ=Asia/Shanghai

WORKDIR /app/llbot

COPY docker/startup.sh /startup.sh

RUN chmod +x /startup.sh

RUN touch /.dockerenv

COPY /dist /app/llbot

# data 持久化: 声明为卷, 未显式挂载时也走匿名卷 (compose 重建/镜像更新可复用), 不落容器可写层
VOLUME ["/app/llbot/data"]

ENTRYPOINT ["/startup.sh"]
