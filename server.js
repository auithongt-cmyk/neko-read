const express = require('express');
const cors = require('cors');
const https = require('https');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/recommend', (req, res) => {
    const apiUrl = new URL('https://api.mangadex.org/manga');
    apiUrl.searchParams.set('limit', '100');
    apiUrl.searchParams.set('includes[]', 'cover_art');
    apiUrl.searchParams.append('contentRating[]', 'safe');
    apiUrl.searchParams.append('contentRating[]', 'suggestive');
    apiUrl.searchParams.set('order[rating]', 'desc');

    https.get(apiUrl, { headers: { 'User-Agent': 'NEKOread/1.0', Accept: 'application/json' } }, (apiRes) => {
        let rawData = '';

        if (apiRes.statusCode !== 200) {
            apiRes.resume();
            return res.status(apiRes.statusCode || 502).json({
                error: `MangaDex ตอบกลับด้วยสถานะ ${apiRes.statusCode || 'ไม่ทราบสาเหตุ'}`
            });
        }

        apiRes.on('data', (chunk) => { rawData += chunk; });
        apiRes.on('end', () => {
            try {
                res.json(JSON.parse(rawData));
            } catch (e) {
                res.status(500).json({ error: "ข้อมูลผิดพลาด" });
            }
        });
    }).on('error', () => {
        res.status(500).json({ error: "เชื่อมต่อล้มเหลว" });
    });
});

function proxyMangaDex(apiUrl, res) {
    https.get(apiUrl, { headers: { 'User-Agent': 'NEKOread/1.0', Accept: 'application/json' } }, (apiRes) => {
        let rawData = '';

        if (apiRes.statusCode !== 200) {
            apiRes.resume();
            return res.status(apiRes.statusCode || 502).json({ error: `MangaDex ตอบกลับด้วยสถานะ ${apiRes.statusCode || 'ไม่ทราบสาเหตุ'}` });
        }

        apiRes.on('data', (chunk) => { rawData += chunk; });
        apiRes.on('end', () => {
            try {
                res.json(JSON.parse(rawData));
            } catch (error) {
                res.status(500).json({ error: 'ข้อมูลจาก MangaDex ไม่ถูกต้อง' });
            }
        });
    }).on('error', () => {
        res.status(502).json({ error: 'เชื่อมต่อ MangaDex ไม่สำเร็จ' });
    });
}

function addSafeContentRatings(apiUrl) {
    apiUrl.searchParams.append('contentRating[]', 'safe');
    apiUrl.searchParams.append('contentRating[]', 'suggestive');
}

app.get('/api/popular', (req, res) => {
    const apiUrl = new URL('https://api.mangadex.org/manga');
    apiUrl.searchParams.set('limit', '20');
    apiUrl.searchParams.set('includes[]', 'cover_art');
    apiUrl.searchParams.set('order[followedCount]', 'desc');
    addSafeContentRatings(apiUrl);
    proxyMangaDex(apiUrl, res);
});

app.get('/api/search', (req, res) => {
    const title = String(req.query.q || '').trim().slice(0, 100);
    const genreId = String(req.query.genre || '').trim();
    const apiUrl = new URL('https://api.mangadex.org/manga');
    apiUrl.searchParams.set('limit', '30');
    apiUrl.searchParams.set('includes[]', 'cover_art');
    apiUrl.searchParams.set('order[relevance]', 'desc');
    if (title) apiUrl.searchParams.set('title', title);
    if (genreId) apiUrl.searchParams.append('includedTags[]', genreId);
    addSafeContentRatings(apiUrl);
    proxyMangaDex(apiUrl, res);
});

app.get('/api/genres', (req, res) => {
    proxyMangaDex(new URL('https://api.mangadex.org/manga/tag'), res);
});

app.get('/api/cover/:mangaId/:fileName', (req, res) => {
    const mangaId = req.params.mangaId;
    const fileName = req.params.fileName;
    
    const coverUrl = `https://uploads.mangadex.org/covers/${encodeURIComponent(mangaId)}/${encodeURIComponent(fileName)}.256.jpg`;

    https.get(coverUrl, { headers: { 'User-Agent': 'NEKOread/1.0' } }, (apiRes) => {
        if (apiRes.statusCode !== 200) {
            apiRes.resume();
            return res.status(apiRes.statusCode || 502).send('ไม่พบรูปภาพปก');
        }

        res.setHeader('Content-Type', 'image/jpeg');
        apiRes.pipe(res);
    }).on('error', () => {
        res.status(500).send('โหลดรูปภาพล้มเหลว');
    });
});

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`🚀 เซิร์ฟเวอร์มังงะรันแล้วที่ลิงก์นี้ -> http://localhost:${PORT}`);
    });
}

module.exports = app;
