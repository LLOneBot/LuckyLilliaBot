import {Config} from "../common/types";
import {checkFfmpeg, getConfigUtil} from "../common/utils";
import {ob11HTTPServer} from "../onebot11/server/http";
import {ob11WebsocketServer} from "../onebot11/server/ws/WebsocketServer";
import {ob11ReverseWebsockets} from "../onebot11/server/ws/ReverseWebsocket";
import {llonebotError} from "../common/data";

export async function setConfig(config: Config) {
    let oldConfig = getConfigUtil().getConfig();
    getConfigUtil().setConfig(config)
    if (config.ob11.httpPort != oldConfig.ob11.httpPort && config.ob11.enableHttp) {
        ob11HTTPServer.restart(config.ob11.httpPort);
    }
    // 判断是否启用或关闭HTTP服务
    if (!config.ob11.enableHttp) {
        ob11HTTPServer.stop();
    } else {
        ob11HTTPServer.start(config.ob11.httpPort);
    }
    // 正向ws端口变化，重启服务
    if (config.ob11.wsPort != oldConfig.ob11.wsPort) {
        ob11WebsocketServer.restart(config.ob11.wsPort);
    }
    // 判断是否启用或关闭正向ws
    if (config.ob11.enableWs != oldConfig.ob11.enableWs) {
        if (config.ob11.enableWs) {
            ob11WebsocketServer.start(config.ob11.wsPort);
        } else {
            ob11WebsocketServer.stop();
        }
    }
    // 判断是否启用或关闭反向ws
    if (config.ob11.enableWsReverse != oldConfig.ob11.enableWsReverse) {
        if (config.ob11.enableWsReverse) {
            ob11ReverseWebsockets.start();
        } else {
            ob11ReverseWebsockets.stop();
        }
    }
    if (config.ob11.enableWsReverse) {
        // 判断反向ws地址有变化
        if (config.ob11.wsHosts.length != oldConfig.ob11.wsHosts.length) {
            ob11ReverseWebsockets.restart();
        } else {
            for (const newHost of config.ob11.wsHosts) {
                if (!oldConfig.ob11.wsHosts.includes(newHost)) {
                    ob11ReverseWebsockets.restart();
                    break;
                }
            }
        }
    }

    // 检查ffmpeg
    if (config.ffmpeg) {
        checkFfmpeg(config.ffmpeg).then(success => {
            if (success) {
                llonebotError.ffmpegError = ''
            }
        })
    }

}