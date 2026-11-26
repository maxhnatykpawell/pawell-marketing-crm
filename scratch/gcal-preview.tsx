/**
 * Пісочниця картки Google Календаря та діалогу міту. «Сервер» — підміна fetch у
 * пам'яті, нічого не пишеться й нікуди не йде.
 * Запуск: npx vite --port 5199 → http://localhost:5199/scratch/gcal-preview.html
 *   ?state=disconnected | connected (за замовчуванням) | reconnect | unconfigured
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import { AppContext } from '../src/App';
import GoogleCalendarCard from '../src/components/GoogleCalendarCard';

const avatar = (hue: number, l: string) => 'data:image/svg+xml;utf8,' + encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80'><rect width='80' height='80' fill='hsl(${hue},60%,55%)'/><text x='40' y='54' font-size='38' fill='white' text-anchor='middle' font-family='sans-serif'>${l}</text></svg>`);
const users = [
  { id: 'u1', name: 'Максим Гнатик', email: 'max@x.com', avatar: avatar(220, 'М') },
  { id: 'u2', name: 'Ірина Блюс', email: 'ira@x.com', avatar: avatar(340, 'І') },
  { id: 'u3', name: 'Марек Новак', avatar: avatar(140, 'М') },
];

const mode = new URLSearchParams(location.search).get('state') || 'connected';
const base = {
  configured: mode !== 'unconfigured', connected: mode === 'connected' || mode === 'reconnect', email: 'max@gmail.com',
  needsReconnect: mode === 'reconnect', syncTasks: true, syncEvents: true, lastSyncAt: new Date(Date.now() - 7 * 60000).toISOString(),
  lastError: mode === 'reconnect' ? 'Доступ відкликано' : null, syncing: false, redirectUri: 'https://crm.example.com/api/google/callback',
};

const realFetch = window.fetch.bind(window);
window.fetch = async (input: any, init?: any) => {
  const url = typeof input === 'string' ? input : input.url;
  const json = (b: any, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
  if (!url.startsWith('/api/google')) return realFetch(input, init);
  await new Promise(r => setTimeout(r, 250));
  if (url.endsWith('/status')) return json(base);
  if (url.endsWith('/meetings')) {
    const b = JSON.parse(init.body);
    return json({ id: 'x', htmlLink: 'https://calendar.google.com', meetLink: 'https://meet.google.com/abc-defg-hij', invited: b.attendeeUserIds.length + b.extraEmails.length, skipped: b.attendeeUserIds.includes('u3') ? ['Марек Новак'] : [] });
  }
  return json({ success: true, started: true, url: '#' });
};

function Preview() {
  const ctx: any = new Proxy({
    state: { users }, currentUser: { userId: 'u1', role: 'admin', name: 'Максим Гнатик', email: 'max@x.com', avatar: users[0].avatar },
    confirmAction: (_m: string, fn: () => void) => fn(),
  }, { get: (t: any, k: string) => (k in t ? t[k] : () => {}) });
  return <AppContext.Provider value={ctx}><GoogleCalendarCard /></AppContext.Provider>;
}
createRoot(document.getElementById('root')!).render(<Preview />);
