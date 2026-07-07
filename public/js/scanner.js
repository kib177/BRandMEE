// scanner.js – логика сканера штрихкодов (камера)

let html5QrCode = null;

function isMobileDevice() {
    return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
}

function stopScanner() {
    const readerElement = document.getElementById('reader');
    if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().then(() => {
            html5QrCode.clear();
            html5QrCode = null;
            if (readerElement) readerElement.innerHTML = '';
            $('#scannerModalOverlay').classList.add('hidden');
        }).catch(err => {
            console.error('Ошибка остановки сканера', err);
            $('#scannerModalOverlay').classList.add('hidden');
        });
    } else {
        html5QrCode = null;
        $('#scannerModalOverlay').classList.add('hidden');
    }
}

async function startScanner() {
    const readerElement = document.getElementById('reader');
    if (!readerElement) return;

    $('#scannerModalOverlay').classList.remove('hidden');

    if (html5QrCode) {
        await html5QrCode.stop();
        html5QrCode.clear();
        readerElement.innerHTML = '';
    }

    if (typeof Html5Qrcode === 'undefined') {
        showToast('Сканер временно недоступен', 'error');
        $('#scannerModalOverlay').classList.add('hidden');
        return;
    }

    html5QrCode = new Html5Qrcode("reader");
    const config = { fps: 10, qrbox: { width: 250, height: 150 } };

    const tryCamera = async (facingMode) => {
        try {
            await html5QrCode.start(
                { facingMode: facingMode },
                config,
                (decodedText) => {
                    const code = decodedText.trim();
                    html5QrCode.stop().then(() => {
                        html5QrCode.clear();
                        html5QrCode = null;
                        readerElement.innerHTML = '';
                        $('#scannerModalOverlay').classList.add('hidden');

                        $('#searchInput').value = code;
                        searchQuery = code;
                        applyFilterAndRender();

                        if (filteredInventory.length === 0) {
                            showToast('Товар с таким штрихкодом не найден', 'error');
                        } else {
                            showToast(`Найдено: ${filteredInventory[0].name}`, 'success');
                        }
                    }).catch(err => {
                        console.error(err);
                        $('#scannerModalOverlay').classList.add('hidden');
                    });
                },
                (errorMessage) => {
                    // Игнорируем некритичные ошибки
                }
            );
            return true;
        } catch (err) {
            console.warn(`Камера ${facingMode} недоступна:`, err);
            return false;
        }
    };

    const environmentSuccess = await tryCamera("environment");
    if (!environmentSuccess) {
        const userSuccess = await tryCamera("user");
        if (!userSuccess) {
            showToast('Не удалось запустить камеру. Проверьте разрешения и наличие камеры.', 'error');
            readerElement.innerHTML = '';
            $('#scannerModalOverlay').classList.add('hidden');
        }
    }
}

function initScannerButton() {
    const btn = document.getElementById('btnScan');
    if (!btn) return;

    if (typeof Html5Qrcode === 'undefined') {
        console.warn('Html5Qrcode не загружен, сканер отключён');
        return;
    }

    if (isMobileDevice()) {
        btn.style.display = 'inline-flex';
        btn.addEventListener('click', () => {
            if (html5QrCode && html5QrCode.isScanning) {
                stopScanner();
            } else {
                startScanner();
            }
            
        });
        document.getElementById('btnCloseScanner')?.addEventListener('click', stopScanner);
    } else {
        btn.style.display = 'none';
    }
}
