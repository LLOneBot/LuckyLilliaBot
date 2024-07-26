import { PostEventType } from "./post-ob11-event"


interface HttpEventType {
    seq: number
    event: PostEventType
}

interface HttpUserType {
    lastAccessTime: number
    userSeq: number
}

let curentSeq:number = 0;
let eventList:HttpEventType[] = [];
let httpUser:Record<string,HttpUserType> = {};


export function postHttpEvent(event: PostEventType) {
    curentSeq += 1;
    eventList.push({
        seq: curentSeq,
        event: event
    });
    while(eventList.length > 100) {
        eventList.shift();
    }
}


export async function getHttpEvent(userKey:string,timeout = 0) {
    let toRetEvent = [];

    // 清除过时的user，5分钟没访问过的user将被删除
    let now = Date.now();
    for(let key in httpUser) {
        let user = httpUser[key];
        if(now - user.lastAccessTime > 1000 * 60 * 5) {
            delete httpUser[key];
        }
    }

    // 增加新的user
    if(!httpUser[userKey] ) {
        httpUser[userKey] = {
            lastAccessTime: now,
            userSeq: curentSeq
        }
    }

    let user = httpUser[userKey];
    // 等待数据到来，暂时先这么写吧......
    while(curentSeq == user.userSeq && Date.now() - now < timeout) {
        await new Promise( resolve => setTimeout(resolve, 10) );
    }
    // 取数据
    for(let i = 0; i < eventList.length; i++) {
        let evt = eventList[i];
        if(evt.seq > user.userSeq) {
            toRetEvent.push(evt.event);
        }
    }

    // 更新user数据
    user.lastAccessTime = Date.now();
    user.userSeq = curentSeq;
    return toRetEvent;
}
