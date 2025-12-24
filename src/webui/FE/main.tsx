import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// 初始化主题 - 从 localStorage 读取
const savedTheme = localStorage.getItem('llbot-theme');
if (savedTheme) {
  try {
    const { state } = JSON.parse(savedTheme);
    if (state?.isDark) {
      document.documentElement.classList.add('dark');
    }
  } catch (e) {
    // ignore
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
