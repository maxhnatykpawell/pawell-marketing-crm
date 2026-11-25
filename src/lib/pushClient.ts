/**
 * Пуш-сповіщення на боці браузера: стан, увімкнення, вимкнення.
 *
 * Дозвіл просимо лише по кліку людини (так вимагають браузери, і так чесніше).
 * На iPhone пуші працюють тільки для застосунку, доданого на головний екран
 * (iOS 16.4+); у звичайній вкладці Safari цього API просто немає, тому
 * окремо розпізнаємо цей випадок, щоб підказати, що робити.
 */
import { getPushKey, savePushSubscription, removePushSubscription } from '../api';

export type PushState =
  | 'unsupported'      // браузер не вміє
  | 'ios-install'      // iPhone/iPad: спершу додайте застосунок на головний екран
  | 'server-off'       // на сервері не задані ключі
  | 'denied'           // людина заборонила в налаштуваннях браузера
  | 'off'              // можна вмикати
  | 'on';              // увімкнено на цьому пристрої

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;

const hasApi = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

export async function getPushState(): Promise<PushState> {
  if (!hasApi()) return isIos() && !isStandalone() ? 'ios-install' : 'unsupported';
  const { enabled } = await getPushKey().catch(() => ({ enabled: false }));
  if (!enabled) return 'server-off';
  if (Notification.permission === 'denied') return 'denied';
  const sub = await currentSubscription();
  return Notification.permission === 'granted' && sub ? 'on' : 'off';
}

/** Попросити дозвіл і підписати цей пристрій. Кидає помилку з текстом для людини. */
export async function enablePush(): Promise<void> {
  if (!hasApi()) throw new Error('Цей браузер не підтримує сповіщення');
  const { enabled, publicKey } = await getPushKey();
  if (!enabled || !publicKey) throw new Error('Сповіщення ще не налаштовані на сервері');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Дозвіл не надано. Його можна ввімкнути в налаштуваннях браузера для цього сайту.');
  }
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    }));
  await savePushSubscription(sub.toJSON());
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  await removePushSubscription(sub.endpoint).catch(() => {});
  await sub.unsubscribe();
}

/**
 * Після входу: якщо дозвіл уже є, закріплюємо підписку за поточним користувачем.
 * Потрібно, коли на одному пристрої заходять різні люди, і після очищення бази підписок.
 * Нічого не питає в людини.
 */
export async function resyncPush(): Promise<void> {
  try {
    if (!hasApi() || Notification.permission !== 'granted') return;
    const sub = await currentSubscription();
    if (sub) await savePushSubscription(sub.toJSON());
  } catch { /* тихо: це лише підтримка актуальності */ }
}
