SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# 检测是否为 Debian 系列系统（通过 apt 命令）
if ! command -v apt &> /dev/null; then
    echo "错误：本脚本只支持使用 apt 包管理器的系统（如 Debian、Ubuntu 等）"
    exit 1
fi

# 检测系统架构
ARCH=$(uname -m)
if [ "$ARCH" == "x86_64" ]; then
    ARCH_TYPE="amd64"
elif [ "$ARCH" == "aarch64" ]; then
    ARCH_TYPE="arm64"
else
    echo "错误：不支持的系统架构: $ARCH"
    echo "本脚本只支持 x86_64 (x64) 和 aarch64 (arm64) 架构"
    exit 1
fi

echo "检测到系统架构: $ARCH_TYPE"

# 检测 QQ 是否已安装
if [ ! -f "/opt/QQ/qq" ]; then
    echo "未检测到 QQ 安装 (/opt/QQ/qq 不存在)"
    echo "是否需要安装 QQ？(Y/n)"
    read -n 1 -s -r key
    echo ""
    if [[ "$key" == "Y" || "$key" == "y" || "$key" == "" ]]; then
        echo "正在下载 QQ ($ARCH_TYPE 版本)..."
        QQ_DEB="/tmp/qq_linux_$ARCH_TYPE.deb"
        sudo apt-get update
        sudo apt-get install wget
        wget -O "$QQ_DEB" "https://dldir1v6.qq.com/qqfile/qq/QQNT/ec800879/linuxqq_3.2.20-40990_$ARCH_TYPE.deb"
        if [ $? -ne 0 ]; then
            echo "错误：QQ 下载失败"
            exit 1
        fi
        echo "正在安装 QQ..."
        
        sudo apt install -y "$QQ_DEB"
        if [ $? -ne 0 ]; then
            echo "错误：QQ 安装失败"
            exit 1
        fi
        echo "QQ 安装完成"
        rm -f "$QQ_DEB"
        echo "进行安装 QQ 相关依赖"
        # 检测 libasound 包名（新系统用 libasound2t64，旧系统用 libasound2）
        # 使用 apt-cache policy 检测包是否真正可安装
        if apt-cache policy libasound2t64 2>/dev/null | grep -q "Candidate:"; then
            LIBASOUND_PKG="libasound2t64"
        elif apt-cache policy libasound2 2>/dev/null | grep -q "Candidate:"; then
            LIBASOUND_PKG="libasound2"
        else
            # 如果都不可用，尝试安装 alsa-utils 作为替代（会拉取正确的 libasound 依赖）
            LIBASOUND_PKG="alsa-utils"
        fi
        echo "使用 ALSA 库包: $LIBASOUND_PKG"
        
        sudo apt-get install -y \
            x11-utils \
            libgtk-3-0 \
            libxcb-xinerama0 \
            libgl1-mesa-dri \
            libnotify4 \
            libnss3 \
            xdg-utils \
            libsecret-1-0 \
            libappindicator3-1 \
            libgbm1 \
            $LIBASOUND_PKG \
            fonts-noto-cjk \
            libxss1
    else
        echo "跳过 QQ 安装，退出脚本"
        exit 0
    fi
fi

chmod +x $SCRIPT_DIR/llbot/node
chmod +x $SCRIPT_DIR/llbot/pmhq

# 检测 FFmpeg 是否已安装
if ! command -v ffmpeg &> /dev/null; then
    echo "未检测到 FFmpeg，正在安装..."
    sudo apt-get install -y ffmpeg
    if [ $? -ne 0 ]; then
        echo "警告：FFmpeg 安装失败，音视频处理功能可能受限"
    else
        echo "FFmpeg 安装完成"
    fi
fi

# 寻找可用端口（从 13000 开始）
find_available_port() {
    local port=$1
    while [ $port -lt 65535 ]; do
        if ! ss -tuln | grep -q ":$port "; then
            echo $port
            return 0
        fi
        port=$((port + 1))
    done
    echo ""
    return 1
}

AVAILABLE_PORT=$(find_available_port 13000)
if [ -z "$AVAILABLE_PORT" ]; then
    echo "错误：无法找到可用端口"
    exit 1
fi


# 检测 xvfb-run 命令是否存在
USE_XVFB=1
if ! command -v xvfb-run &> /dev/null; then
    echo "未找到 xvfb-run 命令"
    echo "如果你是桌面环境，按 Y 继续运行"
    echo "如果不是桌面环境，按其他键进行安装 xvfb"
    read -n 1 -s -r key
    echo ""
    if [[ "$key" == "Y" || "$key" == "y" ]]; then
        USE_XVFB=0
    else
        sudo apt install -y xvfb
    fi
fi


if [ $USE_XVFB -eq 1 ]; then
    sudo xvfb-run $SCRIPT_DIR/llbot/pmhq --port=$AVAILABLE_PORT &
else
    sudo $SCRIPT_DIR/llbot/pmhq --port=$AVAILABLE_PORT &
fi
sleep 5

$SCRIPT_DIR/llbot/node $SCRIPT_DIR/llbot/llonebot.js -- --pmhq-port=$AVAILABLE_PORT &