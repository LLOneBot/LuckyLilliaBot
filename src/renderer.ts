/// <reference path="./global.d.ts" />


// 打开设置界面时触发
async function onSettingWindowCreated(view: Element) {
    window.llonebot.log("setting window created");
    let config = await window.llonebot.getConfig()

    function createHttpHostEleStr(host: string) {
        let eleStr = `
            <setting-item data-direction="row" class="hostItem vertical-list-item">
                <h2>事件上报地址(http)</h2>
                <input class="httpHost input-text" type="text" value="${host}" 
                style="width:60%;padding: 5px"
                placeholder="如果localhost上报失败试试局域网ip"/>
            </setting-item>

            `
        return eleStr
    }

    function createWsHostEleStr(host: string) {
        let eleStr = `
            <setting-item data-direction="row" class="hostItem vertical-list-item">
                <h2>事件上报地址(反向websocket)</h2>
                <input class="wsHost input-text" type="text" value="${host}" 
                style="width:60%;padding: 5px"
                placeholder="如果localhost上报失败试试局域网ip"/>
            </setting-item>

            `
        return eleStr
    }

    let httpHostsEleStr = ""
    for (const host of config.httpHosts) {
        httpHostsEleStr += createHttpHostEleStr(host);
    }

    let wsHostsEleStr = ""
    for (const host of config.wsHosts) {
        wsHostsEleStr += createWsHostEleStr(host);
    }

    let html = `
    <div class="config_view llonebot">
        <setting-section>
            <setting-panel>
                <setting-list class="wrap">
                    <setting-item class="vertical-list-item" data-direction="row">
                        <setting-text>HTTP监听端口</setting-text>
                        <input id="httpPort" type="number" value="${config.httpPort}"/>
                    </setting-item>
                    <div>
                        <button id="addHttpHost" class="q-button">添加HTTP POST上报地址</button>
                    </div>
                    <div id="httpHostItems">
                        ${httpHostsEleStr}
                    </div>
                    
                    <setting-item class="vertical-list-item" data-direction="row">
                        <setting-text>正向Websocket监听端口</setting-text>
                        <input id="wsPort" type="number" value="${config.wsPort}"/>
                    </setting-item>
                    <setting-item class="vertical-list-item" data-direction="row">
                        <setting-text>Access Token</setting-text>
                        <input id="token" type="text" placeholder="可为空" value="${config.token}"/>
                    </setting-item>
                    <div>
                        <button id="addWsHost" class="q-button">添加反向Websocket上报地址</button>
                    </div>
                    <div id="wsHostItems">
                        ${wsHostsEleStr}
                    </div>
                    <button id="save" class="q-button">保存</button>
                </setting-list>
            </setting-panel>
            <setting-panel>
                <setting-item data-direction="row" class="hostItem vertical-list-item">
                    <div>
                        <div>启用HTTP支持</div>
                        <div class="tips">修改后须重启QQ生效</div>
                    </div>
                    <setting-switch id="http" ${config.enableHttp ? "is-active" : ""}></setting-switch>
                </setting-item>
                <setting-item data-direction="row" class="hostItem vertical-list-item">
                    <div>
                        <div>启用HTTP POST支持</div>
                        <div class="tips">修改后须重启QQ生效</div>
                    </div>
                    <setting-switch id="httpPost" ${config.enableHttpPost ? "is-active" : ""}></setting-switch>
                </setting-item>
                <setting-item data-direction="row" class="hostItem vertical-list-item">
                    <div>
                        <div>启用正向Websocket支持</div>
                        <div class="tips">修改后须重启QQ生效</div>
                    </div>
                    <setting-switch id="websocket" ${config.enableWs ? "is-active" : ""}></setting-switch>
                </setting-item>
                <setting-item data-direction="row" class="hostItem vertical-list-item">
                    <div>
                        <div>启用反向Websocket支持</div>
                        <div class="tips">修改后须重启QQ生效</div>
                    </div>
                    <setting-switch id="websocketReverse" ${config.enableWsReverse ? "is-active" : ""}></setting-switch>
                </setting-item>
                <setting-item data-direction="row" class="hostItem vertical-list-item">
                    <div>
                        <div>上报文件进行base64编码</div>
                        <div class="tips">不开启时，上报文件将以本地路径形式发送</div>
                    </div>
                    <setting-switch id="switchBase64" ${config.enableBase64 ? "is-active" : ""}></setting-switch>
                </setting-item>
                <setting-item data-direction="row" class="hostItem vertical-list-item">
                    <div>
                        <div>debug模式</div>
                        <div class="tips">开启后上报消息添加raw字段附带原始消息</div>
                    </div>
                    <setting-switch id="debug" ${config.debug ? "is-active" : ""}></setting-switch>
                </setting-item>
                <setting-item data-direction="row" class="hostItem vertical-list-item">
                    <div>
                        <div>上报自身消息</div>
                        <div class="tips">开启后上报自己发出的消息</div>
                    </div>
                    <setting-switch id="reportSelfMessage" ${config.reportSelfMessage ? "is-active" : ""}></setting-switch>
                </setting-item>
                <setting-item data-direction="row" class="hostItem vertical-list-item">
                    <div>
                        <div>日志</div>
                        <div class="tips">日志目录:${window.LiteLoader.plugins["LLOneBot"].path.data}</div>
                    </div>
                    <setting-switch id="log" ${config.log ? "is-active" : ""}></setting-switch>
                </setting-item>
            </setting-panel>
        </setting-section>
    </div>
    <style>
        setting-panel {
            padding: 10px;
        }
        .tips {
            font-size: 0.75rem;
        }
        @media (prefers-color-scheme: dark){
            .llonebot input {
                color: white;
            }
        }
    </style>
    `

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");


    function addHostEle(type: string, initValue: string = "") {
        let addressEle, hostItemsEle;
        if (type === "ws") {
            let addressDoc = parser.parseFromString(createWsHostEleStr(initValue), "text/html");
            addressEle = addressDoc.querySelector("setting-item")
            hostItemsEle = document.getElementById("wsHostItems");
        }
        else {
            let addressDoc = parser.parseFromString(createHttpHostEleStr(initValue), "text/html");
            addressEle = addressDoc.querySelector("setting-item")
            hostItemsEle = document.getElementById("httpHostItems");
        }

        hostItemsEle.appendChild(addressEle);
    }


    doc.getElementById("addHttpHost").addEventListener("click", () => addHostEle("http"))
    doc.getElementById("addWsHost").addEventListener("click", () => addHostEle("ws"))

    function switchClick(eleId: string, configKey: string) {
        doc.getElementById(eleId)?.addEventListener("click", (e) => {
            const switchEle = e.target as HTMLInputElement
            if (config[configKey]) {
                config[configKey] = false
                switchEle.removeAttribute("is-active")
            } else {
                config[configKey] = true
                switchEle.setAttribute("is-active", "")
            }
            window.llonebot.setConfig(config)
        })
    }

    switchClick("http", "enableHttp");
    switchClick("httpPost", "enableHttpPost");
    switchClick("websocket", "enableWs");
    switchClick("websocketReverse", "enableWsReverse");
    switchClick("debug", "debug");
    switchClick("switchBase64", "enableBase64");
    switchClick("reportSelfMessage", "reportSelfMessage");
    switchClick("log", "log");

    doc.getElementById("save")?.addEventListener("click",
        () => {
            const httpPortEle: HTMLInputElement = document.getElementById("httpPort") as HTMLInputElement;
            const httpHostEles: HTMLCollectionOf<HTMLInputElement> = document.getElementsByClassName("httpHost") as HTMLCollectionOf<HTMLInputElement>;
            const wsPortEle: HTMLInputElement = document.getElementById("wsPort") as HTMLInputElement;
            const wsHostEles: HTMLCollectionOf<HTMLInputElement> = document.getElementsByClassName("wsHost") as HTMLCollectionOf<HTMLInputElement>;
            const tokenEle = document.getElementById("token") as HTMLInputElement;

            // 获取端口和host
            const httpPort = httpPortEle.value
            let httpHosts: string[] = [];

            for (const hostEle of httpHostEles) {
                if (hostEle.value) {
                    httpHosts.push(hostEle.value);
                }
            }

            const wsPort = wsPortEle.value
            const token = tokenEle.value
            let wsHosts: string[] = [];

            for (const hostEle of wsHostEles) {
                if (hostEle.value) {
                    wsHosts.push(hostEle.value);
                }
            }


            config.httpPort = parseInt(httpPort);
            config.httpHosts = httpHosts;
            config.wsPort = parseInt(wsPort);
            config.wsHosts = wsHosts;
            config.token = token.trim();
            window.llonebot.setConfig(config);
            alert("保存成功");
        })


    doc.body.childNodes.forEach(node => {
        view.appendChild(node);
    });

}


export {
    onSettingWindowCreated
}
