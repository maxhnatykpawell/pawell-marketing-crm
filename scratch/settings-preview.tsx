/**
 * Пісочниця для налаштувань сповіщень.
 *
 * Заведена, щоб подивитись на новий блок «Проєкт без руху» — перемикач, поріг
 * у днях і шаблон повідомлення — не заходячи в адмінку бойового застосунку.
 * Контекст підміняємо повністю; збереження лише пишеться в консоль.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import { AppContext } from '../src/App';
import AdminSettingsPanel from '../src/components/AdminSettingsPanel';

function Harness() {
  const base: Record<string, any> = {
    state: {
      users: [], projects: [], cards: [], lists: [], tags: [], boards: [],
      personalNotifications: {
        enabled: true, notifyOnAssign: true, notifyOnOverdue: true,
        dailyDigestEnabled: true, dailyDigestTime: '08:30',
        projectIdleEnabled: true, projectIdleDays: 7,
        templates: {},
      },
    },
    currentUser: { userId: 'u1', role: 'admin', name: 'Максим', email: '', avatar: '' },
    hasEditRights: true,
    updateSettings: (updates: any) => console.log('[settings] updateSettings', JSON.stringify(updates)),
  };

  const value = new Proxy(base, {
    get: (target, key: string) => (key in target ? target[key] : () => {}),
    has: () => true,
  });

  return (
    <AppContext.Provider value={value as any}>
      <div className="bg-gray-100 min-h-screen p-6 max-w-2xl">
        <AdminSettingsPanel />
      </div>
    </AppContext.Provider>
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);
