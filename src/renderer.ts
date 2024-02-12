/// <reference path="./global.d.ts" />


// 打开设置界面时触发
async function onSettingWindowCreated(view: Element) {
    window.llonebot.log("setting window created");
    let config = await window.llonebot.getConfig()

    function creatHostEleStr(host: string) {
        let eleStr = `
            <setting-item data-direction="row" class="hostItem vertical-list-item">
                <h2>事件上报地址(http)</h2>
                <input class="host input-text" type="text" value="${host}" 
                style="width:60%;padding: 5px"
                placeholder="如果localhost上报失败试试局域网ip"/>
            </setting-item>

            `
        return eleStr
    }

    let hostsEleStr = ""
    for (const host of config.hosts) {
        hostsEleStr += creatHostEleStr(host);
    }
    let html = `
    <div class="config_view llonebot">
        <setting-section>
            <setting-panel>
                <setting-list class="wrap">
                    <setting-item class="vertical-list-item" data-direction="row">
                        <setting-text>监听端口</setting-text>
                        <input id="port" type="number" value="${config.port}"/>
                    </setting-item>
                    <div>
                        <button id="addHost" class="q-button">添加上报地址</button>
                    </div>
                    <div id="hostItems">
                        ${hostsEleStr}
                    </div>
                    <button id="save" class="q-button">保存(监听端口重启QQ后生效)</button>
                </setting-list>
            </setting-panel>
            <setting-panel>
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


    function addHostEle(initValue: string = "") {
        let addressDoc = parser.parseFromString(creatHostEleStr(initValue), "text/html");
        let addressEle = addressDoc.querySelector("setting-item")
        let hostItemsEle = document.getElementById("hostItems");
        hostItemsEle.appendChild(addressEle);
    }


    doc.getElementById("addHost").addEventListener("click", () => addHostEle())

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

    switchClick("debug", "debug");
    switchClick("switchBase64", "enableBase64");
    switchClick("reportSelfMessage", "reportSelfMessage");
    switchClick("log", "log");

    doc.getElementById("save")?.addEventListener("click",
        () => {
            const portEle: HTMLInputElement = document.getElementById("port") as HTMLInputElement
            const hostEles: HTMLCollectionOf<HTMLInputElement> = document.getElementsByClassName("host") as HTMLCollectionOf<HTMLInputElement>;
            // const port = doc.querySelector("input[type=number]")?.value
            // const host = doc.querySelector("input[type=text]")?.value
            // 获取端口和host
            const port = portEle.value
            let hosts: string[] = [];
            for (const hostEle of hostEles) {
                if (hostEle.value) {
                    hosts.push(hostEle.value);
                }
            }
            config.port = parseInt(port);
            config.hosts = hosts;
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
