import React, { useState, useEffect, useRef } from 'react';
import { X, Eye, EyeOff, Lock } from 'lucide-react';
import { apiFetch } from '../../utils/api';
import { showToast } from '../common';
import { validatePassword } from '../../utils/passwordValidation';

interface ChangePasswordDialogProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const ChangePasswordDialog: React.FC<ChangePasswordDialogProps> = ({ visible, onClose, onSuccess }) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (visible && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [visible]);

  useEffect(() => {
    if (visible) {
      setNewPassword('');
      setConfirmPassword('');
      setShowNewPassword(false);
      setShowConfirmPassword(false);
      setError('');
    }
  }, [visible]);

  const handleConfirm = async () => {
    // 验证新密码
    const validation = validatePassword(newPassword, 6);
    if (!validation.isValid) {
      setError(validation.error || '密码验证失败');
      return;
    }

    // 检查两次密码是否一致
    if (newPassword !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await apiFetch('/api/set-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: newPassword }),
      });

      if (response.success) {
        showToast('密码修改成功', 'success');
        onSuccess();
        onClose();
      } else {
        setError(response.message || '密码修改失败');
      }
    } catch (error) {
      setError(error.message || '密码修改失败');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleConfirm();
    }
  };

  if (!visible) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4"
        style={{ zIndex: 9000 }}
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <div className="bg-white/90 dark:bg-neutral-800/90 backdrop-blur-xl rounded-3xl shadow-2xl w-full max-w-md transform transition-all">
          {/* Header */}
          <div className="flex items-center gap-3 p-6 border-b border-white/20 dark:border-neutral-700/50">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-pink-600 flex items-center justify-center">
              <Lock size={20} className="text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-semibold text-theme">修改 WebUI 密码</h3>
              <p className="text-sm text-theme-secondary mt-0.5">请输入新密码</p>
            </div>
            <button
              onClick={onClose}
              className="text-theme-hint hover:text-theme transition-colors"
            >
              <X size={24} />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-4">
            {/* 错误提示 */}
            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400 text-sm">
                {error}
              </div>
            )}

            {/* 新密码 */}
            <div>
              <label className="block text-sm font-medium text-theme-secondary mb-2">
                新密码
              </label>
              <div className="relative">
                <input
                  ref={inputRef}
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    setError('');
                  }}
                  onKeyPress={handleKeyPress}
                  placeholder="请输入新密码（支持数字、字母、符号）"
                  className="input-field pr-12"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-hint hover:text-theme transition-colors"
                >
                  {showNewPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              <p className="text-xs text-theme-muted mt-1">密码长度至少6位</p>
            </div>

            {/* 确认密码 */}
            <div>
              <label className="block text-sm font-medium text-theme-secondary mb-2">
                确认密码
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setError('');
                  }}
                  onKeyPress={handleKeyPress}
                  placeholder="请再次输入新密码"
                  className="input-field pr-12"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-hint hover:text-theme transition-colors"
                >
                  {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-6 border-t border-white/20 dark:border-neutral-700/50">
            <button
              onClick={onClose}
              disabled={loading}
              className="px-6 py-2.5 text-theme-secondary hover:bg-theme-item rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              取消
            </button>
            <button
              onClick={handleConfirm}
              disabled={loading || !newPassword.trim() || !confirmPassword.trim()}
              className="px-6 py-2.5 gradient-primary text-white rounded-lg font-medium hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none"
            >
              {loading ? '修改中...' : '确定修改'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default ChangePasswordDialog;
