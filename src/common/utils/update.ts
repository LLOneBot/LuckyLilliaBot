import { version } from "../../version";
import https from "node:https";
//import http from "node:http";
import * as path from "node:path";
import * as fs from "node:fs";
import { PLUGIN_DIR, TEMP_DIR } from ".";
import compressing from "compressing";
export async function checkVersion() {
    const latestVersionText = await getRemoteVersion();
    const latestVersion = latestVersionText.split(".");
    const currentVersion = version.split(".");
    for (let k in [0, 1, 2]) {
        if (latestVersion[k] > currentVersion[k]) {
            return { result: false, version: latestVersionText };
        }
    }
    return { result: true, version: version };
}
export async function updateLLOneBot() {
    let mirrorGithubList = ["https://mirror.ghproxy.com/"];
    const latestVersion = await getRemoteVersion();
    if (latestVersion && latestVersion != "") {
        const downloadUrl = "https://github.com/LLOneBot/LLOneBot/releases/download/v" + latestVersion + "/LLOneBot.zip";
        const realUrl = mirrorGithubList[0] + downloadUrl;
        const filePath = path.join(TEMP_DIR, "./update-" + latestVersion + ".zip");
        const fileStream = fs.createWriteStream(filePath);
        let downloadPromise = async function (filePath): Promise<boolean> {
            return new Promise((resolve, reject) => {
                https.get(filePath, res => {
                    res.pipe(fileStream);
                    res.on('end', () => {
                        resolve(true);
                    });
                }).on('error', err => {
                    resolve(false);
                });
            });
        }
        if (!(await downloadPromise(realUrl))) {
            // 下载异常
            return false;
        }
        let uncompressPromise = async function () {
            return new Promise<boolean>((resolve, reject) => {
                compressing.zip.uncompress(filePath, PLUGIN_DIR).then(() => {
                    resolve(true);
                }).catch((reason: any) => {
                    console.log(reason);
                    if (reason?.errno == -4082) {
                        resolve(true);
                    }
                    resolve(false);
                });
            });
        }
        const uncompressResult = await uncompressPromise();
        return uncompressResult;
    }
    return false;
}
export async function getRemoteVersion() {
    let mirrorGithubList = ["https://521github.com"];
    let Version = "";
    for (let i = 0; i < mirrorGithubList.length; i++) {
        let mirrorGithub = mirrorGithubList[i];
        let tVersion = await getRemoteVersionByMirror(mirrorGithub);
        if (tVersion && tVersion != "") {
            Version = tVersion;
            break;
        }
    }
    return Version;
}
export async function getRemoteVersionByMirror(mirrorGithub: string) {
    let releasePage = "error";
    let reqPromise = async function (): Promise<string> {
        return new Promise((resolve, reject) => {
            https.get(mirrorGithub + "/LLOneBot/LLOneBot/releases", res => {
                let list = [];
                res.on('data', chunk => {
                    list.push(chunk);
                });
                res.on('end', () => {
                    resolve(Buffer.concat(list).toString());
                });
            }).on('error', err => {
                reject();
            });
        });
    }
    try {
        releasePage = await reqPromise();
        if (releasePage === "error") return "";
        return releasePage.match(new RegExp('(?<=(tag/v)).*?(?=("))'))[0];
    }
    catch { }
    return "";

}