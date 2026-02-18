#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
export PATH=$PATH:/usr/bin:/usr/local/bin

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

# 状态变量
CLEANING=0
PMHQ_PID=""
USE_XVFB=0
DISTRO=""
LLBOT_CLI_BIN="$SCRIPT_DIR/llbot"

log() { echo -e "${GREEN}>>> $1${NC}"; }
warn() { echo -e "${YELLOW}>>> $1${NC}"; }
error() { echo -e "${RED}错误: $1${NC}"; exit 1; }

check_sudo() {
    log "验证 Sudo 权限..."
    sudo -v || error "Sudo 验证失败或被取消，脚本终止。"
}


trap cleanup SIGINT SIGTERM

confirm() {
    local key=""
    read -n 1 -s -r -p "$1 (Y/n) " key < /dev/tty
    echo ""
    [[ "$key" == "Y" || "$key" == "y" || "$key" == "" ]]
}


# 环境检查
if command -v pacman &> /dev/null; then
    DISTRO="arch"
elif command -v apt &> /dev/null; then
    DISTRO="debian"
else
    error "当前只支持 apt 或 pacman 包管理器"
fi
log "检测到系统: $DISTRO"

install_arch() {
    check_sudo
    log "检查 Arch 依赖..."
    sudo pacman -S --needed --noconfirm base-devel git ffmpeg xorg-server-xvfb libvips imagemagick dbus xorg-xhost fcitx5-im wget || error "基础依赖安装失败"

    if [ ! -f "/opt/QQ/qq" ] && confirm "未检测到 QQ，是否通过 AUR 安装?"; then
        if ! command -v yay &> /dev/null; then
            warn "未检测到 yay，尝试安装..."
            sudo pacman -S --needed --noconfirm yay || {
                local TMP_DIR="/tmp/yay_install"
                rm -rf "$TMP_DIR" && git clone https://aur.archlinux.org/yay.git "$TMP_DIR"
                (cd "$TMP_DIR" && makepkg -si --noconfirm) || { rm -rf "$TMP_DIR"; error "yay 编译失败"; }
                rm -rf "$TMP_DIR"
            }
        fi
        yay -S --noconfirm linuxqq || error "LinuxQQ 安装失败"
    fi
}

install_debian() {
    check_sudo
    local MACHINE=$(uname -m)
    case "$MACHINE" in
      x86_64)  ARCH="amd64" ;;
      aarch64) ARCH="arm64" ;;
      *)       error "不支持的架构: $MACHINE" ;;
    esac

    if [ ! -f "/opt/QQ/qq" ] && confirm "未检测到 QQ，是否安装?"; then
        sudo apt-get update && sudo apt-get install -y wget || error "基础工具安装失败"
        local DEB="/tmp/qq.deb"
        wget -O "$DEB" "https://dldir1v6.qq.com/qqfile/qq/QQNT/ab90fdfa/linuxqq_3.2.20-40768_$ARCH.deb" || error "下载失败"
        local LIB_SND="libasound2"
        apt-cache show libasound2t64 &>/dev/null && LIB_SND="libasound2t64"
        sudo apt install -y "$DEB" x11-utils libgtk-3-0 libxcb-xinerama0 libgl1-mesa-dri libnotify4 libnss3 xdg-utils libsecret-1-0 libappindicator3-1 libgbm1 $LIB_SND fonts-noto-cjk libxss1 || error "依赖安装失败"
        rm -f "$DEB"
    fi
    sudo apt-get install -y ffmpeg xvfb || error "工具安装失败"
}

# 执行安装
[ "$DISTRO" == "arch" ] && install_arch || install_debian

# 配置权限
chmod +x "$SCRIPT_DIR/bin/llbot/node" "$SCRIPT_DIR/bin/pmhq/pmhq" "$LLBOT_CLI_BIN" 2>/dev/null
sudo chown -R $(whoami):$(whoami) "$SCRIPT_DIR/bin" 2>/dev/null


echo "------------------------------------------------"
echo "1) GUI 模式 (有界面)"
echo "2) Shell 模式 (无界面)"
echo "------------------------------------------------"

MODE_CHOICE=""
TIMEOUT=5
while [ $TIMEOUT -gt 0 ]; do
    printf "\r请选择 [1/2] (${TIMEOUT}秒后自动选择 Shell): "
    # 使用 tty 确保 read 不被管道干扰
    if read -t 1 -n 1 MODE_CHOICE < /dev/tty; then
        echo ""
        break
    fi
    ((TIMEOUT--))
done
[ -z "$MODE_CHOICE" ] && { echo ""; log "超时，自动选择 Shell 模式"; }

MODE_CHOICE=${MODE_CHOICE:-2}
USE_XVFB=$([ "$MODE_CHOICE" == "2" ] && echo 1 || echo 0)

# X11/Wayland 变量处理
if [ $USE_XVFB -eq 0 ]; then
    if command -v xauth &> /dev/null; then
        export XAUTHORITY=${XAUTHORITY:-$HOME/.Xauthority}
    else
        xhost +local:$(whoami) > /dev/null 2>&1
    fi
fi

IM_ENV="XMODIFIERS=@im=fcitx"
EXTRA_FLAGS=""
if [[ "$XDG_SESSION_TYPE" == "wayland" || -n "$WAYLAND_DISPLAY" ]]; then
    EXTRA_FLAGS="--enable-features=UseOzonePlatform --ozone-platform=wayland --enable-wayland-ime"
else
    IM_ENV="GTK_IM_MODULE=fcitx QT_IM_MODULE=fcitx $IM_ENV SDL_IM_MODULE=fcitx GLFW_IM_MODULE=ibus"
fi

run_llbot() {
    set -m
    if [ "$DISTRO" == "arch" ]; then
        export LD_PRELOAD="/usr/lib/libstdc++.so.6:/usr/lib/libgcc_s.so.1"
        export DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$(id -u)/bus"
    fi

    log "启动模式: $([ $USE_XVFB -eq 1 ] && echo "Headless" || echo "GUI")"

    if [ $USE_XVFB -eq 1 ]; then
        env $IM_ENV xvfb-run -a "$LLBOT_CLI_BIN"
    else
        [ "$DISTRO" != "arch" ] && xhost +local:$(whoami) > /dev/null 2>&1
        env $IM_ENV "$LLBOT_CLI_BIN"
    fi
}

run_llbot
