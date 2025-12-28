#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
export PATH=$PATH:/usr/bin:/usr/local/bin

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

CLEANING=0
PMHQ_PID=""
USE_XVFB=0
DISTRO=""

log() { echo -e "${GREEN}>>> $1${NC}"; }
warn() { echo -e "${YELLOW}>>> $1${NC}"; }
error() { echo -e "${RED}错误: $1${NC}"; exit 1; }

check_sudo() {
    log "验证 Sudo 权限..."
    if ! sudo -v; then
        error "Sudo 验证失败或被取消，脚本终止。"
    fi
}

cleanup() {
    # 防止用户对 Ctrl+C 突然产生某种异样的迷恋然后狂按 Ctrl+C
    [ "$CLEANING" -eq 1 ] && return
    CLEANING=1

    # 防止日志挡交互
    if [ -n "$PMHQ_PID" ] && kill -0 "$PMHQ_PID" 2>/dev/null; then
        kill -STOP -"$PMHQ_PID" 2>/dev/null
    fi

    echo ""
    warn "收到退出信号 (进程已挂起) <<<"

    local kill_qq=1
    local choice=""

    if [ -n "$PMHQ_PID" ]; then
        if read -t 5 -n 1 -r -p "是否关闭 QQ 及相关进程? [Y/n] (5秒后默认关闭): " choice < /dev/tty; then
            echo ""
        else
            echo ""
            log "等待超时，执行默认关闭操作。"
        fi

        if [[ "$choice" == "n" || "$choice" == "N" ]]; then
            kill_qq=0
        fi
    fi

    if [ $kill_qq -eq 1 ]; then
        warn "正在停止服务..."

        kill -CONT -"$PMHQ_PID" 2>/dev/null

        kill -TERM -"$PMHQ_PID" 2>/dev/null
        pkill -15 -f "$PMHQ_BIN" 2>/dev/null
        pkill -15 -f "/opt/QQ/qq" 2>/dev/null

        local wait_count=0

        while kill -0 "$PMHQ_PID" 2>/dev/null || \
              pgrep -f "$PMHQ_BIN" > /dev/null || \
              pgrep -f "/opt/QQ/qq" > /dev/null; do
            sleep 0.5
            ((wait_count++))
            if [ $wait_count -ge 6 ]; then
                warn "检测到残留进程，执行强制清理..."
                # 气死我了，总有点关不掉进程的毛病，累了，跟我 pkill -9 说去吧
                # 期待大手子修复
                kill -KILL -"$PMHQ_PID" 2>/dev/null
                pkill -9 -f "$PMHQ_BIN" 2>/dev/null
                pkill -9 -f "/opt/QQ/qq" 2>/dev/null
                break
            fi
        done

        # 环境清理
        if [ "$DISTRO" != "arch" ] && [ "$USE_XVFB" -eq 0 ]; then
            if command -v xhost &> /dev/null; then
                xhost -local:$(whoami) > /dev/null 2>&1
            fi
        fi
        log "所有进程已清理完毕。"
    else
        # 选择不关闭时必须恢复进程运行
        kill -CONT -"$PMHQ_PID" 2>/dev/null
        log "已恢复后台进程运行 (PGID: $PMHQ_PID)"
        warn "注意：它们已脱离脚本控制，后续请手动管理"
    fi

    exit 0
}

trap cleanup SIGINT SIGTERM EXIT

confirm() {
    read -n 1 -s -r -p "$1 (Y/n) " key
    echo ""
    [[ "$key" == "Y" || "$key" == "y" || "$key" == "" ]]
}

find_port() {
    # 优先尝试让系统自动分配
    local port=$(python3 -c 'import socket; s=socket.socket(); s.bind(("",0)); print(s.getsockname()[1]); s.close()' 2>/dev/null)
    if [ -n "$port" ]; then
        echo $port
        return 0
    fi
    # 回退方案：扫描可用端口
    local port=$1
    while [ $port -lt 65535 ]; do
        if ! ss -tuln 2>/dev/null | grep -q ":$port " && ! netstat -tuln 2>/dev/null | grep -q ":$port "; then
            echo $port
            return 0
        fi
        ((port++))
    done
    return 1
}

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
            if ! sudo pacman -S --needed --noconfirm yay 2>/dev/null; then
                warn "pacman 安装 yay 失败，切换源码编译..."
                rm -rf /tmp/yay_install && git clone https://aur.archlinux.org/yay.git /tmp/yay_install
                (cd /tmp/yay_install && makepkg -si --noconfirm) || error "yay 编译失败"
                rm -rf /tmp/yay_install
            fi
        fi
        yay -S --noconfirm linuxqq || error "LinuxQQ 安装失败"
    fi
}

