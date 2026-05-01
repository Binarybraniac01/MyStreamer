/**
 * Movies API - Vercel Serverless Function
 * Handles search and add operations for the movies table in Supabase
 */

const https = require('https');

const SUPABASE_URL = 'https://caklaclowgwprjalnywk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNha2xhY2xvd2d3cHJqYWxueXdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2Nzg2NTQsImV4cCI6MjA4NDI1NDY1NH0.zuymyh5-5WcUKSDYs8aMcf98C5UfLHk14KtQ9jSVr3A';

function supabaseRequest(method, path, body = null) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(SUPABASE_URL + path);

        const headers = {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': method === 'POST' ? 'return=representation' : undefined
        };

        // Remove undefined headers
        Object.keys(headers).forEach(key => headers[key] === undefined && delete headers[key]);

        const options = {
            hostname: parsedUrl.hostname,
            port: 443,
            path: parsedUrl.pathname + parsedUrl.search,
            method: method,
            headers: headers,
            timeout: 15000
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = data ? JSON.parse(data) : {};
                    resolve({ status: res.statusCode, data: parsed, headers: res.headers });
                } catch (e) {
                    resolve({ status: res.statusCode, data: data, headers: res.headers });
                }
            });
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Supabase request timeout'));
        });

        req.on('error', reject);

        if (body) {
            req.write(JSON.stringify(body));
        }

        req.end();
    });
}

module.exports = async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        // GET /api/movies?search=keyword — Search movies by title
        if (req.method === 'GET') {
            const search = req.query.search || '';
            const limit = parseInt(req.query.limit) || 20;
            const offset = parseInt(req.query.offset) || 0;

            let path;
            if (search.trim()) {
                // Use ilike for case-insensitive partial matching
                const encodedSearch = encodeURIComponent(`%${search.trim()}%`);
                path = `/rest/v1/movies?title=ilike.${encodedSearch}&select=id,title,link&order=title.asc&limit=${limit}&offset=${offset}`;
            } else {
                // Return recent movies when no search term
                path = `/rest/v1/movies?select=id,title,link&order=id.desc&limit=${limit}&offset=${offset}`;
            }

            const result = await supabaseRequest('GET', path);

            if (result.status >= 200 && result.status < 300) {
                res.status(200).json({
                    success: true,
                    movies: Array.isArray(result.data) ? result.data : [],
                    count: Array.isArray(result.data) ? result.data.length : 0
                });
            } else {
                console.error('Supabase error:', result.data);
                res.status(result.status).json({
                    success: false,
                    error: 'Failed to fetch movies',
                    details: result.data
                });
            }
            return;
        }

        // POST /api/movies — Add a new movie
        if (req.method === 'POST') {
            const { title, link } = req.body || {};

            if (!title || !link) {
                res.status(400).json({
                    success: false,
                    error: 'Both title and link are required'
                });
                return;
            }

            // Validate link is a URL
            try {
                new URL(link);
            } catch (e) {
                res.status(400).json({
                    success: false,
                    error: 'Invalid link URL'
                });
                return;
            }

            const path = '/rest/v1/movies';
            const result = await supabaseRequest('POST', path, { title: title.trim(), link: link.trim() });

            if (result.status >= 200 && result.status < 300) {
                res.status(201).json({
                    success: true,
                    movie: Array.isArray(result.data) ? result.data[0] : result.data,
                    message: 'Movie added successfully'
                });
            } else {
                console.error('Supabase insert error:', result.data);
                res.status(result.status).json({
                    success: false,
                    error: 'Failed to add movie',
                    details: result.data
                });
            }
            return;
        }

        res.status(405).json({ error: 'Method not allowed' });

    } catch (error) {
        console.error('API error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};
