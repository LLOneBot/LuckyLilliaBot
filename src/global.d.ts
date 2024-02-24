import {LLOneBot} from "./preload";



declare global {
    interface Window {
        llonebot: typeof llonebot;
        LiteLoader: any;
    }

    interface Event {
        detail?: {
            name: string;
            value: string;
        }
    }
}