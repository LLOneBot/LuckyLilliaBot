import path from "node:path";
import fs from "fs";

export * from './file'
export * from './helper'
export * from './log'
export * from './qqlevel'
export * from './qqpkg'
export * from './update'
export const DATA_DIR = global.LiteLoader.plugins["LLOneBot"].path.data;
export const TEMP_DIR = path.join(DATA_DIR, "temp");
export const PLUGIN_DIR = global.LiteLoader.plugins["LLOneBot"].path.plugin;
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR);
}