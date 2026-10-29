export function setCookie(name: string, value: string, days: number = 30): void {
  const date = new Date();
  date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
  const expires = `expires=${date.toUTCString()}`;

  // 不设 HttpOnly: JS 要读它
  const isSecure = window.location.protocol === 'https:';
  const secureFlag = isSecure ? '; Secure' : '';

  // IP 访问时不设 SameSite, 保证兼容; 其余用 Lax
  const hostname = window.location.hostname;
  const isIpAddress = /^\d+\.\d+\.\d+\.\d+$/.test(hostname);
  const sameSiteFlag = isIpAddress ? '' : '; SameSite=Lax';

  const cookieString = `${name}=${value}; ${expires}; path=/${sameSiteFlag}${secureFlag}`;
  document.cookie = cookieString;

  // 调试日志
  // console.log('[Cookie] 设置Cookie:', {
  //   name,
  //   hostname,
  //   isIpAddress,
  //   isSecure,
  //   cookieString,
  //   currentCookies: document.cookie
  // });
}

export function getCookie(name: string): string | null {
  const nameEQ = name + '=';
  const ca = document.cookie.split(';');

  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) === ' ') c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) === 0) {
      const value = c.substring(nameEQ.length, c.length);
      // console.log('[Cookie] 获取Cookie:', { name, value, allCookies: document.cookie });
      return value;
    }
  }

  console.log('[Cookie] 未找到Cookie:', { name, allCookies: document.cookie });
  return null;
}

export function deleteCookie(name: string): void {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
}
