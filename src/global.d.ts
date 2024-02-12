import { Config } from "./common/types";


declare var llonebot: {
    log(data: any): void,
    setConfig(config: Config):void;
    getConfig():Promise<Config>;
};

declare global {
    interface Window {
        llonebot: typeof llonebot;
        LiteLoader: any;
    }
}