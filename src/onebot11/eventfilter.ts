import { OB11BaseEvent } from './event/OB11BaseEvent'

const NUMERIC_INDEX_REGEX = /^\d+$/

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNumericIndex(str: string): boolean {
  return NUMERIC_INDEX_REGEX.test(str)
}

function getValueByPath(event: unknown, path: string): unknown {
  let current = event
  for (const segment of path.split('.')) {
    if (current === undefined || current === null) {
      return undefined
    }
    if (Array.isArray(current) && isNumericIndex(segment)) {
      current = current[Number(segment)]
      continue
    }
    if (isPlainObject(current)) {
      current = current[segment]
      continue
    }
    return undefined
  }
  return current
}

function isOperatorKey(key: string): boolean {
  return key.startsWith('.')
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true
  }
  if (typeof left !== typeof right) {
    return false
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return false
    return left.every((item, index) => deepEqual(item, right[index]))
  }
  if (isPlainObject(left) && isPlainObject(right)) {
    const leftKeys = Object.keys(left)
    const rightKeys = Object.keys(right)
    if (leftKeys.length !== rightKeys.length) return false
    return leftKeys.every(key => deepEqual(left[key], right[key]))
  }
  return false
}

function allOperatorKeys(obj: unknown): boolean {
  if (!isPlainObject(obj)) return false
  return Object.keys(obj).every(key => isOperatorKey(key))
}

function matchOperator(operator: string, value: unknown, event: unknown): boolean {
  switch (operator) {
    case '.not':
      return isPlainObject(value) && !matchObjectFilter(value, event)
    case '.and':
      if (!isPlainObject(value)) return false
      if (allOperatorKeys(value)) {
        // All parameters are operators - can apply to any event type
        return matchObjectFilter(value, event)
      }
      // Mixed operators and field keys - event must be an object
      return isPlainObject(event) && matchObjectFilter(value, event)
    case '.or':
      return Array.isArray(value) && value.some(item => isPlainObject(item) && matchObjectFilter(item, event))
    case '.eq':
      return deepEqual(event, value)
    case '.neq':
      return !deepEqual(event, value)
    case '.in':
      if (typeof value === 'string') {
        return typeof event === 'string' && event.includes(value)
      }
      if (Array.isArray(value)) {
        return value.some(item => deepEqual(item, event))
      }
      return false
    case '.contains':
      return typeof value === 'string' && typeof event === 'string' && event.includes(value)
    case '.regex':
      if (typeof value !== 'string' || typeof event !== 'string') return false
      try {
        return new RegExp(value).test(event)
      } catch {
        return false
      }
    default:
      return false
  }
}

function matchObjectFilter(rule: Record<string, unknown>, event: unknown): boolean {
  for (const [key, value] of Object.entries(rule)) {
    if (isOperatorKey(key)) {
      if (!matchOperator(key, value, event)) {
        return false
      }
      continue
    }

    const actual = getValueByPath(event, key)
    if (isPlainObject(value)) {
      if (!matchObjectFilter(value, actual)) {
        return false
      }
      continue
    }

    if (!deepEqual(actual, value)) {
      return false
    }
  }

  return true
}

export function matchEventFilter(filter: unknown, event: OB11BaseEvent | Record<string, unknown>): boolean {
  if (filter === undefined || filter === null) {
    return true
  }
  if (!isPlainObject(filter)) {
    return false
  }
  return matchObjectFilter(filter, event)
}
