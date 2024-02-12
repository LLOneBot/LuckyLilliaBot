export type BaseCheckResult = ValidCheckResult | InvalidCheckResult

export interface ValidCheckResult {
    valid: true
    [k: string | number]: any
}

export interface InvalidCheckResult {
    valid: false
    message: string
    [k: string | number]: any
}
