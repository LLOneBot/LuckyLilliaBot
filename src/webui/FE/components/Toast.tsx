import React, { useEffect, useState } from 'react';
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
      setTimeout(onClose, 300); // 等待动画完成
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const icons = {
    success: <CheckCircle className="w-5 h-5" />,
    error: <XCircle className="w-5 h-5" />,
    warning: <AlertCircle className="w-5 h-5" />,
  };

  const colors = {
    success: 'bg-green-50/90 backdrop-blur-md border-green-200/50 text-green-800',
    error: 'bg-red-50/90 backdrop-blur-md border-red-200/50 text-red-800',
    warning: 'bg-yellow-50/90 backdrop-blur-md border-yellow-200/50 text-yellow-800',
  };

  return (
    <div
      className={`fixed top-4 right-4 z-[9999] flex items-center gap-3 px-4 py-3 rounded-2xl border shadow-lg transition-all duration-300 ${
        colors[type]
      } ${isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}`}
      style={{ minWidth: '300px', maxWidth: '500px' }}
    >
      <div className="flex-shrink-0">{icons[type]}</div>
      <p className="flex-1 text-sm font-medium">{message}</p>
      <button
        onClick={() => {
          setIsVisible(false);
          setTimeout(onClose, 300);
        }}
        className="flex-shrink-0 hover:opacity-70 transition-opacity"
      >
        <X size={18} />
      </button>
    </div>
  );
};

// Toast 管理器
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

  return (
    <>
      {toastList.map((toast, index) => (
        <div key={toast.id} style={{ top: `${1 + index * 4.5}rem` }} className="fixed right-4 z-[9999]">
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
};

export default Toast;
