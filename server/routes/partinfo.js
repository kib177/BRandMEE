const express = require('express');
const router = express.Router();
const https = require('https');

const REQUEST_OPTIONS = {
  headers: {
    'User-Agent': 'WarehouseApp/1.0'
  }
};

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, REQUEST_OPTIONS, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject)
      .setTimeout(7000, () => reject(new Error('Таймаут')));
  });
}

// Поиск в LCSC (публичный API)
async function searchLCSC(partNumber) {
  const url = `https://wmsc.lcsc.com/wmsc/search/global?keyword=${encodeURIComponent(partNumber)}&pageSize=1`;
  const data = await httpsGet(url);
  const json = JSON.parse(data);
  if (json.result && json.result.length > 0) {
    const item = json.result[0];
    const desc = item.description || '';
    const title = item.productName || item.title || partNumber;
    return {
      found: true,
      source: 'lcsc',
      title: title,
      description: desc,
      pageUrl: `https://www.lcsc.com/product-detail/_${item.productId}.html`,
      image: item.productImage ? `https://assets.lcsc.com/images/lcsc/180x180/${item.productImage}` : null
    };
  }
  return null;
}

// Основной поиск
router.get('/:searchTerm', async (req, res) => {
  const searchTerm = req.params.searchTerm.trim();
  console.log(`[partinfo] Поиск: "${searchTerm}"`);

  if (!searchTerm) return res.status(400).json({ error: 'Пустой запрос' });

  try {
    // 1. Wikipedia
    const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(searchTerm)}&format=json&srlimit=1&origin=*`;
    const wikiData = await httpsGet(wikiUrl);
    const wikiJson = JSON.parse(wikiData);
    if (wikiJson.query && wikiJson.query.search.length > 0) {
      const page = wikiJson.query.search[0];
      const snippet = page.snippet.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim();
      return res.json({
        found: true,
        source: 'wikipedia',
        title: page.title,
        description: snippet,
        pageUrl: `https://en.wikipedia.org/?curid=${page.pageid}`
      });
    }

    // 2. Wikidata
    console.log('[partinfo] Wikipedia empty, trying Wikidata...');
    const wikidataUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(searchTerm)}&language=ru&limit=1&format=json&origin=*`;
    const wdData = await httpsGet(wikidataUrl);
    const wdJson = JSON.parse(wdData);
    if (wdJson.search && wdJson.search.length > 0) {
      const entity = wdJson.search[0];
      const description = entity.description || 'Описание отсутствует';
      return res.json({
        found: true,
        source: 'wikidata',
        title: entity.label,
        description: description,
        pageUrl: entity.url || `https://www.wikidata.org/wiki/${entity.id}`
      });
    }

    // 3. LCSC (каталог компонентов)
    console.log('[partinfo] Wikidata empty, trying LCSC...');
    const lcscResult = await searchLCSC(searchTerm);
    if (lcscResult) {
      return res.json(lcscResult);
    }

    // 4. Ничего не найдено – ссылки
    console.log('[partinfo] All sources empty');
    const encoded = encodeURIComponent(searchTerm);
    res.json({
      found: false,
      description: 'Автоматическая информация не найдена.',
      links: [
        { label: 'Поиск в Google', url: `https://www.google.com/search?q=${encoded}+datasheet` },
        { label: 'Поиск на Octopart', url: `https://octopart.com/search?q=${encoded}` },
        { label: 'Поиск на LCSC', url: `https://www.lcsc.com/search?q=${encoded}` }
      ]
    });
  } catch (err) {
    console.error('[partinfo] Error:', err.message);
    res.status(502).json({ error: 'Ошибка поиска' });
  }
});

module.exports = router;
