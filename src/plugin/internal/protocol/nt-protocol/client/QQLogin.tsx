import React, { useState, useEffect, useRef, useCallback } from 'react';
import { RefreshCw, Loader2 } from 'lucide-react';
import { usePluginContext } from '@luckylillia/plugin-sdk/webui';
import { isQuickLoginUnsupported, readQuickLoginList } from './quickLoginList';

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
  /** false while the bridge's login service cannot supply the account list */
  ready?: boolean;
  LocalLoginInfoList: Account[];
}

interface QQLoginProps {
  /** A quick login went through: the account is online now */
  onLogin?: () => void;
}

/** Quick login and QR login of the scanned account; the NTQQ protocol page notices the login itself. */
const QQLogin: React.FC<QQLoginProps> = ({ onLogin }) => {
  const ctx = usePluginContext();
  const showToast = ctx.toast;
  // Quick login only once QQ has returned a saved account.
  const [loginMode, setLoginMode] = useState<'loading' | 'quick' | 'qr'>('loading');
  const [waitingLoginService, setWaitingLoginService] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [listUnsupported, setListUnsupported] = useState(false);
  // Why the quick login did not get online, kept on screen: a toast is easily missed
  const [error, setError] = useState('');
  const [showAccountList, setShowAccountList] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [qrExpired, setQrExpired] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);

  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const qrRefreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const listRequestRef = useRef<AbortController | null>(null);
  const generateQrCodeRef = useRef<(() => void) | undefined>(undefined);

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
      const data = await ctx.api<QRCodeData>('/api/login-qrcode');
      displayQrCode(data.pngBase64QrcodeData);

      const expireTime = data.expireTime * 1000;
      if (qrRefreshIntervalRef.current) clearTimeout(qrRefreshIntervalRef.current);
      qrRefreshIntervalRef.current = setTimeout(() => setQrExpired(true), expireTime);

      setQrExpired(false);
      showToast('请使用手机QQ扫码登录', 'warning');
    } catch {
      // 刚录入 token 时 client 可能还在初始化, 慢速静默重试
      setTimeout(() => generateQrCodeRef.current?.(), 3000);
    }
  }, [displayQrCode, ctx, showToast]);

  const refreshQrCode = useCallback(async () => {
    await generateQrCode();
    showToast('二维码已刷新', 'success');
  }, [generateQrCode, showToast]);

  const fetchQuickLoginList = useCallback(async () => {
    listRequestRef.current?.abort();
    const controller = new AbortController();
    listRequestRef.current = controller;
    setListLoading(true);
    setListError('');
    setListUnsupported(false);
    setWaitingLoginService(false);
    try {
      const data = await readQuickLoginList(
        () => ctx.api<GetLoginListResult>('/api/quick-login-list'),
        controller.signal,
        setWaitingLoginService,
      );
      if (!data || controller.signal.aborted) return;
      const quickLoginAccounts = (data?.LocalLoginInfoList ?? []).filter(item => item.isQuickLogin && !item.isUserLogin);
      setAccounts(quickLoginAccounts);
      if (quickLoginAccounts.length > 0) {
        setSelectedAccount(prev => quickLoginAccounts.find(account => account.uin === prev?.uin) ?? quickLoginAccounts[0]);
        // A user can choose QR while the list loads; finishing the request must keep that choice.
        setLoginMode(mode => (mode === 'loading' ? 'quick' : mode));
      } else {
        setLoginMode('qr');
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      setListError(error instanceof Error ? error.message : '读取快速登录账号失败，请重试');
      setListUnsupported(isQuickLoginUnsupported(error));
      setLoginMode('qr');
    } finally {
      if (!controller.signal.aborted) {
        setListLoading(false);
        setWaitingLoginService(false);
      }
    }
  }, [ctx]);

  // The request returns once the login has an outcome: online, or the reason it is not
  const handleQuickLogin = useCallback(async () => {
    if (!selectedAccount) return;
    setError('');
    setLoginLoading(true);
    try {
      const data = await ctx.api<QuickLoginResult>('/api/quick-login', { method: 'POST', body: { uin: selectedAccount.uin } });
      if (data?.result !== '0') throw new Error(data?.loginErrorInfo?.errMsg || '登录失败');
      onLogin?.();
    } catch (e) {
      const message = e instanceof Error ? e.message : '登录失败';
      setError(message);
      showToast(message, 'error');
      setLoginMode('qr');
    } finally {
      setLoginLoading(false);
    }
  }, [selectedAccount, onLogin, ctx, showToast]);

  const toggleAccountList = () => setShowAccountList(!showAccountList);
  const selectAccount = (account: Account) => { setSelectedAccount(account); setShowAccountList(false); };

  useEffect(() => {
    void fetchQuickLoginList();
    return () => {
      listRequestRef.current?.abort();
      if (qrRefreshIntervalRef.current) clearTimeout(qrRefreshIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (loginMode === 'qr') {
      setTimeout(() => generateQrCode(), 100);
    } else if (qrRefreshIntervalRef.current) {
      clearTimeout(qrRefreshIntervalRef.current);
    }
  }, [loginMode, generateQrCode]);

  useEffect(() => {
    generateQrCodeRef.current = generateQrCode;
  }, [generateQrCode]);

  return (
    <div className="flex flex-col items-center text-center">
      {error && (
        <div className="w-full max-w-md mb-6 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400 text-sm text-left">
          {error}
        </div>
      )}
      {listError && (
        <div className="w-full max-w-md mb-6 p-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-xl text-amber-700 dark:text-amber-300 text-sm" role="status">
          <p>{listError}</p>
          {!listUnsupported && (
            <button onClick={() => void fetchQuickLoginList()} className="mt-2 text-pink-500 hover:underline">重新读取账号</button>
          )}
        </div>
      )}

      {loginMode === 'loading' && (
        <div className="flex flex-col items-center gap-4 py-10 text-sm text-theme-secondary">
          <div className="flex items-center gap-2">
            <Loader2 size={18} className="animate-spin text-pink-500" />
            {waitingLoginService ? '正在连接 QQ 登录服务...' : '正在读取可快速登录的账号...'}
          </div>
          <button onClick={() => setLoginMode('qr')} className="text-pink-500 hover:underline">扫码登录</button>
        </div>
      )}

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
            <button onClick={handleQuickLogin} disabled={!selectedAccount || loginLoading} className="w-[280px] h-11 px-5 gradient-primary text-white rounded-full font-medium text-base disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg transition-all flex items-center justify-center gap-2">
              {loginLoading ? (<><Loader2 size={20} className="animate-spin flex-shrink-0" /><span className="truncate">正在登录 {selectedAccount?.nickName ?? ''}...</span></>) : '登录'}
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
          {listLoading && (
            <div className="flex items-center gap-2 text-xs text-theme-muted">
              <Loader2 size={14} className="animate-spin" />
              正在读取可快速登录的账号...
            </div>
          )}
          {!listLoading && !listError && accounts.length === 0 && (
            <div className="text-sm text-theme-muted">
              <p>没有可快速登录的账号</p>
              <button onClick={() => void fetchQuickLoginList()} className="mt-2 text-pink-500 hover:underline">重新读取账号</button>
            </div>
          )}
          {qrExpired && (
            <div className="text-sm px-4 py-2 rounded-lg bg-red-100 text-red-800">二维码已过期，请刷新</div>
          )}
          {accounts.length > 0 && (
            <button onClick={() => setLoginMode('quick')} className="text-pink-500 text-sm hover:underline">快速登录</button>
          )}
        </div>
      )}
    </div>
  );
};

export default QQLogin;
