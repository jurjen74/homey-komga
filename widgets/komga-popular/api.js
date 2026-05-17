'use strict';

function findUserDevices(homey) {
  try {
    return homey.drivers.getDriver('komga-user').getDevices();
  } catch {
    return [];
  }
}

function findServerDevice(homey, deviceId) {
  try {
    const devices = homey.drivers.getDriver('komga-server').getDevices();
    if (deviceId) return devices.find((d) => d.getId() === deviceId) || null;
    return devices[0] || null;
  } catch {
    return null;
  }
}

module.exports = {
  async getPopular({ homey, query }) {
    const count    = Math.max(1, Math.min(20, parseInt(query.count, 10) || 5));
    const deviceId = query.deviceId || null;

    const userDevices = findUserDevices(homey);
    if (!userDevices.length) throw new Error('No Komga user devices found — add at least one Komga User device');

    // Collect activity books from every user device
    const allActivity = (await Promise.all(
      userDevices.map((d) => d.getActivityBooks(20).catch(() => [])),
    )).flat();

    // Aggregate: count how many distinct users have touched each book
    const byBookId = new Map();
    for (const item of allActivity) {
      if (!item.id) continue;
      if (byBookId.has(item.id)) {
        const entry = byBookId.get(item.id);
        entry.readerCount += 1;
        if ((item.lastActivity || '') > (entry.lastActivity || '')) {
          entry.lastActivity = item.lastActivity;
        }
      } else {
        byBookId.set(item.id, { ...item, readerCount: 1 });
      }
    }

    const sorted = [...byBookId.values()]
      .sort((a, b) => {
        if (b.readerCount !== a.readerCount) return b.readerCount - a.readerCount;
        return (b.lastActivity || '') > (a.lastActivity || '') ? 1 : -1;
      })
      .slice(0, count);

    // Fetch thumbnails via a server device (authenticated server-side proxy)
    const serverDevice = findServerDevice(homey, deviceId);

    return Promise.all(sorted.map(async (item) => {
      let posterUrl = '';
      if (serverDevice && item.id) {
        posterUrl = await serverDevice.fetchBookThumbnailDataUrl(item.id);
      }
      return {
        title:    item.title,
        subtitle: item.series,
        badge:    item.readerCount === 1 ? '1 reader' : `${item.readerCount} readers`,
        date:     item.lastActivity || '',
        posterUrl,
      };
    }));
  },
};
