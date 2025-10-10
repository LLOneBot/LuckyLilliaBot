/**
 * 密码验证工具
 * 确保密码符合 HTTP header 安全要求
 */

export interface PasswordValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * 验证密码是否符合要求
 * @param password 要验证的密码
 * @param minLength 最小长度（可选，默认不检查）
 * @returns 验证结果
 */
export function validatePassword(password: string, minLength?: number): PasswordValidationResult {
  const trimmedPassword = password.trim();

  // 检查是否为空
  if (!trimmedPassword) {
    return { isValid: false, error: '密码不能为空' };
  }

  // 检查最小长度
  if (minLength !== undefined && trimmedPassword.length < minLength) {
    return { isValid: false, error: `密码长度不能少于${minLength}位` };
  }

  // 检查换行符（防止 HTTP header injection）
  if (/[\r\n]/.test(trimmedPassword)) {
    return { isValid: false, error: '密码不能包含换行符！' };
  }

  // 检查非 ASCII 字符（中文、emoji 等）
  if (/[^\x20-\x7E\t]/.test(trimmedPassword)) {
    return { isValid: false, error: '密码不能包含中文等特殊字符！' };
  }

  // 检查控制字符（除了 \t）
  if (/[\x00-\x08\x0A-\x1F\x7F]/.test(trimmedPassword)) {
    return { isValid: false, error: '密码包含不可见的控制字符！' };
  }

  return { isValid: true };
}
