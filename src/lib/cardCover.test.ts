import {
  isImageAttachment, imageAttachments, newestImage, resolveCover, coverAfterRemoving,
} from './cardCover';

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ ${name}\n      очікувалось: ${e}\n      отримано:    ${a}`); failures++; }
}

const file = (id: string, name: string) => ({ id, name, url: `/uploads/${name}`, kind: 'file' as const });
const link = (id: string, name: string, url: string) => ({ id, name, url, kind: 'link' as const });

console.log('\nЩо може бути обкладинкою');
check('jpg', isImageAttachment(file('a', 'photo.jpg')), true);
check('PNG великими літерами', isImageAttachment(file('a', 'Shot.PNG')), true);
check('webp', isImageAttachment(file('a', 'banner.webp')), true);
check('pdf — ні', isImageAttachment(file('a', 'brief.pdf')), false);
check('файл без розширення — ні', isImageAttachment(file('a', 'scan')), false);
// У посилання немає самого файлу — лише адреса чужої сторінки
check('посилання на картинку — ні', isImageAttachment(link('a', 'photo.png', 'https://site/photo.png')), false);
// Так само, як мініатюра у списку вкладень: зовнішня адреса — це посилання,
// навіть коли вкладення позначене файлом (таке приносить імпорт з Trello)
check('файл із зовнішньою адресою — ні',
  isImageAttachment({ id: 'a', name: 'photo.png', url: 'https://cdn.site/photo.png', kind: 'file' } as any), false);

console.log('\nНайсвіжіше фото');
{
  const card = { attachments: [file('a1', 'brief.pdf'), file('a2', 'first.jpg'), file('a3', 'last.png')] } as any;
  check('лише картинки', imageAttachments(card).map(a => a.id), ['a2', 'a3']);
  check('останнє залите', newestImage(card)?.id, 'a3');
}
check('фото немає', newestImage({ attachments: [file('a1', 'brief.pdf')] } as any), null);
check('вкладень немає взагалі', newestImage({} as any), null);

console.log('\nОбкладинка картки');
// Картки, до яких фото чіпляли ще до появи обкладинок, отримують її самі
check('поля немає — беремо найсвіже фото',
  resolveCover({ attachments: [file('a1', 'one.jpg'), file('a2', 'two.jpg')] } as any)?.id, 'a2');
check('вибране фото важливіше за найсвіжіше',
  resolveCover({ attachments: [file('a1', 'one.jpg'), file('a2', 'two.jpg')], coverAttachmentId: 'a1' } as any)?.id, 'a1');
// Інакше прибрана обкладинка поверталася б сама — тому «немає» і «прибрали» різні
check('прибрали руками — обкладинки немає',
  resolveCover({ attachments: [file('a1', 'one.jpg')], coverAttachmentId: null } as any), null);
check('вибране вкладення зникло — обкладинки немає',
  resolveCover({ attachments: [file('a2', 'two.jpg')], coverAttachmentId: 'a1' } as any), null);
check('вибрали не картинку — обкладинки немає',
  resolveCover({ attachments: [file('a1', 'brief.pdf')], coverAttachmentId: 'a1' } as any), null);
check('картка без вкладень', resolveCover({} as any), null);

console.log('\nПісля видалення вкладення');
{
  const chosen = { attachments: [file('a1', 'one.jpg'), file('a2', 'two.jpg')], coverAttachmentId: 'a1' } as any;
  check('видалили вибрану обкладинку — вибір знімається',
    coverAfterRemoving(chosen, 'a1'), { coverAttachmentId: null });
  check('видалили інше вкладення — нічого не міняємо',
    coverAfterRemoving(chosen, 'a2'), undefined);
}
{
  // Обкладинка була автоматичною: наступне фото стане нею само
  const auto = { attachments: [file('a1', 'one.jpg'), file('a2', 'two.jpg')] } as any;
  check('автоматична обкладинка не потребує запису', coverAfterRemoving(auto, 'a2'), undefined);
}
check('у картки без обкладинки нічого не міняється',
  coverAfterRemoving({ attachments: [file('a1', 'brief.pdf')] } as any, 'a1'), undefined);

console.log(failures === 0 ? '\n✅ Усі перевірки пройдено\n' : `\n❌ Провалено: ${failures}\n`);
process.exit(failures === 0 ? 0 : 1);
