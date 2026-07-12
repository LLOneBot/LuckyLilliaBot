#!/bin/bash

echo "=========================================="
echo "LLBot Docker 安装配置向导"
echo "=========================================="
echo ""
echo "请选择配置方式："
echo "1) 现在配置（命令行配置所有选项）"
echo "2) 稍后配置（仅配置 WebUI，其他选项在 WebUI 中配置）"
echo ""
read -p "请选择 (1/2): " config_mode

AUTO_LOGIN_QQ=""
while [ -z "$AUTO_LOGIN_QQ" ]; do
    read -p "请输入 QQ 号（必填）: " AUTO_LOGIN_QQ
    [[ "$AUTO_LOGIN_QQ" =~ ^[0-9]+$ ]] || { echo "错误：QQ 号必须是数字！"; AUTO_LOGIN_QQ=""; continue; }
done

# Auth Token: 仅命令行配置(mode 1)时询问; 稍后配置(mode 2)由用户在 WebUI 中录入, 这里留空
AUTH_TOKEN=""
if [ "$config_mode" == "1" ]; then
    # Auth Token (命令行配置必填; 此处不做校验, 有效性在登录/WebUI 侧判定)
    echo ""
    echo "Auth Token（必填）"
    echo "获取地址: https://auth.luckylillia.com"
    while [ -z "$AUTH_TOKEN" ]; do
        read -p "请输入 Auth Token（必填）: " input_token
        AUTH_TOKEN=$(printf '%s' "$input_token" | tr -d '[:space:]')
        [ -z "$AUTH_TOKEN" ] && echo "错误：Auth Token 不能为空！"
    done
    echo "[OK] 已记录 Auth Token，将写入 auth_token.txt"
fi

declare -A SERVICE_PORTS

ENABLE_WEBUI="true"
WEBUI_HOST=""
WEBUI_PORT="3080"
WEBUI_TOKEN=""

echo ""
echo "WebUI 配置："

while [ -z "$WEBUI_TOKEN" ]; do
    read -p "WebUI 密码（必填，仅支持英文和数字）: " WEBUI_TOKEN
done

while true; do
    read -p "WebUI 端口 (默认 3080): " port
    port=${port:-3080}
    [[ "$port" =~ ^[0-9]+$ ]] || { echo "错误：端口必须是数字！"; continue; }
    WEBUI_PORT=$port
    SERVICE_PORTS["$WEBUI_PORT"]=1
    break
done

# 如果选择稍后配置，跳过协议配置
if [ "$config_mode" == "2" ]; then
    protocol_choices=""
else
    # 协议选择
    declare -a PROTOCOLS
    echo ""
    echo "请选择要启用的协议（可多选）："
    echo "1) OneBot 11"
    echo "2) Milky"
    echo "3) Satori"
    read -p "输入选项（用空格分隔，如: 1 3）: " protocol_choices
fi

# OneBot 11 配置
ENABLE_OB11="false"
declare -a OB11_CONNECTS

