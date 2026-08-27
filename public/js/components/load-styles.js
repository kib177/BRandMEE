// load-styles.js – автоматическое подключение всех CSS и манифеста
(function() {
    // Массив CSS-файлов (порядок важен)
    const cssFiles = [
        '/css/base.css',
        '/css/layout.css',
        '/css/components.css',
        '/css/utilities.css',
        '/css/mobile.css',
        '/css/burger.css'
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