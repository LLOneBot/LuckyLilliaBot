#!/bin/bash
# FFmpeg 精简版编译脚本 - 支持 macOS 和 MSYS2 UCRT64 环境
set -e

FFMPEG_SRC_DIR="${1:-ffmpeg}"
INSTALL_DIR="${2:-./install}"

# 检测操作系统
OS_TYPE="$(uname -s)"
case "$OS_TYPE" in
    Darwin*)
        PLATFORM="macos"
        ;;
    MINGW*|MSYS*)
        PLATFORM="windows"
        ;;
    *)
        echo "不支持的操作系统: $OS_TYPE"
        exit 1
        ;;
esac

echo "========================================"
echo "FFmpeg 精简版编译 ($PLATFORM)"
echo "========================================"

if [ ! -d "$FFMPEG_SRC_DIR" ]; then
    echo "错误: FFmpeg 源码目录 '$FFMPEG_SRC_DIR' 不存在"
    echo "用法: $0 [ffmpeg源码目录] [安装目录]"
    exit 1
fi

if [ ! -f "$FFMPEG_SRC_DIR/configure" ]; then
    echo "错误: '$FFMPEG_SRC_DIR' 不是有效的 FFmpeg 源码目录"
    exit 1
fi

cd "$FFMPEG_SRC_DIR"

echo "清理旧构建..."
make clean 2>/dev/null || true
make distclean 2>/dev/null || true

# 转换为绝对路径
INSTALL_DIR="$(cd "$(dirname "$INSTALL_DIR")" && pwd)/$(basename "$INSTALL_DIR")"

# 根据平台设置编译选项
if [ "$PLATFORM" = "macos" ]; then
    # macOS 特定选项
    THREAD_TYPE="--enable-pthreads"

    # 设置 Homebrew 库路径并强制静态链接
    if command -v brew >/dev/null 2>&1; then
        BREW_PREFIX="$(brew --prefix)"
        OPENCORE_AMR_PREFIX="${BREW_PREFIX}/opt/opencore-amr"

        # 临时隐藏动态库，强制使用静态库
        echo "使用 Homebrew 依赖: ${BREW_PREFIX} (强制静态链接)"
        if [ -f "${OPENCORE_AMR_PREFIX}/lib/libopencore-amrnb.dylib" ]; then
            mv "${OPENCORE_AMR_PREFIX}/lib/libopencore-amrnb.dylib" "${OPENCORE_AMR_PREFIX}/lib/libopencore-amrnb.dylib.bak" 2>/dev/null || true
            mv "${OPENCORE_AMR_PREFIX}/lib/libopencore-amrnb.0.dylib" "${OPENCORE_AMR_PREFIX}/lib/libopencore-amrnb.0.dylib.bak" 2>/dev/null || true
            mv "${OPENCORE_AMR_PREFIX}/lib/libopencore-amrwb.dylib" "${OPENCORE_AMR_PREFIX}/lib/libopencore-amrwb.dylib.bak" 2>/dev/null || true
            mv "${OPENCORE_AMR_PREFIX}/lib/libopencore-amrwb.0.dylib" "${OPENCORE_AMR_PREFIX}/lib/libopencore-amrwb.0.dylib.bak" 2>/dev/null || true
            DYLIB_HIDDEN=true
        fi

        # 设置环境变量
        export PKG_CONFIG_PATH="${OPENCORE_AMR_PREFIX}/lib/pkgconfig:${PKG_CONFIG_PATH}"
        export CFLAGS="-I${OPENCORE_AMR_PREFIX}/include"
        export LDFLAGS="-L${OPENCORE_AMR_PREFIX}/lib"
    fi

    # 检测 CPU 架构
    ARCH="$(uname -m)"
    if [ "$ARCH" = "arm64" ]; then
        export CFLAGS="${CFLAGS} -arch arm64"
        export LDFLAGS="${LDFLAGS} -arch arm64"
    fi

    EXTRA_LDFLAGS=""
    EXTRA_CFLAGS=""
    EXTRA_LIBS=""
    PKG_CONFIG_FLAGS=""
