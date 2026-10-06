#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
export PATH=$PATH:/usr/bin:/usr/local/bin

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

DISTRO=""
LLBOT_CLI_BIN="$SCRIPT_DIR/LuckyLillia"
PROTOCOL_MODE=""
DISPLAY_MODE=""
LLBOT_ARGS=()

log() { echo -e "${GREEN}>>> $1${NC}"; }
warn() { echo -e "${YELLOW}>>> $1${NC}"; }
error() { echo -e "${RED}错误: $1${NC}"; exit 1; }

check_sudo() {
    log "验证 Sudo 权限..."
    sudo -v || error "Sudo 验证失败或被取消，脚本终止。"
}


HAS_TTY=0
if [ -t 0 ] || [ -t 1 ] || [ -t 2 ]; then
    HAS_TTY=1
fi

confirm() {
    if [ "$HAS_TTY" -eq 0 ]; then
        log "无终端，自动确认: $1"
        return 0
    fi
    local key=""
    read -n 1 -s -r -p "$1 (Y/n) " key < /dev/tty
    echo ""
    [[ "$key" == "Y" || "$key" == "y" || "$key" == "" ]]
}

usage() {
    cat <<EOF
用法: $(basename "$0") [启动模式] [界面模式] [LuckyLillia 参数...]

启动模式:
  --headless              无头模式，直接运行 ./LuckyLillia（默认）
  --headed                有头模式，通过 PMHQ 连接 QQ

界面模式（仅有头模式）:
  --gui                   GUI 模式，显示 QQ 窗口（同时指定有头模式）
  --shell                 Shell 模式，使用 Xvfb（同时指定有头模式）

其他选项:
  -h, --help              显示此帮助
  其他未识别参数          原样透传给 ./LuckyLillia
  --                      后续参数强制全部透传给 ./LuckyLillia

示例:
  $(basename "$0") --headless
  $(basename "$0") --headed --gui
  $(basename "$0") --shell
  $(basename "$0") --headless --update
EOF
}

set_protocol_mode() {
    local mode="$1"
    if [ -n "$PROTOCOL_MODE" ] && [ "$PROTOCOL_MODE" != "$mode" ]; then
        error "不能同时指定无头模式和有头模式"
    fi
    PROTOCOL_MODE="$mode"
}

set_display_mode() {
    local mode="$1"
    if [ -n "$DISPLAY_MODE" ] && [ "$DISPLAY_MODE" != "$mode" ]; then
        error "不能同时指定 GUI 模式和 Shell 模式"
    fi
    set_protocol_mode "headed"
    DISPLAY_MODE="$mode"
}

parse_args() {
    while [ "$#" -gt 0 ]; do
        case "$1" in
            --headless)
                set_protocol_mode "headless"
                ;;
            --headed|--pmhq)
                set_protocol_mode "headed"
                ;;
            --gui)
                set_display_mode "gui"
                ;;
            --shell)
                set_display_mode "shell"
                ;;
            -h|--help)
                usage
                exit 0
                ;;
            --)
                shift
                LLBOT_ARGS+=("$@")
                break
                ;;
            --sub-cmd)
                LLBOT_ARGS+=("$@")
                break
                ;;
            *)
                LLBOT_ARGS+=("$1")
                ;;
        esac
        shift
    done
}

choose_protocol_mode() {
    if [ "$HAS_TTY" -eq 0 ]; then
        PROTOCOL_MODE="headless"
        log "无终端，自动选择无头模式"
        return
    fi

    echo "------------------------------------------------"
    echo "1) 无头模式（--headless，直连协议，默认）"
    echo "2) 有头模式（--headed，PMHQ + QQ）"
    echo "------------------------------------------------"
    while true; do
        read -r -p "请选择 [1/2，默认 1]: " choice < /dev/tty || error "读取启动模式失败"
        case "${choice:-1}" in
            1) PROTOCOL_MODE="headless"; return ;;
            2) PROTOCOL_MODE="headed"; return ;;
            *) warn "无效选项，请输入 1 或 2" ;;
        esac
    done
}

choose_display_mode() {
    if [ "$HAS_TTY" -eq 0 ]; then
        DISPLAY_MODE="shell"
        log "无终端，自动选择 Shell 模式"
        return
    fi

    echo "------------------------------------------------"
    echo "1) GUI 模式（--gui，显示 QQ 窗口）"
    echo "2) Shell 模式（--shell，使用虚拟显示）"
    echo "------------------------------------------------"
    while true; do
        read -r -p "请选择 [1/2]: " choice < /dev/tty || error "读取界面模式失败"
        case "$choice" in
            1) DISPLAY_MODE="gui"; return ;;
            2) DISPLAY_MODE="shell"; return ;;
            *) warn "无效选项，请输入 1 或 2" ;;
        esac
    done
}

parse_args "$@"
[ -z "$PROTOCOL_MODE" ] && choose_protocol_mode
[ "$PROTOCOL_MODE" == "headed" ] && [ -z "$DISPLAY_MODE" ] && choose_display_mode

if [ "$PROTOCOL_MODE" == "headless" ]; then
    chmod +x "$SCRIPT_DIR/bin/llbot/node" "$LLBOT_CLI_BIN" 2>/dev/null
    log "启动模式: 无头"
    exec "$LLBOT_CLI_BIN" "${LLBOT_ARGS[@]}"
fi

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
        wget -O "$DEB" "https://qqdl.gtimg.cn/qqfile/QQNT/9.9.32/release/c390e792/QQ_3.2.31_260710_${ARCH}_01.deb" || error "下载失败"
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
sudo chown -R "$(whoami):$(whoami)" "$SCRIPT_DIR/bin" 2>/dev/null

# X11/Wayland 变量处理
if [ "$DISPLAY_MODE" == "gui" ]; then
    if command -v xauth &> /dev/null; then
        export XAUTHORITY=${XAUTHORITY:-$HOME/.Xauthority}
    else
        xhost +local:$(whoami) > /dev/null 2>&1
    fi
fi

IM_ENV=("XMODIFIERS=@im=fcitx")
if [ "$DISPLAY_MODE" == "gui" ] && [[ "$XDG_SESSION_TYPE" == "wayland" || -n "$WAYLAND_DISPLAY" ]]; then
    :
else
    IM_ENV=(
        "GTK_IM_MODULE=fcitx"
        "QT_IM_MODULE=fcitx"
        "XMODIFIERS=@im=fcitx"
        "SDL_IM_MODULE=fcitx"
        "GLFW_IM_MODULE=ibus"
    )
fi

run_llbot() {
    if [ "$DISTRO" == "arch" ]; then
        export LD_PRELOAD="/usr/lib/libstdc++.so.6:/usr/lib/libgcc_s.so.1"
        export DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$(id -u)/bus"
    fi

    log "启动模式: 有头 / $([ "$DISPLAY_MODE" == "shell" ] && echo "Shell" || echo "GUI")"

    if [ "$DISPLAY_MODE" == "shell" ]; then
        exec env "${IM_ENV[@]}" xvfb-run -a "$LLBOT_CLI_BIN" --pmhq "${LLBOT_ARGS[@]}"
    else
        [ "$DISTRO" != "arch" ] && xhost +local:$(whoami) > /dev/null 2>&1
        exec env "${IM_ENV[@]}" "$LLBOT_CLI_BIN" --pmhq "${LLBOT_ARGS[@]}"
    fi
}

run_llbot
