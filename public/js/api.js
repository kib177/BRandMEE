 const API_BASE = '/api/inventory';

async function apiFetch(url, options = {}) {
    const res = await apiFetch(url, {
        ...options,
        headers: {
            ...options.headers,
            'Authorization': `Bearer ${getToken()}`
        }
    });
    if (res.status === 401) {
        logout();
        throw new Error('Сессия истекла. Пожалуйста, войдите заново.');
    }
    return res;
}

async function fetchInventory() {
    const res = await apiFetch(API_BASE);
    if (!res.ok) throw new Error('Ошибка загрузки');
    return res.json();
}

async function saveItem(item) {
    await apiFetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify(item)
    });
}

async function importExcelFile(file) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await apiFetch('/api/inventory/import-excel', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${getToken()}` },
    body: formData
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Ошибка импорта Excel');
  }
  return res.json();
}

async function saveBulkItems(items) {
    await apiFetch(`${API_BASE}/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify(items)
    });
}

async function deleteItem(code) {
    await apiFetch(`${API_BASE}/${code}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getToken()}` }
    });
}

async function deleteAllItems() {
    await apiFetch(API_BASE, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getToken()}` }
    });
}

async function verifyPassword(password) {
    const res = await apiFetch(`${API_BASE}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
    });
    if (!res.ok) throw new Error('Неверный пароль');
    return res.json();
}

async function importCSVFile(file) {
    const formData = new FormData();
    formData.append('file', file);
    const res = await apiFetch(`${API_BASE}/import-csv`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}` },
        body: formData
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Ошибка импорта');
    }
    return res.json();
}
