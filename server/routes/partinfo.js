const express = require('express');
const router = express.Router();
const https = require('https');

// GET /api/part-info/:searchTerm – поиск информации в Wikipedia по любому термину (артикул, название)
router.get('/:searchTerm', (req, res) => {
  const searchTerm = req.params.searchTerm;
  console.log(`[partinfo] Поиск в Wikipedia: "${searchTerm}"`);

  if (!searchTerm || searchTerm.trim().length === 0) {
    return res.status(400).json({ error: 'Пустой поисковый запрос' });
  }

  const wikiApiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(searchTerm.trim())}&format=json&utf8=1&srlimit=1&origin=*`;

  const request = https.get(wikiApiUrl, (wikiRes) => {
    let data = '';
    wikiRes.on('data', chunk => data += chunk);
    wikiRes.on('end', () => {
      console.log(`[partinfo] Получен ответ от Wikipedia, длина: ${data.length}`);
      try {
        const json = JSON.parse(data);
        if (!json.query || !json.query.search.length) {
          console.log('[partinfo] Wikipedia ничего не нашла');
          return res.json({ found: false, description: 'Информация не найдена' });
        }

        const page = json.query.search[0];
        const snippet = page.snippet
          .replace(/<[^>]+>/g, '')
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
          .trim();

        console.log(`[partinfo] Найдена статья: ${page.title}`);
        res.json({
          found: true,
          title: page.title,
          description: snippet,
          pageUrl: `https://en.wikipedia.org/?curid=${page.pageid}`
        });
      } catch (e) {
        console.error('[partinfo] Ошибка парсинга JSON:', e.message);
        res.status(500).json({ error: 'Ошибка обработки данных Wikipedia' });
      }
    });
  });

  request.on('error', (err) => {
    console.error('[partinfo] Ошибка сети при запросе к Wikipedia:', err.message);
    res.status(502).json({ error: 'Не удалось связаться с Википедией' });
  });

  request.setTimeout(5000, () => {
    console.error('[partinfo] Таймаут запроса к Wikipedia');
    request.destroy();
    res.status(504).json({ error: 'Превышено время ожидания ответа от Wikipedia' });
  });
});

module.exports = router;
