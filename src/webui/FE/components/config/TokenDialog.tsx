import React, { useState, useEffect, useRef } from 'react';
import { X, Eye, EyeOff } from 'lucide-react';
import { validatePassword } from '../../utils/passwordValidation';

interface TokenDialogProps {
  visible: boolean;
  onConfirm: (password: string) => void;
  onClose?: () => void;
  error?: string;
}

const TokenDialog: React.FC<TokenDialogProps> = ({ visible, onConfirm, onClose, error }) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [validationError, setValidationError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (visible && inputRef.current) {
      // 对话框打开时自动聚焦输入框
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [visible]);

  useEffect(() => {
    if (visible) {
      // 重置密码输入
      setPassword('');
      setShowPassword(false);
      setValidationError('');
    }
  }, [visible]);

  const handleConfirm = () => {
    const validation = validatePassword(password);
    if (!validation.isValid) {
      setValidationError(validation.error || '密码验证失败');
      return;
    }
    
    setValidationError('');
    onConfirm(password.trim());
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleConfirm();
    }
  };

  // 阻止ESC键关闭
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

  if (!visible) return null;

  return (
    <>
      {/* Backdrop - 点击不关闭 */}
      <div 
        className="fixed inset-0 scrim flex items-center justify-center p-4"
        style={{ zIndex: 9000 }}
        onClick={(e) => e.target === e.currentTarget && onClose?.()}
      >
        {/* Dialog */}
        <div className="glass glass-thick r-window glass-pop w-full max-w-md">
          {/* Header */}
          <div className="flex items-center justify-between p-6 hairline-b">
            <h3 className="text-xl font-semibold text-theme">{error || 'WebUI 密码'}</h3>
            {onClose && (
              <button
                onClick={onClose}
                className="text-theme-hint hover:text-theme transition-colors"
              >
                <X size={24} />
              </button>
            )}
          </div>

          {/* Body */}
          <div className="p-6">
            <div className="space-y-2">
              <div className="relative">
                <input
                  ref={inputRef}
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    // 清除验证错误
                    if (validationError) setValidationError('');
                  }}
                  onKeyPress={handleKeyPress}
                  placeholder="请输入密码（支持数字、字母、符号）"
                  className={`input-field pr-12 ${
                    validationError 
                      ? 'border-[var(--sys-red)]' 
                      : ''
                  }`}
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-hint hover:text-theme transition-colors"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              {validationError && (
                <p className="text-sm text-red-500 px-1">
                  {validationError}
                </p>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-6 hairline-t">
            {onClose && (
              <button
                onClick={onClose}
                className="btn-glass"
              >
                取消
              </button>
            )}
            <button
              onClick={handleConfirm}
              disabled={!password.trim()}
              className="px-6 py-2.5 btn-primary font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              确定
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default TokenDialog;
