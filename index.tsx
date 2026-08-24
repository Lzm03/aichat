import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './globals.css';
import { readAuthSession } from './utils/auth';
import { DEFAULT_USER_PREFERENCES, normalizeUserPreferences, syncDarkClass } from './utils/userPreferences';

// 渲染前先同步深色主題（防深色用戶看到白閃）
const prefs = normalizeUserPreferences(readAuthSession()?.user?.preferences || DEFAULT_USER_PREFERENCES);
syncDarkClass(prefs);

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
