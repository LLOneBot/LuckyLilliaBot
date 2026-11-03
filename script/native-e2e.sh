#!/bin/bash
set -euo pipefail
case "${1:-}" in
  build)
    : "${QQ_BASE_IMAGE:?Configure QQ_BASE_IMAGE with the official QQ runtime image}"
    docker build -f docker/Dockerfile.nativeqq --build-arg QQ_BASE_IMAGE="$QQ_BASE_IMAGE" -t llbot-pr-test .
    ;;
  start)
    docker stop pmhq1 pmhq2
    docker rm -f llbot-pr1 llbot-pr2 2>/dev/null || true
    for n in 1 2; do
      if [ "$n" = 1 ]; then uin=1577491075; webui=3091; else uin=412805684; webui=3092; fi
      # The existing self-hosted runner supplies test credentials. Do not print them.
      test -f "/srv/llbot-test/auth_token$n.txt"
      cp "/srv/llbot-test/auth_token$n.txt" "workspace$n/data/auth_token.txt"
      printf '{"qq_path":"/opt/QQ/qq","quick_login_qq":"%s","hook_mode":"inline","qq_args":"--no-sandbox","work_dir":"/app/llbot/data"}' "$uin" > "workspace$n/data/nativeqq_config.json"
      docker run -d --name "llbot-pr$n" --init --stop-timeout 30 \
        --network llbot-test_test_network \
        -e PROTOCOL_MODE=nativeqq -e WEBUI_PORT="$webui" \
        -v "llbot-test_qq_volume$n:/root/.config/QQ" \
        -v "$PWD/workspace$n/data:/app/llbot/data:rw" \
        llbot-pr-test
    done
    ;;
  stop)
    docker logs llbot-pr1 2>&1 | tail -30 || true
    docker logs llbot-pr2 2>&1 | tail -30 || true
    docker stop -t 30 llbot-pr1 llbot-pr2 2>/dev/null || true
    docker rm -f llbot-pr1 llbot-pr2 2>/dev/null || true
    docker start pmhq1 pmhq2 2>/dev/null || true
    ;;
  *) echo 'usage: native-e2e.sh build|start|stop' >&2; exit 2 ;;
esac
