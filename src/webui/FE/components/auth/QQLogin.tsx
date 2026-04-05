import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowDown, RefreshCw, X, Loader2 } from 'lucide-react';
import { apiFetch } from '../../utils/api';
import { SelfInfo } from '../../types';
import { showToast } from '../common';

interface Account {
  uin: string;
  uid: string;
  nickName?: string;
  faceUrl: string;
  loginType: number;
  isQuickLogin: boolean;
  isAutoLogin: boolean;
  isUserLogin: boolean
}

interface QRCodeData {
  pngBase64QrcodeData: string;
  qrcodeUrl: string;
  expireTime: number;
  pollTimeInterval: number;
}

interface QuickLoginResult {
  result: string;
  loginErrorInfo: { errMsg: string };
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

  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const qrRefreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const loginPollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isPollingLoginRef = useRef(false);
  const hasFetchedRef = useRef(false);

  const qrStatusText = {
    scanning: '扫描成功，请在手机上确认',
    success: '登录成功',
    expired: '二维码已过期，请刷新',
    error: '登录失败，请重试',
    '': '',
  };

  const stopLoginPolling = useCallback(() => {
    isPollingLoginRef.current = false;
    if (loginPollingIntervalRef.current) {
      clearTimeout(loginPollingIntervalRef.current);
      loginPollingIntervalRef.current = null;
    }
  }, []);

  const pollLoginStatus = useCallback(async () => {
    if (isPollingLoginRef.current) return;
    isPollingLoginRef.current = true;

    const maxAttempts = 60;
    let attempts = 0;

    const poll = async () => {
      if (attempts >= maxAttempts) {
        stopLoginPolling();
        showToast('登录超时，请重试', 'error');
        if (loginMode === 'qr') setQrStatus('error');
        return;
      }
      attempts++;

      try {
        const result = await apiFetch<SelfInfo>('/api/login-info');
        if (result.success && result.data.online === true) {
          stopLoginPolling();
          showToast('登录成功！正在跳转到主页面...', 'success');
          if (loginMode === 'qr') setQrStatus('success');
          setTimeout(() => onLoginSuccess(), 1000);
          return;
        }
        loginPollingIntervalRef.current = setTimeout(poll, 3000);
      } catch {
        loginPollingIntervalRef.current = setTimeout(poll, 3000);
      }
    };

    await poll();
  }, [loginMode, onLoginSuccess, stopLoginPolling]);

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

