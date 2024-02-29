import {LLOneBot} from "./preload";



declare global {
    interface Window {
        llonebot: LLOneBot;
        LiteLoader: any;
    }
}