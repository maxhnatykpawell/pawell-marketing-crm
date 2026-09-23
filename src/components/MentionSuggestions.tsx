import React from 'react';
import { MentionUser } from '../lib/mentions';

/** Рівно те, що треба намалювати рядок підказки — не весь профіль */
type SuggestedUser = MentionUser & { avatar?: string };

/**
 * Список підказок під час набору @-згадки.
 *
 * Один віджет на чат і на коментарі до картки: якби кожне поле мало власний,
 * вони б розійшлись у дрібницях — де обриває список, чи видно аватар, — і
 * людина щоразу вгадувала б наново, як тут кликати колегу.
 */
export default function MentionSuggestions({
  users, onPick, align = 'bottom',
}: {
  users: SuggestedUser[];
  onPick: (name: string) => void;
  /** 'bottom' — список над полем (поле внизу екрана), 'top' — під полем */
  align?: 'bottom' | 'top';
}) {
  if (users.length === 0) return null;

  return (
    <div
      className={`absolute left-0 w-56 bg-white border border-gray-200 rounded-xl shadow-lg py-1 z-20 ${
        align === 'bottom' ? 'bottom-full mb-2' : 'top-full mt-1'
      }`}
    >
      {users.map(u => (
        <button
          key={u.id}
          type="button"
          // onMouseDown, а не onClick: клік знімає фокус із поля раніше, ніж
          // спрацює обробник, і підказка зникає, не встигнувши підставити ім'я
          onMouseDown={e => { e.preventDefault(); onPick(u.name); }}
          className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-blue-50 transition text-left"
        >
          {u.avatar
            ? <img src={u.avatar} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" />
            : <span className="w-5 h-5 rounded-full bg-gray-200 text-[10px] font-bold text-gray-600 flex items-center justify-center shrink-0">
                {u.name.charAt(0).toUpperCase()}
              </span>}
          <span className="text-sm text-gray-700 truncate">{u.name}</span>
        </button>
      ))}
    </div>
  );
}
