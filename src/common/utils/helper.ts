export function truncateString(obj: any, maxLength = 500) {
    if (obj !== null && typeof obj === 'object') {
        Object.keys(obj).forEach(key => {
            if (typeof obj[key] === 'string') {
                // 如果是字符串且超过指定长度，则截断
                if (obj[key].length > maxLength) {
                    obj[key] = obj[key].substring(0, maxLength) + '...';
                }
            } else if (typeof obj[key] === 'object') {
                // 如果是对象或数组，则递归调用
                truncateString(obj[key], maxLength);
            }
        });
    }
    return obj;
}

export function isNumeric(str: string) {
    return /^\d+$/.test(str);
}

export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 在保证老对象已有的属性不变化的情况下将新对象的属性复制到老对象
export function mergeNewProperties(newObj: any, oldObj: any) {
    Object.keys(newObj).forEach(key => {
        // 如果老对象不存在当前属性，则直接复制
        if (!oldObj.hasOwnProperty(key)) {
            oldObj[key] = newObj[key];
        } else {
            // 如果老对象和新对象的当前属性都是对象，则递归合并
            if (typeof oldObj[key] === 'object' && typeof newObj[key] === 'object') {
                mergeNewProperties(newObj[key], oldObj[key]);
            } else if (typeof oldObj[key] === 'object' || typeof newObj[key] === 'object') {
                // 属性冲突，有一方不是对象，直接覆盖
                oldObj[key] = newObj[key];
            }
        }
    });
}

export function isNull(value: any) {
    return value === undefined || value === null;
}

/**
 * 将字符串按最大长度分割并添加换行符
 * @param str 原始字符串
 * @param maxLength 每行的最大字符数
 * @returns 处理后的字符串，超过长度的地方将会换行
 */
export function wrapText(str: string, maxLength: number): string {
    // 初始化一个空字符串用于存放结果
    let result: string = '';

    // 循环遍历字符串，每次步进maxLength个字符
    for (let i = 0; i < str.length; i += maxLength) {
        // 从i开始，截取长度为maxLength的字符串段，并添加到结果字符串
        // 如果不是第一段，先添加一个换行符
        if (i > 0) result += '\n';
        result += str.substring(i, i + maxLength);
    }

    return result;
}

