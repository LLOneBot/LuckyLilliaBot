import * as path from "path";
import {json} from "express";

const fs = require('fs');

export const CONFIG_DIR = global.LiteLoader.plugins["LLOneBot"].path.data;
export function log(msg: any) {
    let currentDateTime = new Date().toLocaleString();
    const date = new Date();
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const currentDate = `${year}-${month}-${day}`;
    fs.appendFile(path.join(CONFIG_DIR , `llonebot-${currentDate}.log`), currentDateTime + ":" + JSON.stringify(msg) + "\n", (err: any) => {

    })
}

export function isGIF(path: string) {
    const buffer = Buffer.alloc(4);
    const fd = fs.openSync(path, 'r');
    fs.readSync(fd, buffer, 0, 4, 0);
    fs.closeSync(fd);
    return buffer.toString() === 'GIF8'
}

