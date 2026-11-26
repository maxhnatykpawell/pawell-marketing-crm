import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import StartupSplash from './components/brand/StartupSplash';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    {/* Поверх застосунку, який у цей час уже вантажиться: заставка нічого не затримує */}
    <StartupSplash />
  </StrictMode>,
);

// Service worker — лише у збірці: у dev він заважав би гарячому оновленню
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => console.warn('SW не зареєстровано:', err));
  });
}
