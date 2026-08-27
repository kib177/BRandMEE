// scanner.js – логика сканера штрихкодов (камера)

let html5QrCode = null;

function isMobileDevice() {
    return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
}

function stopScanner() {
  const scannerOverlay = document.getElementById('scannerModalOverlay');
  if (scannerOverlay) {
    scannerOverlay.classList.add('hidden');
  }

  if (html5QrCode && html5QrCode.isScanning) {
    html5QrCode.stop().then(() => {
      html5QrCode.clear();
      html5QrCode = null;
    }).catch(err => {
      console.error('Ошибка остановки сканера:', err);
      html5QrCode = null;
    });
  } else {
    html5QrCode = null;
  }

  // Очищаем контейнер
  const readerElement = document.getElementById('reader');
  if (readerElement) {
    readerElement.innerHTML = '';
  }
}

async function startScanner() {
    const readerElement = document.getElementById('reader');
    if (!readerElement) return;

    $('#scannerModalOverlay').classList.remove('hidden');

    // Динамически загружаем библиотеку при необходимости
    if (typeof Html5Qrcode === 'undefined') {
        try {
            await loadScript('/js/library/html5-qrcode.min.js');
        } catch (e) {
            showToast('Сканер временно недоступен', 'error');
            $('#scannerModalOverlay').classList.add('hidden');
            return;
        }
    }

    if (html5QrCode) {
        await html5QrCode.stop();
        html5QrCode.clear();
        readerElement.innerHTML = '';
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

    // Проверку на Html5Qrcode убираем, потому что библиотека будет загружена динамически
    // На мобильных устройствах кнопка сканера видна, на десктопе скрыта.
    if (isMobileDevice()) {
        btn.style.display = 'inline-flex';
        btn.addEventListener('click', () => {
            if (html5QrCode && html5QrCode.isScanning) {
                stopScanner();
            } else {
                startScanner();
            }
        });
    } else {
        btn.style.display = 'none';
    }
    const closeBtn = document.getElementById('btnCloseScanner');
if (closeBtn) {
  closeBtn.addEventListener('click', stopScanner);
}
}
