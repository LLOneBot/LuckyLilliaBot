docker buildx build --progress=plain --build-arg LLBOT_VERSION=8.0.7 --platform linux/amd64,linux/arm64 -t linyuchen/llbot:8.0.7 -f docker/Dockerfile .
