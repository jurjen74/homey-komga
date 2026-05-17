'use strict';

const http  = require('http');
const https = require('https');
const url   = require('url');

class KomgaConnectionError extends Error {

  constructor(code, message) {
    super(message);
    this.name = 'KomgaConnectionError';
    this.code = code;
  }

}

class KomgaClient {

  constructor(host, username, password) {
    this.host  = host.replace(/\/$/, '');
    this._auth = Buffer.from(`${username}:${password}`).toString('base64');
  }

  get(path, query = {}) {
    const params = new URLSearchParams(
      Object.fromEntries(Object.entries(query).filter(([, v]) => v != null)),
    );
    const qs      = params.toString();
    const fullUrl = `${this.host}${path}${qs ? `?${qs}` : ''}`;
    return this._request(fullUrl, 'GET');
  }

  post(path, body = null, query = {}) {
    const params = new URLSearchParams(
      Object.fromEntries(Object.entries(query).filter(([, v]) => v != null)),
    );
    const qs = params.toString();
    return this._request(`${this.host}${path}${qs ? `?${qs}` : ''}`, 'POST', body);
  }

  _request(fullUrl, method, body) {
    let parsed;
    try {
      parsed = new url.URL(fullUrl);
    } catch {
      return Promise.reject(new KomgaConnectionError('invalid_url', 'Invalid host URL — make sure it starts with http:// or https://'));
    }

    return new Promise((resolve, reject) => {
      const transport = parsed.protocol === 'https:' ? https : http;
      const payload   = body != null ? JSON.stringify(body) : null;

      const options = {
        hostname: parsed.hostname,
        port:     parsed.port,
        path:     parsed.pathname + parsed.search,
        method,
        headers: {
          Accept:         'application/json',
          'Content-Type': 'application/json',
          Authorization:  `Basic ${this._auth}`,
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
        timeout: 10000,
      };

      const req = transport.request(options, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try { resolve(JSON.parse(raw)); }
            catch { resolve(raw); }
          } else if (res.statusCode === 401) {
            reject(new KomgaConnectionError('unauthorized', 'Invalid credentials'));
          } else if (res.statusCode === 403) {
            reject(new KomgaConnectionError('forbidden', 'Access denied — check user permissions'));
          } else if (res.statusCode === 404) {
            reject(new KomgaConnectionError('not_found', `Komga API not found (HTTP 404) — URL: ${fullUrl}`));
          } else {
            reject(new KomgaConnectionError('http_error', `Komga returned HTTP ${res.statusCode} — URL: ${fullUrl}`));
          }
        });
      });

      req.on('error', (err) => {
        if (err.code === 'ECONNREFUSED') {
          reject(new KomgaConnectionError('refused', 'Connection refused — is Komga running?'));
        } else if (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN') {
          reject(new KomgaConnectionError('not_found', `Host not found: ${parsed.hostname}`));
        } else if (err.code === 'ECONNRESET') {
          reject(new KomgaConnectionError('reset', 'Connection was reset by the server'));
        } else {
          reject(new KomgaConnectionError('network', err.message));
        }
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new KomgaConnectionError('timeout', 'Request timed out'));
      });

      if (payload) req.write(payload);
      req.end();
    });
  }

  _requestBinary(fullUrl) {
    let parsed;
    try {
      parsed = new url.URL(fullUrl);
    } catch {
      return Promise.reject(new KomgaConnectionError('invalid_url', 'Invalid URL'));
    }

    return new Promise((resolve, reject) => {
      const transport = parsed.protocol === 'https:' ? https : http;
      const options   = {
        hostname: parsed.hostname,
        port:     parsed.port,
        path:     parsed.pathname + parsed.search,
        method:   'GET',
        headers:  { Authorization: `Basic ${this._auth}` },
        timeout:  15000,
      };

      const req = transport.request(options, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(Buffer.concat(chunks));
          } else {
            reject(new KomgaConnectionError('http_error', `HTTP ${res.statusCode}`));
          }
        });
      });

      req.on('error',   (err) => reject(new KomgaConnectionError('network', err.message)));
      req.on('timeout', ()    => { req.destroy(); reject(new KomgaConnectionError('timeout', 'Request timed out')); });
      req.end();
    });
  }

  // --- API methods ---

  getMe() {
    return this.get('/api/v2/users/me');
  }

  getLibraries() {
    return this.get('/api/v1/libraries');
  }

  scanLibrary(libraryId) {
    return this.post(`/api/v1/libraries/${libraryId}/scan`);
  }

  getBooks({ sort = 'createdDate,desc', page = 0, size = 50, read_status } = {}) {
    const body = read_status
      ? { condition: { readStatus: { operator: 'is', value: read_status } } }
      : {};
    return this.post('/api/v1/books/list', body, { sort, page, size });
  }

  getSeries({ sort = 'createdDate,desc', page = 0, size = 50 } = {}) {
    return this.post('/api/v1/series/list', {}, { sort, page, size });
  }

  getOnDeckBooks(size = 20) {
    return this.get('/api/v1/books/ondeck', { page: 0, size });
  }

  getSeriesById(seriesId) {
    return this.get(`/api/v1/series/${seriesId}`);
  }

  getBookThumbnailBuffer(bookId) {
    return this._requestBinary(`${this.host}/api/v1/books/${bookId}/thumbnail`);
  }

}

module.exports = KomgaClient;
module.exports.KomgaConnectionError = KomgaConnectionError;
