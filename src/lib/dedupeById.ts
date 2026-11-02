/**
 * Прибирає повтори за `id`, зберігаючи перше входження й порядок.
 *
 * Потрібно для сторінкової вибірки з CRM: запит іде без фіксованого сортування, а
 * записи під час прогону змінюються. Коли на початку списку з'являється нова
 * угода, усе зсувається на одну позицію, і останній запис попередньої сторінки
 * приходить знову першим на наступній. Без цієї перевірки така угода двічі
 * потрапляє в дохід, кількість угод і «Оплачено».
 *
 * Записи без `id` не чіпаємо: відрізнити їх повтор від двох різних записів
 * неможливо, а викинути чужі дані гірше, ніж лишити сумнівні.
 */
export function dedupeById<T>(items: T[]): { items: T[]; removed: number } {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const id = (item as { id?: unknown } | null | undefined)?.id;
    if (id === undefined || id === null) { out.push(item); continue; }
    const key = String(id);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return { items: out, removed: items.length - out.length };
}
