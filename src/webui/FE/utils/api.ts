import { ApiResponse } from '../types';

const TOKEN_KEY = 'webui_token';
let passwordPromptHandler: ((tip: string) => Promise<string>) | null = null;

export function setPasswordPromptHandler(handler: (tip: string) => Promise<string>) {
  passwordPromptHandler = handler;
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setTokenStorage(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
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
      
      // 调用设置密码接口
      const setTokenResponse = await fetch('/api/set-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: newPassword.trim() }),
      });
      
      if (!setTokenResponse.ok) {
        throw new Error('设置密码失败');
      }
      
      setTokenStorage(newPassword.trim());
      
      // 重新请求原接口
      response = await makeRequest(newPassword.trim());
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
        throw new Error(errorData.message || '账户已被锁定');
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
          
          setTokenStorage(newPassword.trim());
          
          // 重新请求
          response = await makeRequest(newPassword.trim());
          
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
      const errorText = await response.text();
      throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('API fetch error:', error);
    throw error;
  }
}
