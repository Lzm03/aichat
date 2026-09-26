import React from 'react';
import ReactDOM from 'react-dom/client';
import { MotionConfig } from 'framer-motion';
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
    {/*
      One place to honour the OS "reduce motion" setting: every framer-motion
      transform/layout animation in the app (47 files) is covered here instead of
      each component reading useReducedMotion itself. Opacity still animates —
      that is framer-motion's intended behaviour for reducedMotion="user".
    */}
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </React.StrictMode>
);
