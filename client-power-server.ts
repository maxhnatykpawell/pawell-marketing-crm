/**
 * Ручні оцінки для тірування клієнтів Pawell Power.
 *
 * Потенціал на рік, розмір контракту й глибина акаунта в CRM відсутні, тож їх
 * вводять люди. Зберігаємо ОКРЕМО від спільного стану застосунку: кожен клієнт —
 * власний документ, а запис іде точково (PUT одного клієнта). Через спільний
 * стан (повний POST /api/state) застаріла вкладка могла б мовчки відкотити чужі
 * оцінки — саме цього уникаємо.
 *
 * Колекція crm_client_power не входить до ATOMIC_COLLECTIONS, тож getDb/saveDb її
 * не чіпають. Без Firestore оцінки лежать у локальному файлі client-power.json.
 */

import { Express, Request, RequestHandler } from 'express';
import fs from 'fs';
import path from 'path';
import type admin from 'firebase-admin';

import { sanitizePowerInput, isEmptyPowerInput, type ClientPowerInput } from './src/lib/clientPower';

export interface ClientPowerDeps {
  requireAuth: RequestHandler;
  getFirestore: () => admin.firestore.Firestore | null;
  /** Ім'я автора правки для підпису «хто й коли оцінив» */
  getUserName: (userId: string) => Promise<string | null>;
  localDir: string;
}

export interface ClientPowerRecord extends ClientPowerInput {
  updatedAt: string;
  updatedBy: string | null;
}

const COLLECTION = 'crm_client_power';

/** id клієнта йде в шлях документа Firestore: «/» і «..» вивели б запис за межі колекції */
function assertSafeId(id: string): void {
  if (!id || id.includes('/') || id.includes('..') || id.length > 200) {
    throw new Error('Некоректний ідентифікатор клієнта');
  }
}

export function registerClientPowerRoutes(app: Express, deps: ClientPowerDeps): void {
  const { requireAuth } = deps;
  const file = path.join(deps.localDir, 'client-power.json');

  const readLocal = (): Record<string, ClientPowerRecord> => {
    try {
      if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch { /* побитий файл не має валити аналітику */ }
    return {};
  };
  const writeLocal = (data: Record<string, ClientPowerRecord>) => {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, file);
  };

  app.get('/api/client-power', requireAuth, async (_req, res) => {
    try {
      const db = deps.getFirestore();
      if (db) {
        const snap = await db.collection(COLLECTION).get();
        const items: Record<string, ClientPowerRecord> = {};
        snap.docs.forEach(d => { items[d.id] = d.data() as ClientPowerRecord; });
        res.json({ items });
        return;
      }
      res.json({ items: readLocal() });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /** Зберегти оцінку одного клієнта. Порожня оцінка — видаляє запис. */
  app.put('/api/client-power/:clientId', requireAuth, async (req: Request, res) => {
    try {
      const clientId = String(req.params.clientId);
      assertSafeId(clientId);

      // Тілу запиту не довіряємо: усе, що не впізнали, відкидається
      const input = sanitizePowerInput(req.body);

      const db = deps.getFirestore();
      if (isEmptyPowerInput(input)) {
        if (db) await db.collection(COLLECTION).doc(clientId).delete();
        else { const d = readLocal(); delete d[clientId]; writeLocal(d); }
        res.json({ item: null });
        return;
      }

      const userId = (req as any).user?.userId as string | undefined;
      const record: ClientPowerRecord = {
        ...input,
        updatedAt: new Date().toISOString(),
        updatedBy: userId ? (await deps.getUserName(userId).catch(() => null)) ?? userId : null,
      };

      // set без merge: запис — це повна оцінка, і прибране поле має зникнути, а не лишитись зі старим значенням
      if (db) await db.collection(COLLECTION).doc(clientId).set(record);
      else { const d = readLocal(); d[clientId] = record; writeLocal(d); }

      res.json({ item: record });
    } catch (e: any) {
      const bad = /Некоректний/.test(e.message);
      res.status(bad ? 400 : 500).json({ error: e.message });
    }
  });
}
