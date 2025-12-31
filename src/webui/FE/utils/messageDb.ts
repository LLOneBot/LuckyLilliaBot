// IndexedDB 消息缓存
import type { RawMessage } from '../types/webqq'

const DB_NAME = 'webqq-messages'
const DB_VERSION = 1
const STORE_NAME = 'messages'

// 每个会话最多缓存消息数
const CACHE_MAX_MESSAGES = 100

let db: IDBDatabase | null = null

// 初始化数据库
function openDb(): Promise<IDBDatabase> {
  if (db) return Promise.resolve(db)
  
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    
    request.onerror = () => reject(request.error)
    
    request.onsuccess = () => {
      db = request.result
      resolve(db)
    }
    
    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'chatKey' })
      }
    }
  })
}

// 获取缓存的消息
export async function getCachedMessages(chatType: number, peerId: string): Promise<RawMessage[] | null> {
  try {
    const database = await openDb()
    const chatKey = `${chatType}_${peerId}`
    
    return new Promise((resolve) => {
      const transaction = database.transaction(STORE_NAME, 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.get(chatKey)
      
      request.onsuccess = () => {
        const result = request.result
        if (result && result.messages) {
          resolve(result.messages)
        } else {
          resolve(null)
        }
      }
      
      request.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

// 设置缓存的消息
export async function setCachedMessages(chatType: number, peerId: string, messages: RawMessage[]): Promise<void> {
  try {
    const database = await openDb()
    const chatKey = `${chatType}_${peerId}`
    const messagesToCache = messages.slice(-CACHE_MAX_MESSAGES)
    
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.put({
        chatKey,
        messages: messagesToCache,
        timestamp: Date.now()
      })
      
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  } catch (e) {
    console.error('Failed to cache messages:', e)
  }
}

// 追加消息到缓存
export async function appendCachedMessage(chatType: number, peerId: string, message: RawMessage): Promise<void> {
  try {
    const existing = await getCachedMessages(chatType, peerId)
    if (existing) {
      const messages = [...existing.slice(-(CACHE_MAX_MESSAGES - 1)), message]
      await setCachedMessages(chatType, peerId, messages)
    }
  } catch (e) {
    console.error('Failed to append message:', e)
  }
}

// 从缓存中删除消息
export async function removeCachedMessage(chatType: number, peerId: string, msgId: string): Promise<void> {
  try {
    const existing = await getCachedMessages(chatType, peerId)
    if (existing) {
      const messages = existing.filter(m => m.msgId !== msgId)
      await setCachedMessages(chatType, peerId, messages)
    }
  } catch (e) {
    console.error('Failed to remove message:', e)
  }
}

// 更新消息的表情回应
export async function updateCachedMessageEmojiReaction(
  chatType: number, 
  peerId: string, 
  msgSeq: string, 
  emojiId: string, 
  isAdd: boolean
): Promise<void> {
  try {
    const existing = await getCachedMessages(chatType, peerId)
    if (!existing) return
    
    const messages = existing.map(m => {
      if (m.msgSeq !== msgSeq) return m
      const existingList = m.emojiLikesList || []
      
      if (isAdd) {
        const existingIndex = existingList.findIndex(e => e.emojiId === emojiId)
        if (existingIndex >= 0) {
          const newList = [...existingList]
          newList[existingIndex] = {
            ...newList[existingIndex],
            likesCnt: String(parseInt(newList[existingIndex].likesCnt) + 1)
          }
          return { ...m, emojiLikesList: newList }
        } else {
          return {
            ...m,
            emojiLikesList: [...existingList, { emojiId, emojiType: parseInt(emojiId) > 999 ? '2' : '1', likesCnt: '1', isClicked: false }]
          }
        }
      } else {
        const existingIndex = existingList.findIndex(e => e.emojiId === emojiId)
        if (existingIndex >= 0) {
          const newList = [...existingList]
          const newCount = parseInt(newList[existingIndex].likesCnt) - 1
          if (newCount <= 0) {
            newList.splice(existingIndex, 1)
          } else {
            newList[existingIndex] = { ...newList[existingIndex], likesCnt: String(newCount) }
          }
          return { ...m, emojiLikesList: newList }
        }
      }
      return m
    })
    
    await setCachedMessages(chatType, peerId, messages)
  } catch (e) {
    console.error('Failed to update emoji reaction:', e)
  }
}

// 标记消息为已撤回
export async function markCachedMessageAsRecalled(
  chatType: number, 
  peerId: string, 
  msgId: string,
  msgSeq: string
): Promise<boolean> {
  try {
    const existing = await getCachedMessages(chatType, peerId)
    if (!existing) return false
    
    let found = false
    const messages = existing.map(m => {
      // 优先用 msgId 匹配，如果没有则用 msgSeq
      if (m.msgId === msgId || (msgSeq && m.msgSeq === msgSeq)) {
        found = true
        return { ...m, recallTime: String(Math.floor(Date.now() / 1000)) }
      }
      return m
    })
    
    if (found) {
      await setCachedMessages(chatType, peerId, messages)
    }
    return found
  } catch (e) {
    console.error('Failed to mark message as recalled:', e)
    return false
  }
}

// 清除所有缓存
export async function clearAllMessages(): Promise<void> {
  try {
    const database = await openDb()
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.clear()
      
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  } catch (e) {
    console.error('Failed to clear messages:', e)
  }
}
