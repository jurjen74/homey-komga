'use strict';

function findDevice(homey, deviceId) {
  try {
    const devices = homey.drivers.getDriver('komga-user').getDevices();
    if (deviceId) return devices.find((d) => d.getId() === deviceId) || null;
    return devices[0] || null;
  } catch {
    return null;
  }
}

module.exports = {
  async getOnDeck({ homey, query }) {
    const count    = Math.max(1, Math.min(20, parseInt(query.count, 10) || 5));
    const deviceId = query.deviceId || null;
    const device   = findDevice(homey, deviceId);
    if (!device) throw new Error('No Komga user device found');
    return device.getOnDeckItems(count);
  },
};
