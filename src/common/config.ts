import {Config} from "./types";

const fs = require("fs");

export class ConfigUtil {
    configPath: string;

    constructor(configPath: string) {
        this.configPath = configPath;
    }

    getConfig(): Config {
        let defaultConfig: Config = {
            httpPort: 3000,
            httpHosts: [],
            wsPort: 3001,
            wsHosts: [],
            token: "",
            enableBase64: false,
            debug: false,
            log: false,
            reportSelfMessage: false
        }
        if (!fs.existsSync(this.configPath)) {
            return defaultConfig
        } else {
            const data = fs.readFileSync(this.configPath, "utf-8");
            let jsonData: Config = defaultConfig;
            try {
                jsonData = JSON.parse(data)
            }
            catch (e) {}
            if (!jsonData.httpHosts) {
                jsonData.httpHosts = []
            }
            if (!jsonData.wsHosts) {
                jsonData.wsHosts = []
            }
            if (!jsonData.wsPort) {
                jsonData.wsPort = 3001
            }
            if (!jsonData.httpPort) {
                jsonData.httpPort = 3000
            }
            if (!jsonData.token) {
                jsonData.token = ""
            }
            return jsonData;
        }
    }
  
    setConfig(config: Config) {
        fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), "utf-8")
    }
}
