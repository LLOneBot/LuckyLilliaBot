import path from "path";

type QQPkgInfo = {
    version: string;
    buildVersion: string;
    platform: string;
    eleArch: string;
}

export const qqPkgInfo: QQPkgInfo = require(path.join(process.resourcesPath, "app/package.json"))
