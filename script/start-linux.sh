#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
export PATH=$PATH:/usr/bin:/usr/local/bin
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

log() { echo -e "${GREEN}>>> $1${NC}"; }
warn() { echo -e "${YELLOW}>>> $1${NC}"; }
error() { echo -e "${RED}错误: $1${NC}"; exit 1; }

confirm() {
    read -n 1 -s -r -p "$1 (Y/n) " key
    echo ""
    [[ "$key" == "Y" || "$key" == "y" || "$key" == "" ]]
}

find_port() {
    local port=$1
    while [ $port -lt 65535 ]; do
        if ! ss -tuln | grep -q ":$port "; then echo $port; return 0; fi
        ((port++))
    done
    return 1
}

if command -v pacman &> /dev/null; then
    DISTRO="arch"
elif command -v apt &> /dev/null; then
    DISTRO="debian"
else
    error "只支持 apt 或 pacman 包管理器"
fi
log "检测到系统: $DISTRO"

install_arch() {
    log "检查 Arch 依赖..."
    sudo pacman -S --needed --noconfirm base-devel git ffmpeg xorg-server-xvfb libvips imagemagick dbus xorg-xhost fcitx5-im wget

    if [ ! -f "/opt/QQ/qq" ] && confirm "未检测到 QQ，是否通过 AUR 安装?"; then
        if ! command -v yay &> /dev/null; then
            warn "未检测到 yay，尝试安装..."
            if ! sudo pacman -S --needed --noconfirm yay 2>/dev/null; then
                warn "pacman 安装失败，切换源码编译..."
                rm -rf /tmp/yay_install && git clone https://aur.archlinux.org/yay.git /tmp/yay_install
                (cd /tmp/yay_install && makepkg -si --noconfirm) || error "yay 编译失败"
                rm -rf /tmp/yay_install
            fi
        fi
        yay -S --noconfirm linuxqq || error "LinuxQQ 安装失败"
    fi
}

install_debian() {
    local ARCH_MAP=( ["x86_64"]="amd64" ["aarch64"]="arm64" )
    local ARCH=${ARCH_MAP[$(uname -m)]}
    [ -z "$ARCH" ] && error "不支持的架构: $(uname -m)"

    if [ ! -f "/opt/QQ/qq" ] && confirm "未检测到 QQ，是否安装?"; then
        log "下载并安装 QQ ($ARCH)..."
        sudo apt-get update && sudo apt-get install -y wget
        local DEB="/tmp/qq.deb"
        wget -O "$DEB" "https://dldir1v6.qq.com/qqfile/qq/QQNT/ec800879/linuxqq_3.2.20-41768_$ARCH.deb" || error "下载失败"

        # 依赖判断
        local LIB_SND="alsa-utils"
        apt-cache policy libasound2t64 2>/dev/null | grep -q "Candidate:" && LIB_SND="libasound2t64"
        apt-cache policy libasound2 2>/dev/null | grep -q "Candidate:" && LIB_SND="libasound2"

        echo "使用 ALSA 库包: $LIB_SND"

        sudo apt install -y "$DEB" x11-utils libgtk-3-0 libxcb-xinerama0 libgl1-mesa-dri libnotify4 libnss3 xdg-utils libsecret-1-0 libappindicator3-1 libgbm1 $LIB_SND fonts-noto-cjk libxss1
        rm -f "$DEB"
    fi

    for pkg in ffmpeg xvfb; do
        command -v $pkg &> /dev/null || sudo apt-get install -y $pkg
    done
}

[ "$DISTRO" == "arch" ] && install_arch || install_debian

chmod +x "$SCRIPT_DIR/llbot/node" "$SCRIPT_DIR/llbot/pmhq" 2>/dev/null
[ "$DISTRO" == "arch" ] && sudo chown -R $(whoami):$(whoami) "$SCRIPT_DIR/llbot"

PORT=$(find_port 13000)
[ -z "$PORT" ] && error "无法找到可用端口"
log "使用端口: $PORT"

HAS_DISPLAY=0
[[ -n "$DISPLAY" || -n "$WAYLAND_DISPLAY" ]] && HAS_DISPLAY=1

echo "------------------------------------------------"
echo "1) GUI 模式"
echo "2) Shell 模式"
echo "------------------------------------------------"
DEFAULT_CHOICE=$([ $HAS_DISPLAY -eq 1 ] && echo "1" || echo "2")
read -p "请选择 [1/2] (默认 $DEFAULT_CHOICE): " MODE_CHOICE
MODE_CHOICE=${MODE_CHOICE:-$DEFAULT_CHOICE}
USE_XVFB=$([ "$MODE_CHOICE" == "2" ] && echo 1 || echo 0)

# 授权 X11
if [ $USE_XVFB -eq 0 ]; then
    if command -v xauth &> /dev/null; then
        export XAUTHORITY=${XAUTHORITY:-$HOME/.Xauthority}
    else
        warn "未检测到 xauth，使用临时 xhost 授权"
        xhost +local:$(whoami) > /dev/null 2>&1
        trap "xhost -local:$(whoami) > /dev/null 2>&1" EXIT
    fi
fi

IM_ENV=""
EXTRA_FLAGS=""

if [[ "$XDG_SESSION_TYPE" == "wayland" || -n "$WAYLAND_DISPLAY" ]]; then
    log "环境: Wayland"
    IM_ENV="XMODIFIERS=@im=fcitx"
    EXTRA_FLAGS="--enable-features=UseOzonePlatform --ozone-platform=wayland --enable-wayland-ime"
else
    log "环境: X11"
    IM_ENV="GTK_IM_MODULE=fcitx QT_IM_MODULE=fcitx XMODIFIERS=@im=fcitx SDL_IM_MODULE=fcitx GLFW_IM_MODULE=ibus"
fi

NODE_BIN="$SCRIPT_DIR/llbot/node"
LLBOT_JS="$SCRIPT_DIR/llbot/llbot.js"
PMHQ_BIN="$SCRIPT_DIR/llbot/pmhq"

run_llbot() {
    if [ "$DISTRO" == "arch" ]; then
        export LD_PRELOAD="/usr/lib/libstdc++.so.6:/usr/lib/libgcc_s.so.1"
        export DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$(id -u)/bus"
    fi

    local sub_cmd="$NODE_BIN --enable-source-maps $LLBOT_JS -- --pmhq-port=$PORT --no-sandbox $EXTRA_FLAGS"

    log "启动中... (模式: $([ $USE_XVFB -eq 1 ] && echo "Headless" || echo "GUI"))"

    if [ $USE_XVFB -eq 1 ]; then
        env $IM_ENV xvfb-run -a "$PMHQ_BIN" --port="$PORT" --sub-cmd="$sub_cmd"
    else
        [ "$DISTRO" != "arch" ] && xhost +local:$(whoami) > /dev/null 2>&1
        env $IM_ENV "$PMHQ_BIN" --port="$PORT" --sub-cmd="$sub_cmd"
    fi
}

run_llbot
