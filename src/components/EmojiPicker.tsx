import React, { useEffect, useState } from 'react';
import { Smile, Search } from 'lucide-react';

/**
 * Компактний вибір емодзі без зовнішньої залежності.
 *
 * Повний набір емодзі — це кілька сотень кілобайт даних заради жесту, який у
 * таск-трекері роблять двома-трьома символами. Тому тримаємо ручний список
 * найужиткованіших, згрупований так, як їх шукають у роботі: статус, реакція,
 * робота. Ключові слова — українською й англійською: розкладку в коментарі
 * ніхто не перемикає заради смайлика.
 */

type Emoji = [char: string, keywords: string];

const GROUPS: { name: string; emojis: Emoji[] }[] = [
  {
    name: 'Статус',
    emojis: [
      ['✅', 'готово ok done check галочка'], ['☑️', 'виконано check box'], ['❌', 'ні no cross помилка'],
      ['⚠️', 'увага warning ризик'], ['🔥', 'терміново hot fire горить'], ['⏳', 'чекаємо wait час'],
      ['⌛', 'дедлайн time час'], ['🚀', 'запуск launch реліз'], ['🎯', 'ціль goal target'],
      ['📌', 'закріпити pin важливо'], ['📍', 'місце point'], ['🔴', 'червоний red блокер'],
      ['🟠', 'жовтогарячий orange'], ['🟡', 'жовтий yellow'], ['🟢', 'зелений green ок'],
      ['🔵', 'синій blue'], ['⭐', 'зірка star важливо'], ['❗', 'важливо important'],
      ['❓', 'питання question'], ['🔒', 'закрито lock приватно'],
    ],
  },
  {
    name: 'Реакції',
    emojis: [
      ['👍', 'клас ок like палець'], ['👎', 'проти dislike'], ['👏', 'браво clap оплески'],
      ['🙌', 'ура hands'], ['🙏', 'дякую please thanks'], ['💪', 'сила strong'],
      ['🤝', 'домовились deal handshake'], ['😀', 'усмішка smile'], ['😂', 'смішно lol'],
      ['🙂', 'ок smile'], ['😉', 'підморгую wink'], ['😍', 'люблю love'],
      ['🤔', 'думаю think'], ['😅', 'ніяково sweat'], ['😐', 'нейтрально neutral'],
      ['😢', 'сумно sad'], ['😡', 'злий angry'], ['🤯', 'вибух мозку mind blown'],
      ['🥳', 'свято party'], ['😎', 'круто cool'],
    ],
  },
  {
    name: 'Робота',
    emojis: [
      ['📝', 'нотатка note опис'], ['📄', 'документ doc файл'], ['📊', 'графік chart аналітика'],
      ['📈', 'ріст growth up'], ['📉', 'падіння down'], ['📅', 'дата date календар'],
      ['🗓️', 'календар calendar'], ['⏰', 'нагадування alarm'], ['💼', 'робота work бізнес'],
      ['💰', 'гроші money бюджет'], ['💵', 'оплата payment'], ['🧾', 'рахунок invoice чек'],
      ['📢', 'анонс announce'], ['📣', 'реклама promo'], ['✉️', 'лист email пошта'],
      ['📞', 'дзвінок call'], ['💬', 'коментар chat'], ['🔗', 'посилання link'],
      ['📎', 'вкладення attach'], ['🗂️', 'проєкт folder тека'],
    ],
  },
  {
    name: 'Інше',
    emojis: [
      ['💡', 'ідея idea'], ['🛠️', 'фікс fix tools'], ['⚙️', 'налаштування settings'],
      ['🧠', 'стратегія brain'], ['👀', 'дивлюсь review eyes'], ['🎨', 'дизайн design'],
      ['🖥️', 'сайт desktop'], ['📱', 'мобільний mobile'], ['🌐', 'веб web сайт'],
      ['☕', 'перерва coffee'], ['🍀', 'удача luck'], ['🎁', 'бонус gift'],
      ['🏆', 'перемога win'], ['🔍', 'пошук search'], ['🧩', 'інтеграція puzzle'],
      ['♻️', 'повтор repeat'], ['➡️', 'далі next'], ['⬆️', 'вгору up'],
      ['⬇️', 'вниз down'], ['✨', 'нове new ші'],
    ],
  },
];

const ALL = GROUPS.flatMap(g => g.emojis);

interface Props {
  onPick: (emoji: string) => void;
  /** Куди розкривати панель — щоб вона не вилазила за межі модалки. */
  align?: 'left' | 'right';
  className?: string;
  title?: string;
}

export default function EmojiPicker({ onPick, align = 'left', className, title = 'Емодзі' }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const q = query.trim().toLowerCase();
  const filtered = q ? ALL.filter(([char, kw]) => kw.includes(q) || char === q) : null;

  const pick = (emoji: string) => { onPick(emoji); setOpen(false); setQuery(''); };

  return (
    <div className="relative inline-flex">
      <button
        type="button"
        title={title}
        onClick={() => setOpen(o => !o)}
        className={className || 'p-1.5 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-200/70 transition'}
      >
        <Smile className="w-4 h-4" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            className={`absolute top-full mt-1 z-40 w-64 bg-white rounded-xl shadow-xl border border-gray-200 p-2 ${
              align === 'right' ? 'right-0' : 'left-0'
            }`}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-1.5 px-2 py-1 mb-1.5 bg-gray-50 border border-gray-200 rounded-lg">
              <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Пошук: дедлайн, ok, ідея…"
                className="w-full bg-transparent text-xs outline-none py-0.5"
              />
            </div>

            <div className="max-h-56 overflow-y-auto hidden-scrollbar">
              {filtered ? (
                <div className="grid grid-cols-8 gap-0.5">
                  {filtered.map(([char, kw]) => renderEmoji(char, kw, pick))}
                  {filtered.length === 0 && (
                    <p className="col-span-8 text-xs text-gray-400 text-center py-3">Нічого не знайдено</p>
                  )}
                </div>
              ) : (
                GROUPS.map(group => (
                  <div key={group.name} className="mb-1.5">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-1 mb-0.5">
                      {group.name}
                    </p>
                    <div className="grid grid-cols-8 gap-0.5">
                      {group.emojis.map(([char, kw]) => renderEmoji(char, kw, pick))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Кнопка емодзі. Не компонент, щоб key лишався на самому <button>. */
function renderEmoji(emoji: string, keywords: string, onPick: (e: string) => void) {
  return (
    <button
      key={emoji}
      type="button"
      title={keywords.split(' ')[0]}
      onClick={() => onPick(emoji)}
      className="text-lg leading-none p-1 rounded-lg hover:bg-gray-100 transition"
    >
      {emoji}
    </button>
  );
}
