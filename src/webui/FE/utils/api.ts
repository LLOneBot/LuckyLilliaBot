import { ApiResponse } from '../types';
import { showToast } from '../components/common';
import { hashPassword } from './passwordHash';
import { getCookie, setCookie } from './cookie';

const TOKEN_KEY = 'webui_token';
const TOKEN_EXPIRY_DAYS = 30; // Cookie 过期天数

let passwordPromptHandler: ((tip: string) => Promise<string>) | null = null;

export function setPasswordPromptHandler(handler: (tip: string) => Promise<string>) {
  passwordPromptHandler = handler;
}

export function getToken(): string | null {
  return getCookie(TOKEN_KEY);
}

export function setTokenStorage(token: string) {
  setCookie(TOKEN_KEY, token, TOKEN_EXPIRY_DAYS);
}

export async function apiFetch<T = any>(
  url: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const makeRequest = async (authToken: string | null): Promise<Response> => {
    const headers: HeadersInit = {
      ...options.headers,
    };

    // 使用后端期望的 x-webui-token 请求头
    if (authToken) {
      headers['x-webui-token'] = authToken;
    }

    return fetch(url, {
      ...options,
      headers,
    });
  };

  try {
    let response = await makeRequest(getToken());

    // 401: 未设置密码，需要调用 set-token 设置
    if (response.status === 401 && passwordPromptHandler) {
      console.log('401 - Password not set, prompting to set password...');

      const newPassword = await passwordPromptHandler('请设置密码');

      if (!newPassword || !newPassword.trim()) {
        throw new Error('密码不能为空');
      }

      // 调用设置密码接口（传送明文）
      const setTokenResponse = await fetch('/api/set-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: newPassword.trim() }),
      });

      if (!setTokenResponse.ok) {
        throw new Error('设置密码失败');
      }

      // 存储 hash 后的密码
      const hashedPassword = await hashPassword(newPassword.trim());
      setTokenStorage(hashedPassword);

      // 重新请求原接口（使用 hash）
      response = await makeRequest(hashedPassword);
    }

    // 403: 密码错误或账户锁定，需要重新输入
    if (response.status === 403 && passwordPromptHandler) {
      console.log('403 - Token verification failed, prompting for password...');

      // 解析错误信息
      let errorData: any = null;
      try {
        errorData = await response.clone().json();
      } catch (e) {
        // 忽略
      }

      // 检查是否被锁定
      if (errorData?.locked) {
        showToast(errorData.message || '账户已被锁定', 'error');
      }

      // 循环提示密码
      let retryCount = 0;
      const maxRetries = 5;

      while (response.status === 403 && retryCount < maxRetries) {
        try {
          const errorMessage = retryCount > 0 ? '密码错误，请重新输入' : '请输入密码';
          const newPassword = await passwordPromptHandler(errorMessage);

          if (!newPassword || !newPassword.trim()) {
            throw new Error('密码不能为空');
          }

          // 存储 hash 后的密码
          const hashedPassword = await hashPassword(newPassword.trim());
          setTokenStorage(hashedPassword);

          // 重新请求（使用 hash）
          response = await makeRequest(hashedPassword);

          if (response.status === 200) {
            console.log('Authentication successful!');
            break;
          }

          // 解析新的错误信息
          try {
            errorData = await response.clone().json();
            if (errorData?.locked) {
              throw new Error(errorData.message || '账户已被锁定');
            }
          } catch (e) {
            // 忽略
          }

          retryCount++;
        } catch (error) {
          console.error('Password prompt error:', error);
          throw error;
        }
      }

      if (response.status === 403) {
        throw new Error(errorData?.message || '认证失败');
      }
    }

    if (!response.ok) {
      let errorMessage = `HTTP error! status: ${response.status}`
      try {
        const errorData = await response.json()
        errorMessage = errorData.message || errorMessage
      } catch {
        // 无法解析 JSON，使用默认错误信息
      }
      throw new Error(errorMessage)
    }

    return await response.json();
  } catch (error) {
    console.error('API fetch error:', error);
    throw error;
  }
}