else
    # Windows (MSYS2) 特定选项
    EXTRA_LDFLAGS="-static -static-libgcc -static-libstdc++"
    EXTRA_CFLAGS="-static"
    PKG_CONFIG_FLAGS="--static"
    THREAD_TYPE="--disable-w32threads --enable-pthreads"
fi

echo "配置编译选项..."
./configure \
    --prefix="$INSTALL_DIR" \
    --enable-version3 \
    --disable-everything \
    --enable-small \
    --disable-doc \
    --disable-debug \
    --disable-shared \
    --enable-static \
    --disable-network \
    --disable-autodetect \
    --enable-zlib \
    --enable-ffmpeg \
    --enable-ffprobe \
    --disable-ffplay \
    --enable-avcodec \
    --enable-avformat \
    --enable-avfilter \
    --enable-swresample \
    --enable-swscale \
    --enable-libopencore-amrnb \
    --enable-libopencore-amrwb \
    --enable-decoder=libopencore_amrnb \
    --enable-decoder=libopencore_amrwb \
    --enable-decoder=pcm_s16le \
    --enable-decoder=pcm_s16be \
    --enable-decoder=pcm_u8 \
    --enable-decoder=pcm_f32le \
    --enable-decoder=mp3 \
    --enable-decoder=mp3float \
    --enable-decoder=aac \
    --enable-decoder=aac_fixed \
    --enable-decoder=flac \
    --enable-decoder=opus \
    --enable-decoder=vorbis \
    --enable-decoder=h264 \
    --enable-decoder=hevc \
    --enable-decoder=vp8 \
    --enable-decoder=vp9 \
    --enable-decoder=av1 \
    --enable-decoder=mpeg4 \
    --enable-decoder=mjpeg \
    --enable-decoder=png \
    --enable-decoder=gif \
    --enable-decoder=webp \
    --enable-decoder=bmp \
    --enable-encoder=pcm_s16le \
    --enable-encoder=png \
    --enable-encoder=mjpeg \
    --enable-demuxer=pcm_s16le \
    --enable-demuxer=pcm_s16be \
    --enable-demuxer=pcm_f32le \
    --enable-demuxer=wav \
    --enable-demuxer=mp3 \
    --enable-demuxer=aac \
    --enable-demuxer=flac \
    --enable-demuxer=ogg \
    --enable-demuxer=amr \
    --enable-demuxer=mov \
    --enable-demuxer=matroska \
    --enable-demuxer=webm \
    --enable-demuxer=avi \
    --enable-demuxer=flv \
    --enable-demuxer=mpegts \
    --enable-demuxer=image2 \
    --enable-demuxer=image2pipe \
    --enable-muxer=pcm_s16le \
    --enable-muxer=pcm_s16be \
    --enable-muxer=pcm_f32le \
    --enable-muxer=wav \
    --enable-muxer=image2 \
    --enable-muxer=image2pipe \
    --enable-parser=h264 \
    --enable-parser=hevc \
    --enable-parser=vp8 \
    --enable-parser=vp9 \
    --enable-parser=av1 \
    --enable-parser=mpeg4video \
    --enable-parser=aac \
    --enable-parser=mp3 \
    --enable-parser=flac \
    --enable-parser=opus \
    --enable-parser=vorbis \
    --enable-parser=png \
    --enable-parser=mjpeg \
    --enable-parser=gif \
    --enable-parser=webp \
    --enable-parser=bmp \
    --enable-parser=amr \
    --enable-filter=aresample \
    --enable-filter=aformat \
    --enable-filter=anull \
    --enable-filter=scale \
    --enable-filter=thumbnail \
    --enable-filter=fps \
    --enable-filter=format \
    --enable-filter=null \
    --enable-filter=split \
    --enable-protocol=file \
    --enable-protocol=pipe \
    --enable-bsf=h264_mp4toannexb \
    --enable-bsf=hevc_mp4toannexb \
    --enable-bsf=aac_adtstoasc \
    ${EXTRA_LDFLAGS:+--extra-ldflags="$EXTRA_LDFLAGS"} \
    ${EXTRA_CFLAGS:+--extra-cflags="$EXTRA_CFLAGS"} \
    ${EXTRA_LIBS:+--extra-libs="$EXTRA_LIBS"} \
    ${PKG_CONFIG_FLAGS:+--pkg-config-flags="$PKG_CONFIG_FLAGS"} \
    $THREAD_TYPE