  const generateQrCode = useCallback(async () => {
    if (!qrCanvasRef.current) return;

    try {
      const result = await apiFetch<QRCodeData>('/api/login-qrcode');
      if (result.success && result.data) {
        displayQrCode(result.data.pngBase64QrcodeData);

        const expireTime = result.data.expireTime * 1000;
        if (qrRefreshIntervalRef.current) clearInterval(qrRefreshIntervalRef.current);
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
    } catch (error) {
      showToast(error.message || '获取二维码失败', 'error');
    }
  }, [displayQrCode, pollLoginStatus, stopLoginPolling]);

  const refreshQrCode = useCallback(async () => {
    await generateQrCode();
    showToast('二维码已刷新', 'success');
  }, [generateQrCode]);

  const fetchQuickLoginList = useCallback(async () => {
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;
    try {
      const result = await apiFetch<GetLoginListResult>('/api/quick-login-list');
      if (result.success && result.data && result.data.LocalLoginInfoList) {
        const quickLoginAccounts = result.data.LocalLoginInfoList.filter(item => item.isQuickLogin && !item.isUserLogin);
        setAccounts(quickLoginAccounts);
        if (quickLoginAccounts.length > 0) {
          setSelectedAccount(prev => prev ?? quickLoginAccounts[0]);
        } else {
          setLoginMode('qr');
        }
      } else {
        setAccounts([]);
      }
    } catch {
      showToast('获取快速登录列表失败', 'error');
      setAccounts([]);
    }
  }, []);

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
    } catch (error) {
      showToast(error.message, 'error');
      setLoginMode('qr');
    } finally {
      setLoginLoading(false);
    }
  }, [selectedAccount, pollLoginStatus]);

  const toggleAccountList = () => setShowAccountList(!showAccountList);
  const selectAccount = (account: Account) => { setSelectedAccount(account); setShowAccountList(false); };

  useEffect(() => {
    if (!hasFetchedRef.current) fetchQuickLoginList();
    return () => {
      if (qrRefreshIntervalRef.current) clearInterval(qrRefreshIntervalRef.current);
      stopLoginPolling();
    };
  }, []);

  useEffect(() => {
    if (loginMode === 'qr') {
      setTimeout(() => generateQrCode(), 100);
    } else if (qrRefreshIntervalRef.current) {
      clearInterval(qrRefreshIntervalRef.current);
    }
    if (loginMode === 'quick' && accounts.length === 0 && !hasFetchedRef.current) {
      fetchQuickLoginList();
    }
  }, [loginMode, accounts.length, generateQrCode]);

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center p-5">
      <div className="bg-white/50 dark:bg-neutral-800/70 backdrop-blur-2xl rounded-3xl p-10 shadow-xl border border-white/30 dark:border-neutral-700/50 min-w-[320px] text-center relative z-10">
        {/* Quick Login Mode */}
        {loginMode === 'quick' && (
          <div className="flex flex-col items-center gap-6">
            {!showAccountList && selectedAccount && (
              <div className="flex flex-col items-center cursor-pointer p-4 rounded-2xl transition-colors hover:bg-pink-50 dark:hover:bg-pink-900/30" onClick={toggleAccountList}>
                <div className="w-20 h-20 rounded-full overflow-hidden mb-3 shadow-lg">
                  <img src={selectedAccount.faceUrl} alt={selectedAccount.nickName} className="w-full h-full object-cover" />
                </div>
                <div className="text-base text-theme mb-2">{selectedAccount.nickName}</div>
              </div>
            )}

            {showAccountList && (
              <div className="grid grid-cols-2 gap-4 my-5 w-full max-w-md">
                {accounts.map((account) => (
                  <div key={account.uin} className="flex flex-col items-center p-4 rounded-2xl cursor-pointer transition-all border-2 border-transparent hover:bg-pink-50 dark:hover:bg-pink-900/30 hover:border-pink-500" onClick={() => selectAccount(account)}>
                    <div className="w-[60px] h-[60px] rounded-full overflow-hidden mb-2 shadow-md">
                      <img src={account.faceUrl} alt={account.nickName} className="w-full h-full object-cover" />
                    </div>
                    <div className="text-sm text-theme text-center truncate w-full px-1">{account.nickName}</div>
                  </div>
                ))}
              </div>
            )}

            {!showAccountList && (
              <button onClick={handleQuickLogin} disabled={!selectedAccount || loginLoading} className="w-[280px] h-11 gradient-primary text-white rounded-full font-medium text-base disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg transition-all flex items-center justify-center gap-2">
                {loginLoading ? (<><Loader2 size={20} className="animate-spin" />登录中...</>) : '登录'}
              </button>
            )}

            <div className="flex gap-6 justify-center">
              {!showAccountList && <button onClick={toggleAccountList} className="text-pink-500 text-sm hover:underline">切换账号</button>}
              <button onClick={() => setLoginMode('qr')} className="text-pink-500 text-sm hover:underline">扫码登录</button>
            </div>
          </div>
        )}

        {/* QR Code Login Mode */}
        {loginMode === 'qr' && (
          <div className="flex flex-col items-center gap-5">
            <div className="relative inline-block">
              <div className="relative p-5 bg-white rounded-2xl shadow-lg">
                <canvas ref={qrCanvasRef} width="200" height="200" className="block rounded-lg" />
                {qrExpired && (
                  <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-white cursor-pointer rounded-2xl transition-opacity hover:opacity-90" onClick={refreshQrCode}>
                    <RefreshCw size={32} className="mb-2" /><div>点击刷新</div>
                  </div>
                )}
              </div>
            </div>
            <div className="text-theme-secondary">请使用手机QQ扫码登录</div>
            {qrStatus && (
              <div className={`text-sm px-4 py-2 rounded-lg ${qrStatus === 'success' ? 'bg-green-100 text-green-800' : qrStatus === 'error' || qrStatus === 'expired' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}`}>
                {qrStatusText[qrStatus]}
              </div>
            )}
          </div>
        )}

        <div className="mt-6">
          {loginMode === 'qr' && accounts.length > 0 && (
            <button onClick={() => setLoginMode('quick')} className="text-pink-500 text-sm hover:underline">快速登录</button>
          )}
        </div>
      </div>
    </div>
  );
};

export default QQLogin;
