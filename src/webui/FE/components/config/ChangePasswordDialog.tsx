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
        className="fixed inset-0 scrim flex items-center justify-center p-4"
        style={{ zIndex: 9000 }}
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <div className="glass glass-thick r-window glass-pop w-full max-w-md">
          {/* Header */}
          <div className="flex items-center gap-3 p-6 hairline-b">
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
          <div className="flex items-center justify-end gap-3 p-6 hairline-t">
            <button
              onClick={onClose}
              disabled={loading}
              className="btn-glass disabled:opacity-50"
            >
              取消
            </button>
            <button
              onClick={handleConfirm}
              disabled={loading || !newPassword.trim() || !confirmPassword.trim()}
              className="px-6 py-2.5 btn-primary font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
