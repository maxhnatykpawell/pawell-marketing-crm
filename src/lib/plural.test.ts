import { pluralUk, tasksWord, daysWord } from './plural';

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ ${name}\n      очікувалось: ${e}\n      отримано:    ${a}`); failures++; }
}

console.log('\nОдна форма на кожне число');
check('1', daysWord(1), 'день');
check('2', daysWord(2), 'дні');
check('3', daysWord(3), 'дні');
check('4', daysWord(4), 'дні');
check('5', daysWord(5), 'днів');
check('9', daysWord(9), 'днів');
check('0', daysWord(0), 'днів');

console.log('\nПідступний десяток: 11–14 беруть форму «багато»');
check('11', daysWord(11), 'днів');
check('12', daysWord(12), 'днів');
check('13', daysWord(13), 'днів');
check('14', daysWord(14), 'днів');
check('15', daysWord(15), 'днів');

console.log('\nДругий десяток і далі');
check('21', daysWord(21), 'день');
check('22', daysWord(22), 'дні');
check('25', daysWord(25), 'днів');
check('31', daysWord(31), 'день');
check('101', daysWord(101), 'день');
check('111', daysWord(111), 'днів');
check('112', daysWord(112), 'днів');
check('122', daysWord(122), 'дні');

console.log('\nЗадачі');
check('1 задача', tasksWord(1), 'задача');
check('2 задачі', tasksWord(2), 'задачі');
check('5 задач', tasksWord(5), 'задач');
check('11 задач', tasksWord(11), 'задач');
check('21 задача', tasksWord(21), 'задача');

console.log('\nЩо не має ламати правило');
check('дробове рахується за цілою частиною', pluralUk(1.7, 'а', 'б', 'в'), 'а');
check('від\'ємне не міняє форму', pluralUk(-2, 'а', 'б', 'в'), 'б');

console.log(failures === 0 ? '\n✅ Усі перевірки пройдено\n' : `\n❌ Провалено: ${failures}\n`);
process.exit(failures === 0 ? 0 : 1);
