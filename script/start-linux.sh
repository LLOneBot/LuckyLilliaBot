SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

chmod u+x $SCRIPT_DIR/llbot/node
chmod +x $SCRIPT_DIR/llbot/pmhq

$SCRIPT_DIR/llbot/node $SCRIPT_DIR/llbot/llonebot.js &

xvfb-run $SCRIPT_DIR/llbot/pmhq