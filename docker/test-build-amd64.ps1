# 脚本在 docker/ 下, 但 -f docker/... 和构建上下文 . 都相对仓库根; 先切过去, 从哪调用都行
Set-Location (Split-Path $PSScriptRoot -Parent)

# 用默认 docker 驱动 (不是 buildx 的 docker-container/mybuilder): 默认驱动共享 daemon 镜像缓存,
# node:24-alpine 本地已有 -> 不去 registry 拉 -> 避开国内连 Docker Hub (auth/registry) 的间歇性超时。
# 本地单平台测试 docker build 足够; 多架构才需要 buildx。
docker build -f docker/Dockerfile.test --progress=plain --platform linux/amd64 -t linyuchen/llbot .