install_debian() {
    check_sudo
    local MACHINE=$(uname -m)
    local ARCH=""
    case "$MACHINE" in
        x86_64)  ARCH="amd64" ;;
        aarch64) ARCH="arm64" ;;
        *)       error "不支持的架构: $MACHINE" ;;
    esac

    if [ ! -f "/opt/QQ/qq" ] && confirm "未检测到 QQ，是否安装?"; then
        log "下载并安装 QQ ($ARCH)..."
        sudo apt-get update && sudo apt-get install -y wget || error "apt update 或 wget 安装失败"

        local DEB="/tmp/qq.deb"
        wget -O "$DEB" "https://dldir1v6.qq.com/qqfile/qq/QQNT/ab90fdfa/linuxqq_3.2.20-40768_$ARCH.deb" || error "QQ 安装包下载失败"

        local LIB_SND="libasound2"
        if apt-cache show libasound2t64 &>/dev/null; then
            LIB_SND="libasound2t64"
        fi
        log "使用 ALSA 库包名: $LIB_SND"

        sudo apt install -y "$DEB" x11-utils libgtk-3-0 libxcb-xinerama0 libgl1-mesa-dri libnotify4 libnss3 xdg-utils libsecret-1-0 libappindicator3-1 libgbm1 $LIB_SND fonts-noto-cjk libxss1 || error "QQ 依赖安装失败"
        rm -f "$DEB"
    fi

    # 检查其他工具
    local missing_pkgs=""
    for pkg in ffmpeg xvfb; do
        if ! command -v $pkg &> /dev/null; then
            missing_pkgs="$missing_pkgs $pkg"
        fi
    done

    if [ -n "$missing_pkgs" ]; then
        log "安装缺失工具: $missing_pkgs"
        sudo apt-get install -y $missing_pkgs || error "工具安装失败"
    fi
}

# 执行安装
if [ "$DISTRO" == "arch" ]; then
    install_arch
else
    install_debian
fi

chmod +x "$SCRIPT_DIR/llbot/node" "$SCRIPT_DIR/llbot/pmhq" 2>/dev/null

sudo chown -R $(whoami):$(whoami) "$SCRIPT_DIR/llbot" 2>/dev/null

PORT=$(find_port 13000)
[ -z "$PORT" ] && error "无法找到可用端口"
log "分配端口: $PORT"

echo "------------------------------------------------"
echo "1) GUI 模式 (有界面)"
echo "2) Shell 模式 (无界面/Headless，默认)"
echo "------------------------------------------------"

MODE_CHOICE=""
TIMEOUT=5
while [ $TIMEOUT -gt 0 ]; do
    printf "\r请选择 [1/2] (${TIMEOUT}秒后自动选择 Shell): "
    if read -t 1 -n 1 MODE_CHOICE; then
        echo ""
        break
    fi
    ((TIMEOUT--))
done
[ $TIMEOUT -eq 0 ] && echo "" && log "超时，自动选择 Shell 模式"

MODE_CHOICE=${MODE_CHOICE:-2}
USE_XVFB=$([ "$MODE_CHOICE" == "2" ] && echo 1 || echo 0)

if [ $USE_XVFB -eq 0 ]; then
    if command -v xauth &> /dev/null; then
        export XAUTHORITY=${XAUTHORITY:-$HOME/.Xauthority}
    else
        warn "未检测到 xauth，使用临时 xhost 授权"
        xhost +local:$(whoami) > /dev/null 2>&1
    fi
fi

IM_ENV=""
EXTRA_FLAGS=""

if [[ "$XDG_SESSION_TYPE" == "wayland" || -n "$WAYLAND_DISPLAY" ]]; then
    log "检测到 Wayland 环境"
    IM_ENV="XMODIFIERS=@im=fcitx"
    EXTRA_FLAGS="--enable-features=UseOzonePlatform --ozone-platform=wayland --enable-wayland-ime"
else
    log "检测到 X11 环境"
    IM_ENV="GTK_IM_MODULE=fcitx QT_IM_MODULE=fcitx XMODIFIERS=@im=fcitx SDL_IM_MODULE=fcitx GLFW_IM_MODULE=ibus"
fi

NODE_BIN="$SCRIPT_DIR/llbot/node"
LLBOT_JS="$SCRIPT_DIR/llbot/llbot.js"
PMHQ_BIN="$SCRIPT_DIR/llbot/pmhq"

run_llbot() {
    set -m

    if [ "$DISTRO" == "arch" ]; then
        export LD_PRELOAD="/usr/lib/libstdc++.so.6:/usr/lib/libgcc_s.so.1"
        export DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$(id -u)/bus"
    fi

    local sub_cmd="$NODE_BIN --enable-source-maps $LLBOT_JS -- --pmhq-port=$PORT --no-sandbox $EXTRA_FLAGS"

    log "正在启动 LLBot... (模式: $([ $USE_XVFB -eq 1 ] && echo "Headless" || echo "GUI"))"
    log "按 Ctrl+C 可停止运行"

    if [ $USE_XVFB -eq 1 ]; then
        env $IM_ENV xvfb-run -a "$PMHQ_BIN" --port="$PORT" --sub-cmd="$sub_cmd" &
    else
        if [ "$DISTRO" != "arch" ]; then
             xhost +local:$(whoami) > /dev/null 2>&1
        fi
        env $IM_ENV "$PMHQ_BIN" --port="$PORT" --sub-cmd="$sub_cmd" &
    fi

    PMHQ_PID=$!

    # 阻塞等待进程结束
    wait "$PMHQ_PID" || true
}

run_llbot
