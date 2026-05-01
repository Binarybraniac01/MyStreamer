/**
 * StreamFlow Proxy Server
 * Bypasses CORS and hotlink restrictions for video streaming
 */

const http = require('http');
const https = require('https');
const url = require('url');
const path = require('path');
const fs = require('fs');

// Supabase config (for local /api/movies endpoint)
const SUPABASE_URL = 'https://caklaclowgwprjalnywk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNha2xhY2xvd2d3cHJqYWxueXdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2Nzg2NTQsImV4cCI6MjA4NDI1NDY1NH0.zuymyh5-5WcUKSDYs8aMcf98C5UfLHk14KtQ9jSVr3A';

function supabaseRequest(method, apiPath, body = null) {
    return new Promise((resolve, reject) => {
        const fullUrl = new URL(SUPABASE_URL + apiPath);
        const headers = {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
        };
        if (method === 'POST') headers['Prefer'] = 'return=representation';

        const options = {
            hostname: fullUrl.hostname,
            port: 443,
            path: fullUrl.pathname + fullUrl.search,
            method,
            headers,
            timeout: 15000
        };

        const req = https.request(options, (supaRes) => {
            let data = '';
            supaRes.on('data', chunk => data += chunk);
            supaRes.on('end', () => {
                try { resolve({ status: supaRes.statusCode, data: data ? JSON.parse(data) : {} }); }
                catch (e) { resolve({ status: supaRes.statusCode, data }); }
            });
        });
        req.on('timeout', () => { req.destroy(); reject(new Error('Supabase timeout')); });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

function readBody(req) {
    return new Promise((resolve) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try { resolve(JSON.parse(body)); }
            catch { resolve({}); }
        });
    });
}

const PORT = 4000;

// MIME types for serving static files
const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    
    // Add CORS headers to all responses
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // Movies API: /api/movies
    if (pathname === '/api/movies') {
        res.setHeader('Content-Type', 'application/json');
        try {
            if (req.method === 'GET') {
                const search = parsedUrl.query.search || '';
                const limit = parseInt(parsedUrl.query.limit) || 20;
                const offset = parseInt(parsedUrl.query.offset) || 0;
                let apiPath;
                if (search.trim()) {
                    apiPath = `/rest/v1/movies?title=ilike.${encodeURIComponent('%' + search.trim() + '%')}&select=id,title,link&order=title.asc&limit=${limit}&offset=${offset}`;
                } else {
                    apiPath = `/rest/v1/movies?select=id,title,link&order=id.desc&limit=${limit}&offset=${offset}`;
                }
                const result = await supabaseRequest('GET', apiPath);
                res.writeHead(200);
                res.end(JSON.stringify({ success: true, movies: Array.isArray(result.data) ? result.data : [], count: Array.isArray(result.data) ? result.data.length : 0 }));
            } else if (req.method === 'POST') {
                const body = await readBody(req);
                const { title, link } = body;
                if (!title || !link) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ success: false, error: 'Both title and link are required' }));
                    return;
                }
                const result = await supabaseRequest('POST', '/rest/v1/movies', { title: title.trim(), link: link.trim() });
                if (result.status >= 200 && result.status < 300) {
                    res.writeHead(201);
                    res.end(JSON.stringify({ success: true, message: 'Movie added successfully' }));
                } else {
                    res.writeHead(result.status);
                    res.end(JSON.stringify({ success: false, error: 'Failed to add movie', details: result.data }));
                }
            } else {
                res.writeHead(405);
                res.end(JSON.stringify({ error: 'Method not allowed' }));
            }
        } catch (err) {
            console.error('Movies API error:', err.message);
            res.writeHead(500);
            res.end(JSON.stringify({ success: false, error: err.message }));
        }
        return;
    }
    
    // Proxy endpoint: /proxy?url=VIDEO_URL
    if (pathname === '/proxy') {
        const videoUrl = parsedUrl.query.url;
        
        if (!videoUrl) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing url parameter' }));
            return;
        }
        
        console.log(`\n🎬 Proxying: ${videoUrl}`);
        
        try {
            await proxyVideo(videoUrl, req, res);
        } catch (error) {
            console.error('❌ Proxy error:', error.message);
            // Only send error if headers haven't been sent
            if (!res.headersSent) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
            }
        }
        return;
    }
    
    // Serve static files
    let filePath = pathname === '/' ? '/index.html' : pathname;
    filePath = path.join(__dirname, filePath);
    
    // Security: prevent directory traversal
    if (!filePath.startsWith(__dirname)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }
    
    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    
    fs.readFile(filePath, (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404);
                res.end('File not found');
            } else {
                res.writeHead(500);
                res.end('Server error');
            }
            return;
        }
        
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    });
});

