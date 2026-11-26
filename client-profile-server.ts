/**
 * Власні дані про клієнта (зараз — відповідальний за клієнта) поверх знімка KeepInCRM.
 *
 * Лежать ОКРЕМО від знімка LTV: синхронізація з KeepInCRM переписує клієнтів цілком, і все,
 * що ми вели б у самих записах клієнтів, зникало б при наступному прогоні. Тут кожен клієнт —
 * власний документ, який синхронізація не чіпає, а запис іде точково (PUT одного клієнта),
 * тож застаріла вкладка не відкотить чужі призначення.
 *
 * Колекція crm_client_profiles не входить до ATOMIC_COLLECTIONS, тож getDb/saveDb її не чіпають.
 * Без Firestore дані лежать у локальному файлі client-profiles.json.
 */

import { Express, Request, RequestHandler } from 'express';
import fs from 'fs';
import path from 'path';
import type admin from 'firebase-admin';

import {
  sanitizeClientProfile, isEmptyClientProfile, type ClientProfileRecord,
} from './src/lib/clientProfile';

export interface ClientProfileDeps {
  requireAuth: RequestHandler;
  getFirestore: () => admin.firestore.Firestore | null;
  /** Користувачі команди: відповідальним може бути лише хтось із них */
  getUsers: () => Promise<{ id: string; name: string }[]>;
  localDir: string;
}

const COLLECTION = 'crm_client_profiles';

/** id клієнта йде в шлях документа Firestore: «/» і «..» вивели б запис за межі колекції */
function assertSafeId(id: string): void {
  if (!id || id.includes('/') || id.includes('..') || id.length > 200) {
    throw new Error('Некоректний ідентифікатор клієнта');
  }
}

export function registerClientProfileRoutes(app: Express, deps: ClientProfileDeps): void {
  const { requireAuth } = deps;
  const file = path.join(deps.localDir, 'client-profiles.json');

  const readLocal = (): Record<string, ClientProfileRecord> => {
    try {
      if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch { /* побитий файл не має валити аналітику */ }
    return {};
  };
  const writeLocal = (data: Record<string, ClientProfileRecord>) => {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, file);
  };

  app.get('/api/client-profiles', requireAuth, async (_req, res) => {
    try {
      const db = deps.getFirestore();
      if (db) {
        const snap = await db.collection(COLLECTION).get();
        const items: Record<string, ClientProfileRecord> = {};
        snap.docs.forEach(d => { items[d.id] = d.data() as ClientProfileRecord; });
        res.json({ items });
        return;
      }
      res.json({ items: readLocal() });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /** Зберегти профіль одного клієнта. Порожній профіль — прибирає наше призначення (лишається те, що в KeepInCRM). */
  app.put('/api/client-profiles/:clientId', requireAuth, async (req: Request, res) => {
    try {
      const clientId = String(req.params.clientId);
      assertSafeId(clientId);

      // Тілу запиту не довіряємо: усе, що не впізнали, відкидається
      const profile = sanitizeClientProfile(req.body);

      // Відповідальним може бути лише існуючий користувач команди
      if (profile.responsibleUserId) {
        const known = await deps.getUsers();
        if (!known.some(u => u.id === profile.responsibleUserId)) {
          res.status(400).json({ error: 'Невідомий користувач: відповідальним може бути лише хтось із команди' });
          return;
        }
      }

      const db = deps.getFirestore();
      if (isEmptyClientProfile(profile)) {
        if (db) await db.collection(COLLECTION).doc(clientId).delete();
        else { const d = readLocal(); delete d[clientId]; writeLocal(d); }
        res.json({ item: null });
        return;
      }

      const userId = (req as any).user?.userId as string | undefined;
      const known = userId ? (await deps.getUsers()).find(u => u.id === userId) : null;
      const record: ClientProfileRecord = {
        ...profile,
        updatedAt: new Date().toISOString(),
        updatedBy: known?.name ?? userId ?? null,
      };

      // set без merge: запис — це повний профіль, і прибране поле має зникнути, а не лишитись зі старим значенням
      if (db) await db.collection(COLLECTION).doc(clientId).set(JSON.parse(JSON.stringify(record)));
      else { const d = readLocal(); d[clientId] = record; writeLocal(d); }

      res.json({ item: record });
    } catch (e: any) {
      const bad = /Некоректний/.test(e.message);
      res.status(bad ? 400 : 500).json({ error: e.message });
    }
  });
}