echo ""
echo "开始编译 (使用 $(nproc 2>/dev/null || sysctl -n hw.ncpu) 核心)..."
make -j$(nproc 2>/dev/null || sysctl -n hw.ncpu)

echo ""
echo "安装..."
make install

echo ""
echo "检查依赖..."
# 设置可执行文件名
if [ "$PLATFORM" = "macos" ]; then
    FFMPEG_BIN="$INSTALL_DIR/bin/ffmpeg"
else
    FFMPEG_BIN="$INSTALL_DIR/bin/ffmpeg.exe"
fi

# 检查是否真正静态链接
if [ "$PLATFORM" = "macos" ]; then
    if command -v otool >/dev/null 2>&1; then
        echo "ffmpeg 依赖:"
        otool -L "$FFMPEG_BIN" | grep -v "@rpath" | grep -v "/usr/lib" | grep -v "$FFMPEG_BIN" || echo "无外部动态库依赖 ✓"
    fi
else
    if command -v ldd >/dev/null 2>&1; then
        echo "ffmpeg.exe 依赖:"
        ldd "$FFMPEG_BIN" || echo "完全静态链接 ✓"
    fi
fi

echo ""
echo "========================================"
echo "编译完成!"
echo "输出目录: $INSTALL_DIR/bin"
ls -lh "$INSTALL_DIR/bin/"

# Windows 特定：如果静态链接失败，复制 DLL
if [ "$PLATFORM" = "windows" ]; then
    if ! "$FFMPEG_BIN" -version > /dev/null 2>&1; then
        echo "静态链接失败，复制运行时库..."
        # 复制必要的运行时库到 bin 目录
        DLLS=("libgcc_s_seh-1.dll" "libstdc++-6.dll" "libwinpthread-1.dll")
        for dll in "${DLLS[@]}"; do
            if [ -f "/ucrt64/bin/$dll" ]; then
                cp "/ucrt64/bin/$dll" "$INSTALL_DIR/bin/"
                echo "复制: $dll"
            fi
        done
    else
        echo "✓ ffmpeg 可以独立运行，无需额外 DLL"
    fi
fi

# 测试 ffmpeg 是否能运行
echo ""
echo "测试 ffmpeg..."
if "$FFMPEG_BIN" -version > /dev/null 2>&1; then
    echo "✓ ffmpeg 可以正常运行"
else
    echo "✗ ffmpeg 运行失败，可能缺少依赖库"
fi

echo "========================================"
echo "编译完成"

# macOS: 恢复临时隐藏的动态库
if [ "$PLATFORM" = "macos" ] && [ "$DYLIB_HIDDEN" = "true" ]; then
    echo ""
    echo "恢复动态库..."
    if command -v brew >/dev/null 2>&1; then
        OPENCORE_AMR_PREFIX="$(brew --prefix)/opt/opencore-amr"
        mv "${OPENCORE_AMR_PREFIX}/lib/libopencore-amrnb.dylib.bak" "${OPENCORE_AMR_PREFIX}/lib/libopencore-amrnb.dylib" 2>/dev/null || true
        mv "${OPENCORE_AMR_PREFIX}/lib/libopencore-amrnb.0.dylib.bak" "${OPENCORE_AMR_PREFIX}/lib/libopencore-amrnb.0.dylib" 2>/dev/null || true
        mv "${OPENCORE_AMR_PREFIX}/lib/libopencore-amrwb.dylib.bak" "${OPENCORE_AMR_PREFIX}/lib/libopencore-amrwb.dylib" 2>/dev/null || true
        mv "${OPENCORE_AMR_PREFIX}/lib/libopencore-amrwb.0.dylib.bak" "${OPENCORE_AMR_PREFIX}/lib/libopencore-amrwb.0.dylib" 2>/dev/null || true
    fi
fi
