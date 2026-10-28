'use strict';

const Homey = require('homey');
const KomgaClient = require('../../lib/KomgaClient');

class KomgaUserDriver extends Homey.Driver {

  async onInit() {
    this._triggerBookStarted = this.homey.flow.getDeviceTriggerCard('book_started');
    this._triggerBookFinished = this.homey.flow.getDeviceTriggerCard('book_finished');
    this._triggerSeriesFinished = this.homey.flow.getDeviceTriggerCard('series_finished');

    this.homey.flow
      .getConditionCard('has_unread_books')
      .registerRunListener((args) => (args.device.getCapabilityValue('komga_unread_count') || 0) > 0);

    this.homey.flow
      .getConditionCard('is_currently_reading')
      .registerRunListener((args) => (args.device.getCapabilityValue('komga_in_progress_count') || 0) > 0);

    this.log('KomgaUserDriver initialized');
  }

  async onPair(session) {
    let host = '';
    let username = '';
    let password = '';
    let me = null;

    session.setHandler('test_connection', async ({ host: rawHost, username: rawUser, password: rawPass }) => {
      host = rawHost.trim().replace(/\/$/, '');
      username = rawUser.trim();
      password = rawPass;

      if (!host) throw new Error('Host URL is required');
      if (!username) throw new Error('Username is required');
      if (!password) throw new Error('Password is required');

      const client = new KomgaClient(host, username, password);
      me = await client.getMe();
      return { email: me.email || username };
    });

    session.setHandler('list_devices', async () => {
      if (!me) {
        const client = new KomgaClient(host, username, password);
        me = await client.getMe();
      }
      const email = me.email || username;
      return [{
        name: email,
        data: { id: `${host}::${email}` },
        settings: {
          host, username, password, pollInterval: 60,
        },
      }];
    });
  }

  // --- Trigger helpers ---

  triggerBookStarted(device, tokens) {
    this._triggerBookStarted.trigger(device, tokens).catch(this.error);
  }

  triggerBookFinished(device, tokens) {
    this._triggerBookFinished.trigger(device, tokens).catch(this.error);
  }

  triggerSeriesFinished(device, tokens) {
    this._triggerSeriesFinished.trigger(device, tokens).catch(this.error);
  }

}

module.exports = KomgaUserDriver;
