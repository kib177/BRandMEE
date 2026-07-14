const express = require('express');
const router = express.Router();
const https = require('https');

// Поиск по названию детали через Wikipedia API
router.get('/:code', (req, res) => {
  const code = req.params.code;

  // Сначала найдём точное название детали в инвентаре (можно передать и сам код)
  const db = require('../db');
  const item = db.prepare('SELECT name FROM inventory WHERE code = ?').get(code);
  if (!item) return res.status(404).json({ error: 'Деталь не найдена' });

  const searchTerm = item.name;  // Можно добавить "electronics" для уточнения

  const apiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(searchTerm)}&format=json&utf8=1&srlimit=1&origin=*`;

  https.get(apiUrl, (wikiRes) => {
    let data = '';
    wikiRes.on('data', chunk => data += chunk);
    wikiRes.on('end', () => {
      try {
        const json = JSON.parse(data);
        if (!json.query || !json.query.search.length) {
          return res.json({ found: false, description: 'Информация не найдена' });
        }

        const pageId = json.query.search[0].pageid;
        const snippet = json.query.search[0].snippet
          .replace(/<[^>]+>/g, '')        // убрать HTML-теги
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
          .trim();

        res.json({
          found: true,
          title: json.query.search[0].title,
          description: snippet,
          pageUrl: `https://en.wikipedia.org/?curid=${pageId}`
        });
      } catch (e) {
        console.error('Wikipedia parse error:', e);
        res.status(500).json({ error: 'Ошибка обработки данных' });
      }
    });
  }).on('error', (err) => {
    console.error('Wikipedia request failed:', err);
    res.status(502).json({ error: 'Не удалось связаться с Википедией' });
  });
});

module.exports = router;
