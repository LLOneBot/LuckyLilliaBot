import React, { useState, useEffect, useRef } from 'react';
import { Eye, EyeOff, KeyRound, ExternalLink, Loader2 } from 'lucide-react';
import { apiFetch } from '../../utils/api';

interface AuthTokenDialogProps {
  visible: boolean;
  // 缺失(missing) 还是 无效(invalid), 决定标题文案
  reason?: 'missing' | 'invalid';
  onSuccess: () => void;
}

interface AuthTokenStatusData {
  applicable: boolean;
  online: boolean;
  hasToken: boolean;
  validation: 'idle' | 'validating' | 'valid' | 'invalid' | 'error';
  message: string;
  loginError: string;
}

const POLL_INTERVAL = 1500;
const POLL_MAX = 30; // ~45s 超时

// 强制录入 QQ 登录所需的 auth token: 不可取消/关闭.
// 提交只写文件 (POST), 校验由后端 watcher 做, 前端轮询 /api/auth-token/status 拿结果.
const AuthTokenDialog: React.FC<AuthTokenDialogProps> = ({ visible, reason, onSuccess }) => {
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [statusText, setStatusText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (visible) {
      setToken('');
      setShowToken(false);
      setSubmitting(false);
      setError('');
      setStatusText('');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [visible]);

  // 阻止 ESC 关闭 (强制录入)
  useEffect(() => {
    if (!visible) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [visible]);

  const pollStatus = async () => {
    for (let i = 0; i < POLL_MAX; i++) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL));
      if (!mountedRef.current) return;
      let data: AuthTokenStatusData | null = null;
      try {
        const res = await apiFetch<AuthTokenStatusData>('/api/auth-token/status');
        if (res.success) data = res.data;
      } catch {
        continue; // 状态查询失败, 下一轮再试
      }
      if (!data) continue;
      if (data.online) {
        setStatusText('登录成功，正在跳转...');
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
        setStatusText('校验通过，正在登录...');
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
        // 继续轮询, 后端也会自动重试
      }
      // validating -> 继续轮询
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
      const res = await apiFetch('/api/auth-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: value }),
      });
      if (!res.success) {
        setError(res.message || '保存失败');
        setStatusText('');
        setSubmitting(false);
        return;
      }
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

  if (!visible) return null;

  const title = reason === 'invalid' ? 'Auth Token 无效，请重新录入' : '请录入 Auth Token';

  return (
    <div
      className="fixed inset-0 bg-black/30 dark:bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      style={{ zIndex: 9100 }}
    >
      <div className="bg-white/90 dark:bg-neutral-800/90 backdrop-blur-xl rounded-3xl shadow-2xl w-full max-w-md transform transition-all">
        {/* Header */}
        <div className="flex items-center gap-3 p-6 border-b border-white/20 dark:border-neutral-700/50">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center">
            <KeyRound size={20} className="text-white" />
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-semibold text-theme">{title}</h3>
            <p className="text-sm text-theme-secondary mt-0.5">登录 QQ 前需要有效的 Auth Token</p>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
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
                ref={inputRef}
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
            <a
              href="https://auth.luckylillia.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-pink-500 hover:text-pink-600 hover:underline mt-2"
            >
              <ExternalLink size={14} />
              获取 Auth Token
            </a>
          </div>
        </div>

        {/* Footer - 无取消按钮 (强制录入) */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-white/20 dark:border-neutral-700/50">
          <button
            onClick={handleConfirm}
            disabled={submitting || !token.trim()}
            className="px-6 py-2.5 gradient-primary text-white rounded-lg font-medium hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none"
          >
            {submitting ? '校验中...' : '验证并保存'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuthTokenDialog;
