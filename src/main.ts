// 运行在 Electron 主进程 下的插件入口

const express = require("express")
const {ipcMain, webContents} = require('electron');

const CHANNEL_SEND_MSG = "llonebot_sendMsg"

function sendIPCCallSendQQMsg(postData: PostDataSendMsg) {
    let contents = webContents.getAllWebContents();
    for (const content of contents) {
        try {
            content.send(CHANNEL_SEND_MSG, postData)
        } catch (e) {
        }
    }
}

function startExpress(event: any) {
    // const original_send = (window.webContents.__qqntim_original_object && window.webContents.__qqntim_original_object.send) || window.webContents.send;
    const app = express();
    const port = 3000;

    // 中间件，用于解析POST请求的请求体
    app.use(express.urlencoded({extended: true}));
    app.use(express.json());

    app.get('/', (req: any, res: any) => {
        res.send('llonebot已启动');
    })
    // 处理POST请求的路由
    app.post('/', (req: any, res: any) => {
        let jsonData: PostDataSendMsg = req.body;
        sendIPCCallSendQQMsg(jsonData);
        res.send('POST请求已收到');
    });
    app.listen(port, () => {
        console.log(`服务器已启动，监听端口 ${port}`);
    });
}


// 加载插件时触发
function onLoad(plugin: any) {
    ipcMain.on("startExpress", (event: any, arg: any) => {
        startExpress(event)
    })
}


// 创建窗口时触发
function onBrowserWindowCreated(window: any, plugin: any) {

}


// 这两个函数都是可选的
module.exports = {
    onLoad,
    onBrowserWindowCreated
}