/**
 * Бекап Firestore у локальні JSON-файли.
 *
 * ТІЛЬКИ ЧИТАННЯ: скрипт нічого не пише в базу й не запускає сервер чи cron.
 * Бере облікові дані з .env.local / .env (ті самі, що й у застосунку), обходить
 * усі колекції верхнього рівня і складає їх у backups/<мітка часу>/<колекція>.json.
 *
 * Запуск: npm run backup
 *
 * Увага: у бекапі є хеші паролів (crm/auth) та персональні дані команди й клієнтів.
 * Папка backups/ в .gitignore — не комітьте її й не пересилайте відкритими каналами.
 */
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import admin from 'firebase-admin';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: true });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

if (!projectId || !clientEmail || !privateKey) {
  console.error('❌ Немає FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY у .env.local.');
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert({ projectId, clientEmail, privateKey }) });
const db = admin.firestore();

/** Firestore-типи (Timestamp, GeoPoint, посилання) → звичайний JSON */
function toPlain(value: any): any {
  if (value === null || value === undefined) return value;
  if (value instanceof admin.firestore.Timestamp) return { __type: 'timestamp', iso: value.toDate().toISOString() };
  if (value instanceof admin.firestore.GeoPoint) return { __type: 'geopoint', lat: value.latitude, lng: value.longitude };
  if (value instanceof admin.firestore.DocumentReference) return { __type: 'ref', path: value.path };
  if (Buffer.isBuffer(value)) return { __type: 'bytes', base64: value.toString('base64') };
  if (Array.isArray(value)) return value.map(toPlain);
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toPlain(v)]));
  }
  return value;
}

async function dumpCollection(col: admin.firestore.CollectionReference, withSubcollections: boolean): Promise<any[]> {
  const snap = await col.get();
  const out: any[] = [];
  for (const doc of snap.docs) {
    const entry: any = { id: doc.id, data: toPlain(doc.data()) };
    if (withSubcollections) {
      const subs = await doc.ref.listCollections();
      if (subs.length) {
        entry.subcollections = {};
        for (const sub of subs) entry.subcollections[sub.id] = await dumpCollection(sub, true);
      }
    }
    out.push(entry);
  }
  return out;
}

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.resolve(process.cwd(), 'backups', stamp);
  fs.mkdirSync(dir, { recursive: true });

  const collections = await db.listCollections();
  const summary: Record<string, number> = {};

  for (const col of collections) {
    // Піддокументи обходимо лише в «crm» (там налаштування/авторизація): у великих колекціях це зайві читання
    const docs = await dumpCollection(col, col.id === 'crm');
    fs.writeFileSync(path.join(dir, `${col.id}.json`), JSON.stringify(docs, null, 2), 'utf-8');
    summary[col.id] = docs.length;
    console.log(`  ${col.id}: ${docs.length}`);
  }

  fs.writeFileSync(
    path.join(dir, '_manifest.json'),
    JSON.stringify({ createdAt: new Date().toISOString(), projectId, collections: summary }, null, 2),
    'utf-8',
  );
  console.log(`\n✅ Бекап збережено: ${dir}`);
}

main().then(() => process.exit(0)).catch(err => {
  console.error('❌ Помилка бекапу:', err.message || err);
  process.exit(1);
});
