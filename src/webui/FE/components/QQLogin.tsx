import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowDown, RefreshCw, X, Loader2 } from 'lucide-react';
import { apiFetch } from '../utils/api';
import { SelfInfo } from '../types';
import { showToast } from './Toast';

interface Account {
  uin: string;
  uid: string;
  nickName?: string;
  faceUrl: string;
  loginType: number;
  isQuickLogin: boolean;
  isAutoLogin: boolean;
  isUserLogin: boolean // true 表示已经登录了
}

interface QRCodeData {
  pngBase64QrcodeData: string;
  qrcodeUrl: string;
  expireTime: number;
  pollTimeInterval: number;
}

interface QuickLoginResult {
  result: string;
  loginErrorInfo: {
    errMsg: string;
  };
}

interface GetLoginListResult {
  LocalLoginInfoList: Account[];
}

interface QQLoginProps {
  onLoginSuccess: () => void;
}

const QQLogin: React.FC<QQLoginProps> = ({ onLoginSuccess }) => {
  const [loginMode, setLoginMode] = useState<'quick' | 'qr'>('quick');
  const [showAccountList, setShowAccountList] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [qrExpired, setQrExpired] = useState(false);
  const [qrStatus, setQrStatus] = useState<'scanning' | 'success' | 'expired' | 'error' | ''>('');

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [showRemoveAccount, setShowRemoveAccount] = useState(false);

  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const qrRefreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const loginPollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isPollingLoginRef = useRef(false);

  const qrStatusText = {
    scanning: '扫描成功，请在手机上确认',
    success: '登录成功',
    expired: '二维码已过期，请刷新',
    error: '登录失败，请重试',
    '': '',
  };

  // 停止轮询登录状态
  const stopLoginPolling = useCallback(() => {
    isPollingLoginRef.current = false;
    if (loginPollingIntervalRef.current) {
      clearTimeout(loginPollingIntervalRef.current);
      loginPollingIntervalRef.current = null;
    }
  }, []);

  // 轮询登录状态
  const pollLoginStatus = useCallback(async () => {
    if (isPollingLoginRef.current) {
      return;
    }

    isPollingLoginRef.current = true;
    console.log('开始轮询登录状态...');

    const maxAttempts = 60; // 最多轮询60次（约5分钟）
    let attempts = 0;

    const poll = async () => {
      if (attempts >= maxAttempts) {
        stopLoginPolling();
        showToast('登录超时，请重试', 'error');
        if (loginMode === 'qr') {
          setQrStatus('error');
        }
        return;
      }

      attempts++;

      try {
        const result = await apiFetch<SelfInfo>('/api/login-info');
        if (result.success && result.data.online === true) {
          stopLoginPolling();
          showToast('登录成功！正在跳转到主页面...', 'success');
          if (loginMode === 'qr') {
            setQrStatus('success');
          }
          setTimeout(() => {
            onLoginSuccess();
          }, 1000);
          return;
        }

        // 继续轮询
        loginPollingIntervalRef.current = setTimeout(poll, 3000); // 每3秒轮询一次
      } catch (error: any) {
        console.warn('轮询登录状态失败:', error);
        // 继续轮询，不中断
        loginPollingIntervalRef.current = setTimeout(poll, 3000);
      }
    };

    // 开始第一次轮询
    await poll();
  }, [loginMode, onLoginSuccess, stopLoginPolling]);

  // 显示二维码
  const displayQrCode = useCallback((base64Data: string) => {
    if (!qrCanvasRef.current) return;

    const canvas = qrCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, 200, 200);
      ctx.drawImage(img, 0, 0, 200, 200);
    };
    img.src = base64Data;
  }, []);

  // 生成二维码
  const generateQrCode = useCallback(async () => {
    if (!qrCanvasRef.current) return;

    try {
      const result = await apiFetch<QRCodeData>('/api/login-qrcode');

      if (result.success && result.data) {
        displayQrCode(result.data.pngBase64QrcodeData);

        // 设置过期定时器
        const expireTime = result.data.expireTime * 1000;
        if (qrRefreshIntervalRef.current) {
          clearInterval(qrRefreshIntervalRef.current);
        }
        qrRefreshIntervalRef.current = setTimeout(() => {
          setQrExpired(true);
          setQrStatus('expired');
          stopLoginPolling();
        }, expireTime);

        setQrExpired(false);
        setQrStatus('');

        showToast('请使用手机QQ扫码登录', 'warning');
        await pollLoginStatus();
      } else {
        throw new Error(result.message || '获取二维码失败');
      }
    } catch (error: any) {
      showToast(error.message || '获取二维码失败', 'error');
      console.error('QR code generation error:', error);
    }
  }, [displayQrCode, pollLoginStatus, stopLoginPolling]);

  // 刷新二维码
  const refreshQrCode = useCallback(async () => {
    await generateQrCode();
    showToast('二维码已刷新', 'success');
  }, [generateQrCode]);

  // 获取快速登录列表（防重复：通过 hasFetchedRef 控制）
  const hasFetchedRef = useRef(false);
  const fetchQuickLoginList = useCallback(async () => {
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;
    try {
      const result = await apiFetch<GetLoginListResult>('/api/quick-login-list');
      console.log('Quick login list response:', result);

      if (result.success && result.data && result.data.LocalLoginInfoList) {
        const quickLoginAccounts = result.data.LocalLoginInfoList.filter(item => item.isQuickLogin && !item.isUserLogin);
        setAccounts(quickLoginAccounts);
        console.log('Accounts loaded:', quickLoginAccounts);

        if (quickLoginAccounts.length > 0) {
          // 仅在还未选择账号时设置，避免触发依赖循环
          setSelectedAccount(prev => prev ?? quickLoginAccounts[0]);
        } else {
          setLoginMode('qr');
        }
      } else {
        console.warn('No quick login accounts available:', result.message);
        setAccounts([]);
      }
    } catch (error: any) {
      console.error('Failed to fetch quick login list:', error);
      showToast('获取快速登录列表失败', 'error');
      setAccounts([]);
    }
  }, []);

  // 快速登录
  const handleQuickLogin = useCallback(async () => {
    if (!selectedAccount) return;

    setLoginLoading(true);
    try {
      const resp = await apiFetch<QuickLoginResult>('/api/quick-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uin: selectedAccount.uin }),
      });
      const data = resp.data;
      if (data.result === '0') {
        showToast(`正在登录 ${selectedAccount.nickName}...`, 'success');
        await pollLoginStatus();
      } else {
        throw new Error(data.loginErrorInfo.errMsg || '登录失败');
      }
    } catch (error: any) {
      showToast(error.message, 'error');
      console.error('Quick login error:', error);
      setLoginMode('qr');
    } finally {
      setLoginLoading(false);
    }
  }, [selectedAccount, pollLoginStatus]);

  // 切换账号列表显示
  const toggleAccountList = () => {
    setShowAccountList(!showAccountList);
  };

  // 选择账号
  const selectAccount = (account: Account) => {
    setSelectedAccount(account);
    setShowAccountList(false);
  };

  // 移除账号
  const removeAccount = (uin: string) => {
    const index = accounts.findIndex(acc => acc.uin === uin);
    if (index > -1) {
      const removedAccount = accounts.splice(index, 1)[0];
      const newAccounts = [...accounts];
      setAccounts(newAccounts);

      if (selectedAccount?.uin === uin && newAccounts.length > 0) {
        setSelectedAccount(newAccounts[0]);
      } else if (selectedAccount?.uin === uin) {
        setSelectedAccount(null);
      }
      showToast(`已移除账号 ${removedAccount.nickName}`, 'success');
    }
    setShowRemoveAccount(false);
  };

  // 初始化
  useEffect(() => {
    if (!hasFetchedRef.current) fetchQuickLoginList();

    return () => {
      if (qrRefreshIntervalRef.current) {
        clearInterval(qrRefreshIntervalRef.current);
      }
      stopLoginPolling();
    };
  }, []);

  // 监听登录模式变化
  useEffect(() => {
    if (loginMode === 'qr') {
      setTimeout(() => generateQrCode(), 100);
    } else if (qrRefreshIntervalRef.current) {
      clearInterval(qrRefreshIntervalRef.current);
    }

    // 当从二维码模式切换到快速登录且还未获取过列表时再获取，避免重复
    if (loginMode === 'quick' && accounts.length === 0 && !hasFetchedRef.current) {
      fetchQuickLoginList();
    }
  }, [loginMode, accounts.length, generateQrCode]);

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center p-5">
      {/* Login Content - AnimatedBackground now provided by App.tsx */}
      <div className="bg-white/50 backdrop-blur-2xl rounded-3xl p-10 shadow-xl border border-white/30 min-w-[320px] text-center relative z-10">
        {/* Quick Login Mode */}
        {loginMode === 'quick' && (
          <div className="flex flex-col items-center gap-6">
            {/* Single Account Display */}
            {!showAccountList && selectedAccount && (
              <div
                className="flex flex-col items-center cursor-pointer p-4 rounded-2xl transition-colors hover:bg-blue-50"
                onClick={toggleAccountList}
              >
                <div className="w-20 h-20 rounded-full overflow-hidden mb-3 shadow-lg">
                  <img src={selectedAccount.faceUrl} alt={selectedAccount.nickName} className="w-full h-full object-cover" />
                </div>
                <div className="text-base text-gray-800 mb-2">{selectedAccount.nickName}</div>
              </div>
            )}

            {/* Account List */}
            {showAccountList && (
              <div className="grid grid-cols-2 gap-4 my-5 w-full max-w-md">
                {accounts.map((account) => (
                  <div
                    key={account.uin}
                    className="flex flex-col items-center p-4 rounded-2xl cursor-pointer transition-all border-2 border-transparent hover:bg-blue-50 hover:border-blue-500"
                    onClick={() => selectAccount(account)}
                  >
                    <div className="w-[60px] h-[60px] rounded-full overflow-hidden mb-2 shadow-md">
                      <img src={account.faceUrl} alt={account.nickName} className="w-full h-full object-cover" />
                    </div>
                    <div className="text-sm text-gray-800 text-center truncate w-full px-1">{account.nickName}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Login Button */}
            {!showAccountList && (
              <button
                onClick={handleQuickLogin}
                disabled={!selectedAccount || loginLoading}
                className="w-[280px] h-11 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-full font-medium text-base disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg transition-all flex items-center justify-center gap-2"
              >
                {loginLoading ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    登录中...
                  </>
                ) : (
                  '登录'
                )}
              </button>
            )}

            {/* Action Links */}
            <div className="flex gap-6 justify-center">
              {!showAccountList && (
                <button onClick={toggleAccountList} className="text-blue-600 text-sm hover:underline">
                  切换账号
                </button>
              )}
              <button onClick={() => setLoginMode('qr')} className="text-blue-600 text-sm hover:underline">
                扫码登录
              </button>
              {/* 暂时注释掉移除账号功能 */}
              {/* <button onClick={() => setShowRemoveAccount(true)} className="text-blue-600 text-sm hover:underline">
                移除账号
              </button> */}
            </div>
          </div>
        )}

        {/* QR Code Login Mode */}
        {loginMode === 'qr' && (
          <div className="flex flex-col items-center gap-5">
            <div className="relative inline-block">
              <div className="relative p-5 bg-white rounded-2xl shadow-lg">
                <canvas ref={qrCanvasRef} width="200" height="200" className="block rounded-lg" />

                {/* QR Refresh Overlay */}
                {qrExpired && (
                  <div
                    className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-white cursor-pointer rounded-2xl transition-opacity hover:opacity-90"
                    onClick={refreshQrCode}
                  >
                    <RefreshCw size={32} className="mb-2" />
                    <div>点击刷新</div>
                  </div>
                )}
              </div>
            </div>

            <div className="text-gray-600">请使用手机QQ扫码登录</div>

            {/* QR Status Messages */}
            {qrStatus && (
              <div
                className={`text-sm px-4 py-2 rounded-lg ${
                  qrStatus === 'success'
                    ? 'bg-green-100 text-green-800'
                    : qrStatus === 'error' || qrStatus === 'expired'
                    ? 'bg-red-100 text-red-800'
                    : 'bg-blue-100 text-blue-800'
                }`}
              >
                {qrStatusText[qrStatus]}
              </div>
            )}
          </div>
        )}

        {/* Mode Switch */}
        <div className="mt-6">
          {loginMode === 'qr' && accounts.length > 0 && (
            <button onClick={() => setLoginMode('quick')} className="text-blue-600 text-sm hover:underline">
              快速登录
            </button>
          )}
        </div>
      </div>

      {/* Remove Account Dialog - 暂时注释掉 */}
      {/* {showRemoveAccount && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-gray-900">移除账号</h3>
              <button onClick={() => setShowRemoveAccount(false)} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>

            <div className="mb-4 text-sm text-gray-600">选择要移除的账号:</div>

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {accounts.map((account) => (
                <div
                  key={account.uin}
                  className="flex items-center gap-3 p-3 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => removeAccount(account.uin)}
                >
                  <img src={account.faceUrl} alt={account.nickName} className="w-10 h-10 rounded-full" />
                  <span className="flex-1 text-gray-800">{account.nickName}</span>
                  <X size={20} className="text-red-500" />
                </div>
              ))}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowRemoveAccount(false)}
                className="px-6 py-2 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )} */}
    </div>
  );
};

export default QQLogin;
