 const PART_TYPES = [
    'Датчик / Сенсор', 'Контроллер / ПЛК', 'Модуль ввода-вывода',
    'Преобразователь частоты', 'Источник питания', 'Панель оператора (HMI)',
    'Реле / Контактор', 'Кабель / Провод', 'Разъем / Клемма',
    'Выключатель / Переключатель', 'Плата / Модуль', 'Инвертор',
    'Устройство плавного пуска', 'Предохранитель', 'Двигатель / Серводвигатель', 'Прочее',
];

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function formatQty(num) {
    return num.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function parseDate(dateStr) {
    const parts = dateStr.split('.');
    if (parts.length === 3) return new Date(+parts[2], +parts[1] - 1, +parts[0]).getTime();
    return 0;
}

function showToast(message, type = 'success') {
    const container = $('#toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 2900);
}

/**
 * Загружает внешний JavaScript-файл, если он ещё не был загружен.
 * @param {string} src - путь к скрипту (например, '/js/library/xlsx.full.min.js')
 * @returns {Promise<void>}
 */
function loadScript(src) {
  return new Promise((resolve, reject) => {
    // Если скрипт с таким src уже присутствует на странице, сразу завершаем
    if (document.querySelector(`script[src="${src}"]`)) {
      return resolve();
    }
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Не удалось загрузить скрипт: ${src}`));
    document.head.appendChild(script);
  });
}
