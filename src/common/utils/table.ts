export class LimitedHashTable<K, V> {
    private keyToValue: Map<K, V> = new Map()
    private valueToKey: Map<V, K> = new Map()
    private maxSize: number

    constructor(maxSize: number) {
        this.maxSize = maxSize
    }

    resize(count: number) {
        this.maxSize = count
    }

    set(key: K, value: V): void {
        this.keyToValue.set(key, value)
        this.valueToKey.set(value, key)
        while (this.keyToValue.size !== this.valueToKey.size) {
            console.log('keyToValue.size !== valueToKey.size Error Atom')
            this.keyToValue.clear()
            this.valueToKey.clear()
        }
        while (this.keyToValue.size > this.maxSize || this.valueToKey.size > this.maxSize) {
            const oldestKey = this.keyToValue.keys().next().value
            this.valueToKey.delete(this.keyToValue.get(oldestKey)!)
            this.keyToValue.delete(oldestKey)
        }
    }

    getValue(key: K): V | undefined {
        return this.keyToValue.get(key)
    }

    getKey(value: V): K | undefined {
        return this.valueToKey.get(value)
    }

    deleteByValue(value: V): void {
        const key = this.valueToKey.get(value)
        if (key !== undefined) {
            this.keyToValue.delete(key)
            this.valueToKey.delete(value)
        }
    }

    deleteByKey(key: K): void {
        const value = this.keyToValue.get(key)
        if (value !== undefined) {
            this.keyToValue.delete(key)
            this.valueToKey.delete(value)
        }
    }

    getKeyList(): K[] {
        return Array.from(this.keyToValue.keys())
    }

    //获取最近刚写入的几个值
    getHeads(size: number): { key: K; value: V }[] | undefined {
        const keyList = this.getKeyList()
        if (keyList.length === 0) {
            return undefined
        }
        const result: { key: K; value: V }[] = []
        const listSize = Math.min(size, keyList.length)
        for (let i = 0; i < listSize; i++) {
            const key = keyList[listSize - i]
            result.push({ key, value: this.keyToValue.get(key)! })
        }
        return result
    }
}