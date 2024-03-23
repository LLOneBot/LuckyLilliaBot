import uvicorn
from fastapi import FastAPI, Request

app = FastAPI()

@app.post("/")
async def root(request: Request):
    data = await request.json()
    print(data)
    if (data["post_type"] == "message"):
        text = list(filter(lambda x: x["type"] == "text", data["message"]))[0]["data"]["text"]
        if text == "禁言":
            return {"ban": True, "ban_duration": 10}
        elif text == "踢我":
            return {"kick": True}
        elif text == "撤回":
            return {"delete": True}
#         print(data["message"])
        return {"reply": "Hello World"}
    elif data["post_type"] == "request":
        if data["request_type"] == "group":
            return {"approve": False, "reason": "不让你进群"}
        else:
            # 加好友
            return {"approve": True}
    return {}

if __name__ == "__main__":
    uvicorn.run(app, host="", port=8000)