'use strict';

const Homey = require('homey');
const KomgaClient = require('../../lib/KomgaClient');

const MS_PER_SECOND = 1000;

class KomgaUserDevice extends Homey.Device {

  async onInit() {
    this._client = this._buildClient();
    this._pollTimer = null;

    // null = first poll, populate silently without triggering
    this._knownInProgressIds = null;
    this._knownReadIds = null;

    await this.driver.ready();
    this._startPolling();
    this.log('KomgaUserDevice initialized:', this.getName());
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
    this._poll().catch((err) => this.error('Poll failed:', err.message));
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
        this._updateReadingActivity(),
      ]);

      if (!this.getAvailable()) await this.setAvailable();
    } catch (err) {
      this.error('Poll failed:', err.message);
      await this.setUnavailable(err.message);
    }
  }

  async _updateCounts() {
    const [unreadPage, ondeckPage, inProgressPage] = await Promise.all([
      this._client.getBooks({ size: 1, readStatus: 'UNREAD' }),
      this._client.getOnDeckBooks(1),
      this._client.getBooks({ size: 1, readStatus: 'IN_PROGRESS' }),
    ]);
    await this.setCapabilityValue('komga_unread_count', unreadPage.totalElements || 0);
    await this.setCapabilityValue('komga_ondeck_count', ondeckPage.totalElements || 0);
    await this.setCapabilityValue('komga_in_progress_count', inProgressPage.totalElements || 0);
  }

  async _updateReadingActivity() {
    const [inProgressPage, readPage] = await Promise.all([
      this._client.getBooks({ size: 20, readStatus: 'IN_PROGRESS', sort: 'lastModifiedDate,desc' }),
      this._client.getBooks({ size: 20, readStatus: 'READ', sort: 'lastModifiedDate,desc' }),
    ]);

    const inProgressBooks = inProgressPage.content || [];
    const readBooks = readPage.content || [];

    const currentInProgressIds = new Set(inProgressBooks.map((b) => b.id));
    const currentReadIds = new Set(readBooks.map((b) => b.id));

    if (this._knownInProgressIds === null) {
      // First poll — populate silently
      this._knownInProgressIds = currentInProgressIds;
      this._knownReadIds = currentReadIds;
      return;
    }

    const serverDriver = this._getServerDriver();
    const serverDevice = this._getServerDevice(serverDriver);
    const user = this.getSetting('username') || '';

    // Detect newly started books (appeared in IN_PROGRESS, not previously seen as read)
    for (const book of inProgressBooks) {
      if (!this._knownInProgressIds.has(book.id) && !this._knownReadIds.has(book.id)) {
        const tokens = { title: book.metadata?.title || book.name || '', series: book.seriesTitle || '' };
        this.driver.triggerBookStarted(this, tokens);
        if (serverDevice) serverDriver.triggerAnyUserBookStarted(serverDevice, { ...tokens, user });
      }
    }

    // Detect newly finished books
    for (const book of readBooks) {
      if (!this._knownReadIds.has(book.id)) {
        const title = book.metadata?.title || book.name || '';
        const series = book.seriesTitle || '';

        this.driver.triggerBookFinished(this, { title, series });
        if (serverDevice) serverDriver.triggerAnyUserBookFinished(serverDevice, { title, series, user });

        // Check whether the entire series is now complete for this user
        if (book.seriesId) {
          this._checkSeriesFinished(book.seriesId).catch((err) => this.error('Series check failed:', err.message));
        }
      }
    }

    this._knownInProgressIds = currentInProgressIds;
    this._knownReadIds = currentReadIds;
  }

  async _checkSeriesFinished(seriesId) {
    const seriesData = await this._client.getSeriesById(seriesId);
    // booksUnreadCount and booksInProgressCount are user-scoped fields returned by Komga
    const unread = seriesData.booksUnreadCount ?? seriesData.booksMetadata?.booksUnreadCount ?? 1;
    const inProgress = seriesData.booksInProgressCount ?? 1;
    if (seriesData.booksCount > 0 && unread === 0 && inProgress === 0) {
      const tokens = {
        series: seriesData.metadata?.title || seriesData.name || '',
        book_count: seriesData.booksCount || 0,
      };
      this.driver.triggerSeriesFinished(this, tokens);
      const serverDriver = this._getServerDriver();
      const serverDevice = this._getServerDevice(serverDriver);
      if (serverDevice) {
        serverDriver.triggerAnyUserSeriesFinished(serverDevice, {
          ...tokens,
          user: this.getSetting('username') || '',
        });
      }
    }
  }

  _getServerDriver() {
    try {
      return this.homey.drivers.getDriver('komga-server');
    } catch {
      return null;
    }
  }

  _getServerDevice(serverDriver) {
    if (!serverDriver) return null;
    const host = this.getSetting('host');
    return serverDriver.getDevices().find((d) => d.getSetting('host') === host) || null;
  }

  // --- Widget helpers ---

  async getOnDeckItems(count = 5) {
    const page = await this._client.getOnDeckBooks(count);
    const books = page.content || [];
    return Promise.all(books.map(async (book) => {
      let posterUrl = '';
      try {
        const buf = await this._client.getBookThumbnailBuffer(book.id);
        posterUrl = `data:image/jpeg;base64,${buf.toString('base64')}`;
      } catch { /* no thumbnail */ }

      const pg = book.readProgress?.page || 0;
      const total = book.pagesCount || 1;
      const pct = Math.round((pg / total) * 100);

      return {
        title: book.metadata?.title || book.name || '',
        subtitle: book.seriesTitle || '',
        badge: `${pct}%`,
        date: book.readProgress?.lastModified || '',
        posterUrl,
      };
    }));
  }

  // Used by the popular widget to aggregate cross-user reading activity
  async getActivityBooks(count = 20) {
    const half = Math.ceil(count / 2);
    const [inProgressPage, readPage] = await Promise.all([
      this._client.getBooks({ size: half, readStatus: 'IN_PROGRESS', sort: 'lastModifiedDate,desc' }),
      this._client.getBooks({ size: half, readStatus: 'READ', sort: 'lastModifiedDate,desc' }),
    ]);

    const result = [];
    for (const book of (inProgressPage.content || [])) {
      result.push({
        id: book.id,
        title: book.metadata?.title || book.name || '',
        series: book.seriesTitle || '',
        lastActivity: book.readProgress?.lastModified || book.lastModifiedDate || '',
        status: 'in_progress',
      });
    }
    for (const book of (readPage.content || [])) {
      result.push({
        id: book.id,
        title: book.metadata?.title || book.name || '',
        series: book.seriesTitle || '',
        lastActivity: book.readProgress?.readDate || book.lastModifiedDate || '',
        status: 'read',
      });
    }
    return result;
  }

}

module.exports = KomgaUserDevice;
