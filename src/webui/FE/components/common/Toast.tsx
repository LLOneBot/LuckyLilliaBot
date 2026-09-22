import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle, XCircle, AlertCircle, X } from 'lucide-react';

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'warning';
  duration?: number;
  onClose: () => void;
}

const Toast: React.FC<ToastProps> = ({ message, type = 'success', duration = 3000, onClose }) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onClose, 300);
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const icons = {
    success: <CheckCircle className="w-5 h-5" />,
    error: <XCircle className="w-5 h-5" />,
    warning: <AlertCircle className="w-5 h-5" />,
  };

  // Liquid Glass keeps the sheet colorless; only the icon carries status.
  const iconColor = {
    success: 'text-[var(--sys-green)]',
    error: 'text-[var(--sys-red)]',
    warning: 'text-[var(--sys-orange)]',
  };

  return (
    <div
      className={`fixed top-4 right-4 flex items-center gap-3 px-4 py-3 glass glass-thick r-card text-theme transition-all duration-300 ${
        isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
      }`}
      style={{ minWidth: '300px', maxWidth: '500px', zIndex: 99999 }}
    >
      <div className={`flex-shrink-0 ${iconColor[type]}`}>{icons[type]}</div>
      <p className="flex-1 text-sm font-medium">{message}</p>
      <button
        onClick={() => {
          setIsVisible(false);
          setTimeout(onClose, 300);
        }}
        className="flex-shrink-0 text-theme-muted hover:text-theme transition-colors"
      >
        <X size={18} />
      </button>
    </div>
  );
};

interface ToastItem {
  id: number;
  message: string;
  type: 'success' | 'error' | 'warning';
  duration?: number;
}

let toastId = 0;
const toastListeners: ((toasts: ToastItem[]) => void)[] = [];
let toasts: ToastItem[] = [];

const notifyListeners = () => {
  toastListeners.forEach(listener => listener([...toasts]));
};

export const showToast = (message: string, type: 'success' | 'error' | 'warning' = 'success', duration = 3000) => {
  const id = toastId++;
  toasts.push({ id, message, type, duration });
  notifyListeners();
};

export const ToastContainer: React.FC = () => {
  const [toastList, setToastList] = useState<ToastItem[]>([]);

  useEffect(() => {
    const listener = (newToasts: ToastItem[]) => setToastList(newToasts);
    toastListeners.push(listener);
    return () => {
      const index = toastListeners.indexOf(listener);
      if (index > -1) toastListeners.splice(index, 1);
    };
  }, []);

  const removeToast = (id: number) => {
    toasts = toasts.filter(t => t.id !== id);
    notifyListeners();
  };

  const content = (
    <>
      {toastList.map((toast, index) => (
        <div key={toast.id} style={{ top: `${1 + index * 4.5}rem`, zIndex: 99999 }} className="fixed right-4">
          <Toast
            message={toast.message}
            type={toast.type}
            duration={toast.duration}
            onClose={() => removeToast(toast.id)}
          />
        </div>
      ))}
    </>
  );

  return createPortal(content, document.body);
};

export default Toast;