function proxyVideo(videoUrl, clientReq, clientRes) {
    return new Promise((resolve, reject) => {
        const parsedUrl = url.parse(videoUrl);
        const protocol = parsedUrl.protocol === 'https:' ? https : http;
        
        // Forward Range header for seeking support
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Accept-Encoding': 'identity',
            'Connection': 'keep-alive',
            'Referer': `${parsedUrl.protocol}//${parsedUrl.hostname}/`
        };
        
        // Forward Range header for seeking
        if (clientReq.headers.range) {
            headers['Range'] = clientReq.headers.range;
            console.log(`📍 Range: ${clientReq.headers.range}`);
        }
        
        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
            path: parsedUrl.path,
            method: clientReq.method || 'GET',
            headers: headers,
            timeout: 30000
        };
        
        const proxyReq = protocol.request(options, (proxyRes) => {
            console.log(`📥 Response: ${proxyRes.statusCode}`);
            
            // Handle redirects
            if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
                let redirectUrl = proxyRes.headers.location;
                // Handle relative redirects
                if (redirectUrl.startsWith('/')) {
                    redirectUrl = `${parsedUrl.protocol}//${parsedUrl.hostname}${redirectUrl}`;
                }
                console.log(`🔄 Redirect: ${redirectUrl}`);
                proxyVideo(redirectUrl, clientReq, clientRes)
                    .then(resolve)
                    .catch(reject);
                return;
            }
            
            // Forward response headers
            const responseHeaders = {
                'Content-Type': proxyRes.headers['content-type'] || 'video/mp4',
                'Accept-Ranges': 'bytes',
                'Cache-Control': 'no-cache'
            };
            
            if (proxyRes.headers['content-length']) {
                responseHeaders['Content-Length'] = proxyRes.headers['content-length'];
            }
            
            if (proxyRes.headers['content-range']) {
                responseHeaders['Content-Range'] = proxyRes.headers['content-range'];
            }
            
            // Use appropriate status code
            const statusCode = proxyRes.statusCode;
            
            if (!clientRes.headersSent) {
                clientRes.writeHead(statusCode, responseHeaders);
            }
            
            // Pipe the video stream to client
            proxyRes.pipe(clientRes);
            
            proxyRes.on('end', () => {
                console.log('✅ Done');
                resolve();
            });
            
            proxyRes.on('error', (err) => {
                console.error('Stream error:', err.message);
                if (!clientRes.headersSent) {
                    reject(err);
                } else {
                    resolve(); // Already streaming, just end
                }
            });
        });
        
        proxyReq.on('timeout', () => {
            console.error('⏱️ Request timeout');
            proxyReq.destroy();
            reject(new Error('Request timeout'));
        });
        
        proxyReq.on('error', (err) => {
            console.error('Request error:', err.message);
            reject(err);
        });
        
        // Handle client disconnect
        clientReq.on('close', () => {
            proxyReq.destroy();
        });
        
        clientRes.on('close', () => {
            proxyReq.destroy();
        });
        
        proxyReq.end();
    });
}

server.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════════╗
║                                                        ║
║   🎬 StreamFlow Proxy Server                          ║
║                                                        ║
║   Open:   http://localhost:${PORT}                       ║
║   Proxy:  http://localhost:${PORT}/proxy?url=VIDEO_URL   ║
║                                                        ║
║   Press Ctrl+C to stop                                 ║
║                                                        ║
╚════════════════════════════════════════════════════════╝
    `);
});
