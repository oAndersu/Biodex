const http = require('http');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..', '..');
const port = process.env.PORT || 3000;

function loadEnvFile() {
    const envPath = path.join(rootDir, '.env');
    if (!fs.existsSync(envPath)) {
        return;
    }

    const content = fs.readFileSync(envPath, 'utf8');
    content.split(/\r?\n/).forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;

        const separatorIndex = trimmed.indexOf('=');
        if (separatorIndex === -1) return;

        const key = trimmed.slice(0, separatorIndex).trim();
        let value = trimmed.slice(separatorIndex + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        process.env[key] = value;
    });
}

loadEnvFile();

const plantnetApiKey = process.env.PLANTNET_API_KEY;

function getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
        '.txt': 'text/plain; charset=utf-8'
    };
    return mimeTypes[ext] || 'application/octet-stream';
}

function sendJson(res, statusCode, payload) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(payload));
}

function serveStatic(req, res) {
    const pathname = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
    const safePath = pathname === '/' ? '/index.html' : pathname;
    const relativePath = safePath.replace(/^\/+/, '');
    const filePath = path.resolve(rootDir, relativePath);

    if (!filePath.startsWith(rootDir)) {
        sendJson(res, 403, { error: 'Acesso negado.' });
        return;
    }

    fs.readFile(filePath, (error, data) => {
        if (error) {
            sendJson(res, 404, { error: 'Arquivo não encontrado.' });
            return;
        }
        res.writeHead(200, { 'Content-Type': getMimeType(filePath) });
        res.end(data);
    });
}

function buildMultipartBody(imageBuffer, mimeType) {
    const boundary = `----BioDexBoundary${Date.now()}`;
    const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="images"; filename="image.png"\r\nContent-Type: ${mimeType}\r\n\r\n`),
        imageBuffer,
        Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="organs"\r\n\r\nflower\r\n--${boundary}--\r\n`)
    ]);
    return { boundary, body };
}

const server = http.createServer(async (req, res) => {
    const reqUrl = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === 'GET' && reqUrl.pathname === '/health') {
        sendJson(res, 200, { ok: true, message: 'Servidor BioDex está ativo.' });
        return;
    }

    if (req.method === 'POST' && reqUrl.pathname === '/api/identify') {
        if (!plantnetApiKey) {
            sendJson(res, 500, { error: 'PLANTNET_API_KEY não configurada. Crie um arquivo .env com sua chave.' });
            return;
        }

        let body = '';
        req.on('data', chunk => {
            body += chunk;
        });

        req.on('end', async () => {
            try {
                const { image } = JSON.parse(body);
                const base64Data = image?.replace(/^data:image\/(png|jpeg);base64,/, '');
                const mimeType = image?.includes('image/png') ? 'image/png' : 'image/jpeg';

                if (!base64Data) {
                    sendJson(res, 400, { error: 'Imagem ausente.' });
                    return;
                }

                const imageBuffer = Buffer.from(base64Data, 'base64');
                const { boundary, body: multipartBody } = buildMultipartBody(imageBuffer, mimeType);

                const response = await fetch(`https://my-api.plantnet.org/v2/identify/all?api-key=${encodeURIComponent(plantnetApiKey)}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': `multipart/form-data; boundary=${boundary}`
                    },
                    body: multipartBody
                });

                const payload = await response.json();

                if (!response.ok) {
                    sendJson(res, response.status, { error: payload?.error || 'Erro ao consultar a PlantaNet.' });
                    return;
                }

                sendJson(res, 200, payload);
            } catch (error) {
                sendJson(res, 500, { error: 'Erro ao processar a imagem.', detail: error.message });
            }
        });
        return;
    }

    serveStatic(req, res);
});

server.listen(port, () => {
    console.log(`BioDex server running at http://localhost:${port}`);
});
