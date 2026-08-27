// layout.js – подгрузка общей шапки
(async function loadLayout() {
    try {
        const res = await fetch('/partials/header.html');
        if (!res.ok) throw new Error('Не удалось загрузить шапку');
        const html = await res.text();

        // Вставляем шапку сразу после открывающего body
        const temp = document.createElement('div');
        temp.innerHTML = html;
        const header = temp.firstElementChild;
        document.body.prepend(header);

        // После вставки вызываем функции, которые используют элементы шапки
        if (typeof updateAuthUI === 'function') updateAuthUI();
        if (typeof injectMenu === 'function') injectMenu();
        if (typeof updateDate === 'function') updateDate();
    } catch (e) {
        console.warn('Не удалось загрузить общую шапку:', e);
    }
})();