if [[ "$protocol_choices" =~ 1 ]]; then
    ENABLE_OB11="true"

    while :; do
        echo ""
        echo "OneBot 11 连接配置："
        echo "1) WebSocket 服务端"
        echo "2) WebSocket 客户端"
        echo "3) HTTP 服务端"
        echo "4) WebHook"
        echo "0) 完成 OneBot 11 配置"
        read -p "选择连接类型: " ob11_type

        case $ob11_type in
            0) break ;;
            1)
                read -p "端口: " port
                token=""
                while [ -z "$token" ]; do
                    read -p "Token (必填): " token
                done
                SERVICE_PORTS["$port"]=1
                OB11_CONNECTS+=("{\"type\":\"ws\",\"enable\":true,\"host\":\"\",\"port\":$port,\"token\":\"${token}\",\"reportSelfMessage\":false,\"reportOfflineMessage\":false,\"messageFormat\":\"array\",\"debug\":false,\"heartInterval\":30000}")
                ;;
            2)
                read -p "WebSocket URL: " url
                read -p "Token (可选): " token
                OB11_CONNECTS+=("{\"type\":\"ws-reverse\",\"enable\":true,\"url\":\"${url}\",\"token\":\"${token}\",\"reportSelfMessage\":false,\"reportOfflineMessage\":false,\"messageFormat\":\"array\",\"debug\":false,\"heartInterval\":30000}")
                ;;
            3)
                read -p "端口: " port
                token=""
                while [ -z "$token" ]; do
                    read -p "Token (必填): " token
                done
                SERVICE_PORTS["$port"]=1
                OB11_CONNECTS+=("{\"type\":\"http\",\"enable\":true,\"host\":\"\",\"port\":$port,\"token\":\"${token}\",\"reportSelfMessage\":false,\"reportOfflineMessage\":false,\"messageFormat\":\"array\",\"debug\":false}")
                ;;
            4)
                read -p "WebHook URL: " url
                read -p "Token (可选): " token
                OB11_CONNECTS+=("{\"type\":\"http-post\",\"enable\":true,\"url\":\"${url}\",\"token\":\"${token}\",\"reportSelfMessage\":false,\"reportOfflineMessage\":false,\"messageFormat\":\"array\",\"debug\":false,\"enableHeart\":false,\"heartInterval\":30000}")
                ;;
        esac
    done
fi

# Milky 配置
ENABLE_MILKY="false"
MILKY_HTTP_HOST=""
MILKY_HTTP_PORT="3000"
MILKY_HTTP_PREFIX="/milky"
MILKY_HTTP_TOKEN=""
MILKY_WEBHOOK_URLS="[]"
MILKY_WEBHOOK_TOKEN=""

if [[ "$protocol_choices" =~ 2 ]]; then
    ENABLE_MILKY="true"

    echo ""
    echo "Milky HTTP 配置："
    while true; do
        read -p "HTTP 端口 (默认 3000): " port
        port=${port:-3000}
        [[ "$port" =~ ^[0-9]+$ ]] || { echo "错误：端口必须是数字！"; continue; }
        MILKY_HTTP_PORT=$port
        SERVICE_PORTS["$MILKY_HTTP_PORT"]=1
        break
    done

    read -p "HTTP 路径前缀 (默认 /milky): " prefix
    MILKY_HTTP_PREFIX=${prefix:-/milky}

    while [ -z "$MILKY_HTTP_TOKEN" ]; do
        read -p "Access Token (必填): " MILKY_HTTP_TOKEN
    done

    echo ""
    read -p "是否配置 WebHook (y/n): " enable_webhook
    if [[ "$enable_webhook" =~ ^[yY]$ ]]; then
        read -p "WebHook URLs (用逗号分隔): " webhook_urls
        IFS=',' read -ra URLS <<< "$webhook_urls"
        MILKY_WEBHOOK_URLS="["
        for i in "${!URLS[@]}"; do
            [ $i -gt 0 ] && MILKY_WEBHOOK_URLS+=","
            MILKY_WEBHOOK_URLS+="\"${URLS[$i]}\""
        done
        MILKY_WEBHOOK_URLS+="]"

        read -p "WebHook Access Token (可选): " MILKY_WEBHOOK_TOKEN
    fi
fi

# Satori 配置
ENABLE_SATORI="false"
SATORI_HOST=""
SATORI_PORT="5500"
SATORI_TOKEN=""

if [[ "$protocol_choices" =~ 3 ]]; then
    ENABLE_SATORI="true"

    echo ""
    echo "Satori 配置："
    while true; do
        read -p "端口 (默认 5500): " port
        port=${port:-5500}
        [[ "$port" =~ ^[0-9]+$ ]] || { echo "错误：端口必须是数字！"; continue; }
        SATORI_PORT=$port
        SERVICE_PORTS["$SATORI_PORT"]=1
        break
    done

    while [ -z "$SATORI_TOKEN" ]; do
        read -p "Token (必填): " SATORI_TOKEN
    done
fi

