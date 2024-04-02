import {log} from "../../../common/utils";
import {NTQQApi} from "../../ntcall";

type PokeHandler = (id: string, isGroup: boolean) => void
type CrychicHandler = (event: string, id: string, isGroup: boolean) => void

let pokeRecords: Record<string, number> = {}

class Crychic{
    private crychic: any = undefined

    loadNode(){
        if (!this.crychic){
            try {
                this.crychic = require("./crychic-win32-x64.node")
                this.crychic.init()
            }catch (e) {
                log("crychic加载失败", e)
            }

        }
    }
    registerPokeHandler(fn: PokeHandler){
        this.registerHandler((event, id, isGroup)=>{
            if (event === "poke"){
                let existTime = pokeRecords[id]
                if (existTime) {
                    if (Date.now() - existTime < 1500) {
                        return
                    }
                }
                pokeRecords[id] = Date.now()
                fn(id, isGroup);
            }
        })
    }
    registerHandler(fn: CrychicHandler){
        if (!this.crychic) return;
        this.crychic.setCryHandler(fn)
    }
    sendFriendPoke(friendUid: string){
        if (!this.crychic) return;
        this.crychic.sendFriendPoke(parseInt(friendUid))
        NTQQApi.fetchUnitedCommendConfig().then()
    }
    sendGroupPoke(groupCode: string, memberUin: string){
        if (!this.crychic) return;
        this.crychic.sendGroupPoke(parseInt(memberUin), parseInt(groupCode))
        NTQQApi.fetchUnitedCommendConfig().then()
    }
}

export const crychic = new Crychic()