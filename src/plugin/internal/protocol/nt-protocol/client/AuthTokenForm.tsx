import React, { useState, useEffect, useRef } from 'react';
import { Eye, EyeOff, KeyRound, ExternalLink, Loader2 } from 'lucide-react';
import { usePluginContext } from '@luckylillia/plugin-sdk/webui';

interface AuthTokenFormProps {
  // 决定标题文案; replace: 已有 token 时换一个, 账号可能在线
  reason: 'missing' | 'invalid' | 'replace';
  // Follows the backend CDN setting; the link is hidden until the status poll delivers it.
  authTokenPageUrl?: string;
  /** The token checked out, or the account is online already. */
  onSuccess: () => void;
  /** Shown as a cancel button: the form can be closed */
  onCancel?: () => void;
}

/** GET /api/auth-token/status */
export interface AuthTokenStatus {
  applicable: boolean;
  online: boolean;
  hasToken: boolean;
  validation: 'idle' | 'validating' | 'valid' | 'invalid' | 'error';
  message: string;
  loginError: string;
  authTokenPageUrl?: string;
}

const POLL_INTERVAL = 1500;
const POLL_MAX = 30; // ~45s 超时

// 提交后由后端 watcher 校验, 这里轮询 /api/auth-token/status 拿结果
const AuthTokenForm: React.FC<AuthTokenFormProps> = ({ reason, authTokenPageUrl, onSuccess, onCancel }) => {
  const ctx = usePluginContext();
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [statusText, setStatusText] = useState('');
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const pollStatus = async () => {
    for (let i = 0; i < POLL_MAX; i++) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL));
      if (!mountedRef.current) return;
      let data: AuthTokenStatus | null = null;
      try {
        data = await ctx.api<AuthTokenStatus>('/api/auth-token/status');
      } catch {
        continue;
      }
      if (!data) continue;
      // 换 token 时账号可能本来就在线, 要等新 token 的校验结果
      if (data.online && reason !== 'replace') {
        setStatusText('登录成功');
        onSuccess();
        return;
      }
      if (data.loginError) {
        setError(data.loginError);
        setStatusText('');
        setSubmitting(false);
        return;
      }
      if (data.validation === 'valid') {
        setStatusText(reason === 'replace' ? '校验通过，已设置' : '校验通过，正在登录...');
        onSuccess();
        return;
      }
      if (data.validation === 'invalid') {
        setError(data.message || 'Auth Token 无效');
        setStatusText('');
        setSubmitting(false);
        return;
      }
      if (data.validation === 'error') {
        setStatusText(data.message || '无法连接验证服务器，正在重试...');
      }
    }
    if (mountedRef.current) {
      setError('校验超时，请重试');
      setStatusText('');
      setSubmitting(false);
    }
  };

  const handleConfirm = async () => {
    const value = token.trim();
    if (!value) {
      setError('Auth Token 不能为空');
      return;
    }
    setSubmitting(true);
    setError('');
    setStatusText('正在保存并校验...');
    try {
      await ctx.api('/api/auth-token', { method: 'POST', body: { token: value } });
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
      setStatusText('');
      setSubmitting(false);
      return;
    }
    await pollStatus();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !submitting) {
      handleConfirm();
    }
  };

  const title = reason === 'replace' ? '设置 Auth Token' : reason === 'invalid' ? 'Auth Token 无效，请重新录入' : '请录入 Auth Token';
  const hint = reason === 'replace' ? '保存后马上替换现在的 Auth Token 并校验' : '扫码登录前需要有效的 Auth Token';

  return (
    <div className="w-full max-w-md mx-auto text-left space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center flex-shrink-0">
          <KeyRound size={20} className="text-white" />
        </div>
        <div>
          <h4 className="text-base font-semibold text-theme">{title}</h4>
          <p className="text-sm text-theme-secondary mt-0.5">{hint}</p>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {statusText && (
        <div className="p-3 bg-pink-50 dark:bg-pink-900/20 border border-pink-200 dark:border-pink-800 rounded-xl text-theme-secondary text-sm flex items-center gap-2">
          <Loader2 size={16} className="animate-spin text-pink-500" />
          {statusText}
        </div>
      )}

      <div>
        <div className="relative">
          <input
            type={showToken ? 'text' : 'password'}
            value={token}
            onChange={(e) => {
              setToken(e.target.value);
              if (error) setError('');
            }}
            onKeyPress={handleKeyPress}
            placeholder="请粘贴 Auth Token"
            className="input-field pr-12"
            autoComplete="off"
            disabled={submitting}
          />
          <button
            type="button"
            onClick={() => setShowToken(!showToken)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-hint hover:text-theme transition-colors"
          >
            {showToken ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        </div>
        {authTokenPageUrl && (
          <a
            href={authTokenPageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-pink-500 hover:text-pink-600 hover:underline mt-2"
          >
            <ExternalLink size={14} />
            获取 Auth Token
          </a>
        )}
      </div>

      <div className="flex justify-end gap-3">
        {onCancel && (
          <button
            onClick={onCancel}
            disabled={submitting}
            className="px-4 py-2.5 bg-theme-item hover:bg-theme-item-hover text-theme rounded-xl transition-colors font-medium disabled:opacity-50"
          >
            取消
          </button>
        )}
        <button
          onClick={handleConfirm}
          disabled={submitting || !token.trim()}
          className="px-6 py-2.5 btn-primary font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? '校验中...' : '验证并保存'}
        </button>
      </div>
    </div>
  );
};

export default AuthTokenForm;
