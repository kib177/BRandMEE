// load-styles.js – автоматическое подключение всех CSS и манифеста
(function() {
    // Массив CSS-файлов (порядок важен)
    const cssFiles = [
        'public/css/base.css',
        'public/css/layout.css',
        'public/css/components.css',
        'public/css/utilities.css',
        'public/css/mobile.css',
        'public/css/burger.css'
    ];

    // Добавляем манифест
    const manifestLink = document.createElement('link');
    manifestLink.rel = 'manifest';
    manifestLink.href = '/manifest.json';
    document.head.appendChild(manifestLink);

    // Добавляем стили
    cssFiles.forEach(href => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        document.head.appendChild(link);
    });
})();