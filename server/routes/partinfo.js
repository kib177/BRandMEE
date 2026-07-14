const express = require('express');
const router = express.Router();
const https = require('https');
const http = require('http');

router.get('/:searchTerm', (req, res) => {
  const searchTerm = req.params.searchTerm;
  console.log(`[partinfo] Запрос инфо для: "${searchTerm}"`);

  if (!searchTerm || !searchTerm.trim()) {
    return res.status(400).json({ error: 'Пустой запрос' });
  }

  const encoded = encodeURIComponent(searchTerm.trim());
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encoded}&format=json&utf8=1&srlimit=1&origin=*`;

  const doRequest = (protocol, fullUrl) => {
    return new Promise((resolve, reject) => {
      const get = protocol === 'https' ? https.get : http.get;
      const req = get(fullUrl, (response) => {
        let data = '';
        response.on('data', chunk => data += chunk);
        response.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve(json);
          } catch (e) {
            reject(new Error('Невалидный JSON от Wikipedia'));
          }
        });
      });
      req.on('error', reject);
      req.setTimeout(5000, () => {
        req.destroy();
        reject(new Error('Таймаут'));
      });
    });
  };

  doRequest('https', url)
    .then(json => {
      if (!json.query || !json.query.search.length) {
        return res.json({ found: false, description: 'Ничего не найдено' });
      }
      const page = json.query.search[0];
      const snippet = page.snippet.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim();
      res.json({
        found: true,
        title: page.title,
        description: snippet,
        pageUrl: `https://en.wikipedia.org/?curid=${page.pageid}`
      });
    })
    .catch(err => {
      console.error('[partinfo] Ошибка запроса к Wikipedia:', err.message);
      // Fallback: попробовать через http (вдруг Render блокирует только исходящий https)
      console.log('[partinfo] Пробую через http...');
      const httpUrl = url.replace('https://', 'http://');
      doRequest('http', httpUrl)
        .then(json => {
          // ... та же обработка
          if (!json.query || !json.query.search.length) {
            return res.json({ found: false });
          }
          const page = json.query.search[0];
          const snippet = page.snippet.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim();
          res.json({
            found: true,
            title: page.title,
            description: snippet,
            pageUrl: `https://en.wikipedia.org/?curid=${page.pageid}`
          });
        })
        .catch(secondErr => {
          console.error('[partinfo] HTTP fallback тоже не удался:', secondErr.message);
          res.status(502).json({ error: 'Не удалось связаться с Википедией' });
        });
    });
});

module.exports = router;
