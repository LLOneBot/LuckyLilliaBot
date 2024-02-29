/// <reference path="./global.d.ts" />


// 打开设置界面时触发

async function onSettingWindowCreated(view: Element) {
    window.llonebot.log("setting window created");
    const isEmpty = (value: any) => value === undefined || value === null || value === '';
    let config = await window.llonebot.getConfig()
    const httpClass = "http";
    const httpPostClass = "http-post";
    const wsClass = "ws";
    const reverseWSClass = "reverse-ws";
    const llonebotError = await window.llonebot.getError();
    window.llonebot.log("获取error" + JSON.stringify(llonebotError));
    function createHttpHostEleStr(host: string) {
        let eleStr = `
            <setting-item data-direction="row" class="hostItem vertical-list-item ${httpPostClass}">
                <h2>HTTP事件上报地址(http)</h2>
                <input class="httpHost input-text" type="text" value="${host}" 
                style="width:60%;padding: 5px"
                placeholder="如:http://127.0.0.1:8080/onebot/v11/http"/>
            </setting-item>
            `
        return eleStr
    }

    function createWsHostEleStr(host: string) {
        let eleStr = `
            <setting-item data-direction="row" class="hostItem vertical-list-item ${reverseWSClass}">
                <h2>反向websocket地址:</h2>
                <input class="wsHost input-text" type="text" value="${host}" 
                style="width:60%;padding: 5px"
                placeholder="如: ws://127.0.0.1:5410/onebot"/>
            </setting-item>
            `
        return eleStr
    }

    let httpHostsEleStr = ""
    for (const host of config.ob11.httpHosts) {
        httpHostsEleStr += createHttpHostEleStr(host);
    }

    let wsHostsEleStr = ""
    for (const host of config.ob11.wsHosts) {
        wsHostsEleStr += createWsHostEleStr(host);
    }

    let html = `
    <div class="config_view llonebot">
        <setting-section>
            <setting-panel id="llonebotError" style="display:${llonebotError.ffmpegError || llonebotError.otherError ? '' : 'none'}">
                <setting-item id="ffmpegError" data-direction="row" 
                    style="diplay:${llonebotError.ffmpegError ? '' : 'none'}"
                    class="hostItem vertical-list-item">
                    <setting-text data-type="secondary" class="err-content">${llonebotError.ffmpegError}</setting-text>
                </setting-item>
                <setting-item id="otherError" data-direction="row" 
                    style="diplay:${llonebotError.otherError ? '' : 'none'}"
                    class="hostItem vertical-list-item">
                    <setting-text data-type="secondary" class="err-content">${llonebotError.otherError}</setting-text>
                </setting-item>
            </setting-panel>
            <setting-panel>
                <setting-list class="wrap">
                    <setting-item data-direction="row" class="hostItem vertical-list-item">
                        <div>
                            <div>启用HTTP服务</div>
                        </div>
                        <setting-switch id="http" ${config.ob11.enableHttp ? "is-active" : ""}></setting-switch>
                    </setting-item>
                    <setting-item class="vertical-list-item ${httpClass}" data-direction="row" style="display: ${config.ob11.enableHttp ? '' : 'none'}">
                        <setting-text>HTTP监听端口</setting-text>
                        <input id="httpPort" type="number" value="${config.ob11.httpPort}"/>
                    </setting-item>
                    <setting-item data-direction="row" class="hostItem vertical-list-item">
                        <div>
                            <div>启用HTTP事件上报</div>
                        </div>
                        <setting-switch id="httpPost" ${config.ob11.enableHttpPost ? "is-active" : ""}></setting-switch>
                    </setting-item>
                    <div class="${httpPostClass}" style="display: ${config.ob11.enableHttpPost ? '' : 'none'}">
                        <div >
                            <button id="addHttpHost" class="q-button">添加HTTP POST上报地址</button>
                        </div>
                        <div id="httpHostItems">
                            ${httpHostsEleStr}
                        </div>
                    </div>
                    <setting-item data-direction="row" class="hostItem vertical-list-item">
                        <div>
                            <div>启用正向Websocket协议</div>
                        </div>
                        <setting-switch id="websocket" ${config.ob11.enableWs ? "is-active" : ""}></setting-switch>
                    </setting-item>
                    <setting-item class="vertical-list-item ${wsClass}" data-direction="row" style="display: ${config.ob11.enableWs ? '' : 'none'}">
                        <setting-text>正向Websocket监听端口</setting-text>
                        <input id="wsPort" type="number" value="${config.ob11.wsPort}"/>
                    </setting-item>
                    
                    <setting-item data-direction="row" class="hostItem vertical-list-item">
                        <div>
                            <div>启用反向Websocket协议</div>
                        </div>
                        <setting-switch id="websocketReverse" ${config.ob11.enableWsReverse ? "is-active" : ""}></setting-switch>
                    </setting-item>
                    <div class="${reverseWSClass}" style="display: ${config.ob11.enableWsReverse ? '' : 'none'}">
                        <div>
                            <button id="addWsHost" class="q-button">添加反向Websocket地址</button>
                        </div>
                        <div id="wsHostItems">
                            ${wsHostsEleStr}
                        </div>
                    </div>
                    <setting-item class="vertical-list-item" data-direction="row">
                        <setting-text>Access Token</setting-text>
                        <input id="token" type="text" placeholder="可为空" value="${config.token}"/>
                    </setting-item>
                    <setting-item data-direction="row" class="vertical-list-item">
                        <setting-item data-direction="row" class="vertical-list-item" style="width: 80%">
                            <setting-text>ffmpeg路径</setting-text>
                            <input id="ffmpegPath" class="input-text" type="text" 
                                style="width:80%;padding: 5px"
                                value="${config.ffmpeg || ''}"/>
                        </setting-item>
                        <button id="selectFFMPEG" class="q-button q-button--small q-button--secondary">选择ffmpeg</button>
                    </setting-item>
                    <button id="save" class="q-button">保存</button>
                </setting-list>
            </setting-panel>
            <setting-panel>

                <setting-item data-direction="row" class="vertical-list-item">
                    <div>
                        <setting-text>消息上报数据类型</setting-text>
                        <setting-text data-type="secondary">如客户端无特殊需求推荐保持默认设置，两者的详细差异可参考 <a href="javascript:LiteLoader.api.openExternal('https://github.com/botuniverse/onebot-11/tree/master/message#readme');">OneBot v11 文档</a></setting-text>
                    </div>
                    <setting-select id="messagePostFormat">
                        <setting-option data-value="array" ${config.ob11.messagePostFormat !== "string" ? "is-selected" : ""}>消息段</setting-option>
                        <setting-option data-value="string" ${config.ob11.messagePostFormat === "string" ? "is-selected" : ""}>CQ码</setting-option>
                    </setting-select>
                </setting-item>
                <setting-item data-direction="row" class="vertical-list-item">
                    <div>
                        <div>上报文件不采用本地路径</div>
                        <div class="tips">开启后，上报文件(图片语音等)为http链接或base64编码</div>
                    </div>
                    <setting-switch id="switchFileUrl" ${config.enableLocalFile2Url ? "is-active" : ""}></setting-switch>
                </setting-item>
                <setting-item data-direction="row" class="vertical-list-item">
                    <div>
                        <div>debug模式</div>
                        <div class="tips">开启后上报消息添加raw字段附带原始消息</div>
                    </div>
                    <setting-switch id="debug" ${config.debug ? "is-active" : ""}></setting-switch>
                </setting-item>
                <setting-item data-direction="row" class="vertical-list-item">
                    <div>
                        <div>上报自身消息</div>
                        <div class="tips">慎用，不然会自己和自己聊个不停</div>
                    </div>
                    <setting-switch id="reportSelfMessage" ${config.reportSelfMessage ? "is-active" : ""}></setting-switch>
                </setting-item>
                <setting-item data-direction="row" class="vertical-list-item">
                    <div>
                        <div>日志</div>
                        <div class="tips">目录:${window.LiteLoader.plugins["LLOneBot"].path.data}</div>
                    </div>
                    <setting-switch id="log" ${config.log ? "is-active" : ""}></setting-switch>
                </setting-item>
                <setting-item data-direction="row" class="vertical-list-item">
                    <div>
                        <div>自动删除收到的文件</div>
                        <div class="tips">一分钟后会删除收到的图片语音</div>
                    </div>
                    <setting-switch id="autoDeleteFile" ${config.autoDeleteFile ? "is-active" : ""}></setting-switch>
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

    const getError = async ()=> {
        const llonebotError = await window.llonebot.getError();
        console.log(llonebotError);
        const llonebotErrorEle = document.getElementById("llonebotError");
        const ffmpegErrorEle = document.getElementById("ffmpegError");
        const otherErrorEle = document.getElementById("otherError");
        if (llonebotError.otherError || llonebotError.ffmpegError){
            llonebotErrorEle.style.display = ''
        }
        else{
            llonebotErrorEle.style.display = 'none'
        }
        if (llonebotError.ffmpegError) {
            const errContentEle = doc.querySelector("#ffmpegError .err-content")
            // const errContent = ffmpegErrorEle.getElementsByClassName("err-content")[0];
            errContentEle.textContent = llonebotError.ffmpegError;
            (ffmpegErrorEle as HTMLElement).style.display = ''
        }
        else{
            ffmpegErrorEle.style.display = ''
        }
        if (llonebotError.otherError) {
            const errContentEle = doc.querySelector("#otherError .err-content")
            errContentEle.textContent = llonebotError.otherError;
            otherErrorEle.style.display = ''
        }
        else{
            otherErrorEle.style.display = 'none'
        }
    }

    function addHostEle(type: string, initValue: string = "") {
        let addressEle, hostItemsEle;
        if (type === "ws") {
            let addressDoc = parser.parseFromString(createWsHostEleStr(initValue), "text/html");
            addressEle = addressDoc.querySelector("setting-item")
            hostItemsEle = document.getElementById("wsHostItems");
        } else {
            let addressDoc = parser.parseFromString(createHttpHostEleStr(initValue), "text/html");
            addressEle = addressDoc.querySelector("setting-item")
            hostItemsEle = document.getElementById("httpHostItems");
        }

        hostItemsEle.appendChild(addressEle);
    }


    doc.getElementById("addHttpHost").addEventListener("click", () => addHostEle("http"))
    doc.getElementById("addWsHost").addEventListener("click", () => addHostEle("ws"))
    doc.getElementById("messagePostFormat").addEventListener("selected", (e: CustomEvent) => {
        config.ob11.messagePostFormat = e.detail && !isEmpty(e.detail.value) ? e.detail.value : 'array';
        window.llonebot.setConfig(config);
    })

    function switchClick(eleId: string, configKey: string, _config = null) {
        if (!_config) {
            _config = config
        }
        doc.getElementById(eleId)?.addEventListener("click", (e) => {
            const switchEle = e.target as HTMLInputElement
            if (_config[configKey]) {
                _config[configKey] = false
                switchEle.removeAttribute("is-active")
            } else {
                _config[configKey] = true
                switchEle.setAttribute("is-active", "")
            }
            // 妈蛋，手动操作DOM越写越麻烦，要不用vue算了
            const keyClassMap = {
                "enableHttp": httpClass,
                "enableHttpPost": httpPostClass,
                "enableWs": wsClass,
                "enableWsReverse": reverseWSClass,
            }
            for (let e of document.getElementsByClassName(keyClassMap[configKey])) {
                e["style"].display = _config[configKey] ? "" : "none"
            }

            window.llonebot.setConfig(config)
        })
    }

    switchClick("http", "enableHttp", config.ob11);
    switchClick("httpPost", "enableHttpPost", config.ob11);
    switchClick("websocket", "enableWs", config.ob11);
    switchClick("websocketReverse", "enableWsReverse", config.ob11);
    switchClick("debug", "debug");
    switchClick("switchFileUrl", "enableLocalFile2Url");
    switchClick("reportSelfMessage", "reportSelfMessage");
    switchClick("log", "log");
    switchClick("autoDeleteFile", "autoDeleteFile");

    doc.getElementById("save")?.addEventListener("click",
        () => {
            const httpPortEle: HTMLInputElement = document.getElementById("httpPort") as HTMLInputElement;
            const httpHostEles: HTMLCollectionOf<HTMLInputElement> = document.getElementsByClassName("httpHost") as HTMLCollectionOf<HTMLInputElement>;
            const wsPortEle: HTMLInputElement = document.getElementById("wsPort") as HTMLInputElement;
            const wsHostEles: HTMLCollectionOf<HTMLInputElement> = document.getElementsByClassName("wsHost") as HTMLCollectionOf<HTMLInputElement>;
            const tokenEle = document.getElementById("token") as HTMLInputElement;
            const ffmpegPathEle = document.getElementById("ffmpegPath") as HTMLInputElement;

            // 获取端口和host
            const httpPort = httpPortEle.value
            let httpHosts: string[] = [];

            for (const hostEle of httpHostEles) {
                const value = hostEle.value.trim();
                value && httpHosts.push(value);
            }

            const wsPort = wsPortEle.value;
            const token = tokenEle.value.trim();
            let wsHosts: string[] = [];

            for (const hostEle of wsHostEles) {
                const value = hostEle.value.trim();
                value && wsHosts.push(value);
            }

            config.ob11.httpPort = parseInt(httpPort);
            config.ob11.httpHosts = httpHosts;
            config.ob11.wsPort = parseInt(wsPort);
            config.ob11.wsHosts = wsHosts;
            config.token = token;
            config.ffmpeg = ffmpegPathEle.value.trim();
            window.llonebot.setConfig(config);
            setTimeout(()=>{
                getError().then();
            }, 1000);
            alert("保存成功");
        })

    doc.getElementById("selectFFMPEG")?.addEventListener("click", ()=>{
        window.llonebot.selectFile().then(selectPath=>{
            if (selectPath){
                config.ffmpeg = (document.getElementById("ffmpegPath") as HTMLInputElement).value = selectPath;
                // window.llonebot.setConfig(config);
            }
        });
    })

    doc.body.childNodes.forEach(node => {
        view.appendChild(node);
    });
}


function init() {
    let hash = location.hash;
    if (hash === "#/blank") {
        return;
    }
}


if (location.hash === "#/blank") {
    (window as any).navigation.addEventListener("navigatesuccess", init, {once: true});
} else {
    init();
}


export {
    onSettingWindowCreated
}
