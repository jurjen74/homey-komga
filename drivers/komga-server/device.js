'use strict';

const Homey       = require('homey');
const KomgaClient = require('../../lib/KomgaClient');

const MS_PER_SECOND = 1000;

class KomgaServerDevice extends Homey.Device {

  async onInit() {
    this._client    = this._buildClient();
    this._pollTimer = null;

    this._wasAvailable    = null;   // null = first poll not yet done
    this._knownBookIds    = null;   // null = first poll, populate silently
    this._knownSeriesIds  = null;
    this._cachedLibraries = [];
    this._cachedRecentBooks = [];   // for widget

    await this.driver.ready();
    this._startPolling();
    this.log('KomgaServerDevice initialized:', this.getName());
  }

  async onSettings({ newSettings }) {
    this._client = new KomgaClient(newSettings.host, newSettings.username, newSettings.password);
    this._restartPolling();
  }

  async onDeleted() {
    this._stopPolling();
  }

  _buildClient() {
    const { host, username, password } = this.getSettings();
    return new KomgaClient(host, username, password);
  }

  _startPolling() {
    const intervalSec = this.getSetting('pollInterval') || 60;
    this._poll();
    this._pollTimer = this.homey.setInterval(() => this._poll(), intervalSec * MS_PER_SECOND);
  }

  _stopPolling() {
    if (this._pollTimer) {
      this.homey.clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  }

  _restartPolling() {
    this._stopPolling();
    this._startPolling();
  }

  async _poll() {
    try {
      await Promise.all([
        this._updateCounts(),
        this._updateLibraries(),
        this._updateRecentBooks(),
        this._updateRecentSeries(),
      ]);

      if (!this.getAvailable()) {
        await this.setAvailable();
      }
      if (this._wasAvailable === false) {
        await this.setCapabilityValue('alarm_generic', false);
        this.driver.triggerServerOnline(this);
      } else if (this._wasAvailable === null) {
        await this.setCapabilityValue('alarm_generic', false);
      }
      this._wasAvailable = true;
    } catch (err) {
      this.error('Poll failed:', err.message);
      if (this._wasAvailable !== false) {
        await this.setCapabilityValue('alarm_generic', true).catch(() => {});
        if (this._wasAvailable === true) {
          this.driver.triggerServerOffline(this);
        }
      }
      this._wasAvailable = false;
      await this.setUnavailable(err.message);
    }
  }

  async _updateCounts() {
    const [booksPage, seriesPage] = await Promise.all([
      this._client.getBooks({ size: 1 }),
      this._client.getSeries({ size: 1 }),
    ]);
    await this.setCapabilityValue('komga_book_count',   booksPage.totalElements  || 0);
    await this.setCapabilityValue('komga_series_count', seriesPage.totalElements || 0);
  }

  async _updateLibraries() {
    const libs            = await this._client.getLibraries();
    this._cachedLibraries = Array.isArray(libs) ? libs : [];
  }

  async _updateRecentBooks() {
    const page           = await this._client.getBooks({ size: 50 });
    const books          = page.content || [];
    this._cachedRecentBooks = books;

    const currentIds = new Set(books.map((b) => b.id));

    if (this._knownBookIds === null) {
      this._knownBookIds = currentIds;
      return;
    }

    for (const book of books) {
      if (!this._knownBookIds.has(book.id)) {
        const lib = this._cachedLibraries.find((l) => l.id === book.libraryId);
        this.driver.triggerBookAdded(this, {
          title:   book.metadata?.title || book.name || '',
          series:  book.seriesTitle || '',
          library: lib?.name || '',
        });
      }
    }
    this._knownBookIds = currentIds;
  }

  async _updateRecentSeries() {
    const page   = await this._client.getSeries({ size: 50 });
    const series = page.content || [];

    const currentIds = new Set(series.map((s) => s.id));

    if (this._knownSeriesIds === null) {
      this._knownSeriesIds = currentIds;
      return;
    }

    for (const s of series) {
      if (!this._knownSeriesIds.has(s.id)) {
        const lib = this._cachedLibraries.find((l) => l.id === s.libraryId);
        this.driver.triggerSeriesAdded(this, {
          title:      s.metadata?.title || s.name || '',
          library:    lib?.name || '',
          book_count: s.booksCount || 0,
        });
      }
    }
    this._knownSeriesIds = currentIds;
  }

  // --- Flow action handlers ---

  async scanLibrary(libraryId) {
    await this._client.scanLibrary(libraryId);
    this.log('Triggered scan for library', libraryId);
  }

  async scanAllLibraries() {
    await Promise.all(this._cachedLibraries.map((l) => this._client.scanLibrary(l.id)));
    this.log('Triggered scan for all libraries');
  }

  // --- Autocomplete helpers ---

  getLibraryAutocomplete(query) {
    const lq = (query || '').toLowerCase();
    return this._cachedLibraries
      .filter((l) => !lq || l.name.toLowerCase().includes(lq))
      .map((l) => ({ id: l.id, name: l.name }));
  }

  // --- Widget helpers ---

  async getRecentItems(count = 5) {
    const books = this._cachedRecentBooks.slice(0, count);
    return Promise.all(books.map(async (book) => {
      const posterUrl = await this.fetchBookThumbnailDataUrl(book.id);
      const num       = book.metadata?.number;
      return {
        title:    book.metadata?.title || book.name || '',
        subtitle: book.seriesTitle || '',
        badge:    num != null ? `#${num}` : '',
        date:     book.created || '',
        posterUrl,
      };
    }));
  }

  async fetchBookThumbnailDataUrl(bookId) {
    try {
      const buf = await this._client.getBookThumbnailBuffer(bookId);
      return `data:image/jpeg;base64,${buf.toString('base64')}`;
    } catch {
      return '';
    }
  }

}

module.exports = KomgaServerDevice;