# 生成 config JSON
OB11_CONNECT_JSON="[]"
if [ ${#OB11_CONNECTS[@]} -gt 0 ]; then
    OB11_CONNECT_JSON="["
    for i in "${!OB11_CONNECTS[@]}"; do
        [ $i -gt 0 ] && OB11_CONNECT_JSON+=","
        OB11_CONNECT_JSON+="${OB11_CONNECTS[$i]}"
    done
    OB11_CONNECT_JSON+="]"
fi

# 创建配置文件
mkdir -p llbot_config

# 仅在完整配置模式下生成配置文件
if [ "$config_mode" == "1" ]; then
    cat > "llbot_config/config_${AUTO_LOGIN_QQ}.json" << EOF
{
  "milky": {
    "enable": ${ENABLE_MILKY},
    "reportSelfMessage": false,
    "http": {
      "host": "${MILKY_HTTP_HOST}",
      "port": ${MILKY_HTTP_PORT},
      "prefix": "${MILKY_HTTP_PREFIX}",
      "accessToken": "${MILKY_HTTP_TOKEN}"
    },
    "webhook": {
      "urls": ${MILKY_WEBHOOK_URLS},
      "accessToken": "${MILKY_WEBHOOK_TOKEN}"
    }
  },
  "satori": {
    "enable": ${ENABLE_SATORI},
    "host": "${SATORI_HOST}",
    "port": ${SATORI_PORT},
    "token": "${SATORI_TOKEN}"
  },
  "ob11": {
    "enable": ${ENABLE_OB11},
    "connect": ${OB11_CONNECT_JSON}
  },
  "webui": {
    "enable": ${ENABLE_WEBUI},
    "host": "${WEBUI_HOST}",
    "port": ${WEBUI_PORT}
  }
}
EOF
    echo ""
    echo "配置文件已生成: llbot_config/config_${AUTO_LOGIN_QQ}.json"
fi

# 创建 webui_token.txt
echo "$WEBUI_TOKEN" > "llbot_config/webui_token.txt"
echo "WebUI 密码文件已生成: llbot_config/webui_token.txt"

# 创建 auth_token.txt (Bot 读 data/auth_token.txt 做 sign 鉴权)
echo "$AUTH_TOKEN" > "llbot_config/auth_token.txt"
echo "Auth Token 文件已生成: llbot_config/auth_token.txt"

# 设置配置目录权限，确保 Docker 容器可以读写
chmod -R 777 llbot_config

echo ""
read -p "是否使用 Docker 镜像源 (y/n): " use_docker_mirror

docker_mirror=""
LLBOT_TAG="latest"

# 从 npm registry 获取版本号
get_npm_version() {
  local package=$1
  local version=$(curl -s --connect-timeout 5 "https://registry.npmjs.org/${package}/latest" | grep -o '"version":"[^"]*"' | cut -d'"' -f4)
  if [ -n "$version" ]; then
    echo "$version"
    return 0
  fi
  return 1
}

echo ""
echo "正在获取最新版本信息..."

# 获取 LLBot 版本
LLBOT_TAG=$(get_npm_version "llonebot-dist")
if [ -n "$LLBOT_TAG" ]; then
  echo "LLBot 最新版本: $LLBOT_TAG"
else
  echo "无法获取 LLBot 版本，将使用 latest"
  LLBOT_TAG="latest"
fi

if [[ "$use_docker_mirror" =~ ^[yY]$ ]]; then
  # Docker 镜像源列表
  DOCKER_MIRRORS=(
    "docker.gh-proxy.cn"
  )

  # 测试镜像源是否可用
  test_mirror() {
    local mirror=$1
    local image=$2
    local tag=$3
    echo "测试镜像源 ${mirror} 的 ${image}:${tag} ..." >&2
    if timeout 10 docker manifest inspect "${mirror}/linyuchen/${image}:${tag}" > /dev/null 2>&1; then
      return 0
    fi
    return 1
  }

  # 查找可用的镜像源（只需要 llbot 镜像）
  find_available_mirror() {
    local llbot_tag=$1

    for mirror in "${DOCKER_MIRRORS[@]}"; do
      if test_mirror "$mirror" "llbot" "$llbot_tag"; then
        echo "找到可用镜像源: ${mirror}" >&2
        echo "${mirror}/"
        return 0
      fi
      echo "镜像源 ${mirror} 不可用或版本不存在" >&2
    done

    echo "所有镜像源均不可用或不支持该版本" >&2
    echo "将回退到 Docker 官方源使用 latest 标签" >&2
    LLBOT_TAG="latest"
    echo ""
    return 1
  }

  echo ""
  echo "正在检测可用的镜像源..."
  docker_mirror=$(find_available_mirror "$LLBOT_TAG")
fi

# 生成 ports 配置
PORTS_CONFIG=""
if [ ${#SERVICE_PORTS[@]} -gt 0 ]; then
    PORTS_CONFIG="    ports:"
    for port in "${!SERVICE_PORTS[@]}"; do
        PORTS_CONFIG="${PORTS_CONFIG}
      - \"${port}:${port}\""
    done
fi

# llbot 健康检查：探测 WebUI HTTP（镜像是 debian slim，无 ps/curl，用 node 自带 fetch）
LLBOT_HEALTHCHECK="    healthcheck:
      test:
        - CMD-SHELL
        - node -e \"fetch('http://127.0.0.1:'+(process.env.WEBUI_PORT||3080)).then(()=>process.exit(0),()=>process.exit(1))\"
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s"

LLBOT_ENV="      - WEBUI_PORT=${WEBUI_PORT}
      # QQ 留空=WebUI 登录页点选账号; 填 QQ 号=重启自动恢复该号 (免扫码)
      - QQ=${AUTO_LOGIN_QQ}"

cat << EOF > docker-compose.yml
services:
  llbot:
    image: ${docker_mirror}linyuchen/llbot:${LLBOT_TAG}
${PORTS_CONFIG}
    extra_hosts:
      - "host.docker.internal:host-gateway"
    environment:
${LLBOT_ENV}
    volumes:
      - ./llbot_config:/app/llbot/data:rw
    restart: unless-stopped
${LLBOT_HEALTHCHECK}
EOF

echo ""
echo "Docker Compose 配置已生成: docker-compose.yml"

printLogin(){
    echo ""
    echo "=========================================="
    echo "配置完成！"
    echo "=========================================="
    echo ""
    echo "生成的文件："
    if [ "$config_mode" == "1" ]; then
        echo "  - llbot_config/config_${AUTO_LOGIN_QQ}.json"
    fi
    echo "  - llbot_config/webui_token.txt"
    echo "  - llbot_config/auth_token.txt"
    echo "  - docker-compose.yml"
    echo ""
    echo "WebUI 访问地址: http://localhost:${WEBUI_PORT}"
    echo "WebUI 密码: ${WEBUI_TOKEN}"
    echo ""
    echo "登录方式: 启动后打开 WebUI 扫码登录，"
    echo "          或运行 sudo docker compose logs -f llbot 在日志中查看二维码"
    if [ "$config_mode" == "2" ]; then
        echo ""
        echo "提示: 您选择了稍后配置模式"
        echo "请在 WebUI 中完成 QQ 登录、协议配置等所有设置"
    fi
    echo ""
    echo "启动命令: sudo docker compose up -d"
    echo "查看日志: sudo docker compose logs -f"
    echo "=========================================="
}

# 检查root权限
if [ "$(id -u)" -ne 0 ]; then
    echo "没有 root 权限，请手动运行 sudo docker compose up -d"
    printLogin
    exit 1
fi

if ! command -v docker &> /dev/null; then
  echo "没有安装 Docker！安装后运行 sudo docker compose up -d"
  printLogin
  exit 1
fi

echo ""
read -p "是否立即启动 Docker 容器 (y/n): " start_docker
if [[ "$start_docker" =~ ^[yY]$ ]]; then
    docker compose up -d
fi

printLogin
