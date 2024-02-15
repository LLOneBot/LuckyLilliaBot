import { Config } from "./types";

const fs = require("fs")

export class ConfigUtil {
    configPath: string;

    constructor(configPath: string) {
        this.configPath = configPath;
    }

    getConfig(): Config {
        if (!fs.existsSync(this.configPath)) {
            return {port: 3000, hosts: ["http://192.168.1.2:5000/"], wsPort: 3001}
        } else {
            const data = fs.readFileSync(this.configPath, "utf-8");
            let jsonData = JSON.parse(data);
            if (!jsonData.hosts) {
                jsonData.hosts = []
            }
            if (!jsonData.wsPort){
                jsonData.wsPort = 3001
            }
            return jsonData;
        }
    }

    setConfig(config: Config) {
        fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), "utf-8")
    }
}
