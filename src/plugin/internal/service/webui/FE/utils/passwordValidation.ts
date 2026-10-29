// 密码要放进 HTTP header

export interface PasswordValidationResult {
  isValid: boolean;
  error?: string;
}

export function validatePassword(password: string, minLength?: number): PasswordValidationResult {
  const trimmedPassword = password.trim();

  if (!trimmedPassword) {
    return { isValid: false, error: '密码不能为空' };
  }

  if (minLength !== undefined && trimmedPassword.length < minLength) {
    return { isValid: false, error: `密码长度不能少于${minLength}位` };
  }

  // 防 header 注入
  if (/[\r\n]/.test(trimmedPassword)) {
    return { isValid: false, error: '密码不能包含换行符！' };
  }

  if (/[^\x20-\x7E\t]/.test(trimmedPassword)) {
    return { isValid: false, error: '密码不能包含中文等特殊字符！' };
  }

  if (/[\x00-\x08\x0A-\x1F\x7F]/.test(trimmedPassword)) {
    return { isValid: false, error: '密码包含不可见的控制字符！' };
  }

  return { isValid: true };
}
