'use strict';

const Homey = require('homey');
const KomgaClient = require('../../lib/KomgaClient');

class KomgaServerDriver extends Homey.Driver {

  async onInit() {
    this._triggerServerOffline = this.homey.flow.getDeviceTriggerCard('server_offline');
    this._triggerServerOnline = this.homey.flow.getDeviceTriggerCard('server_online');
    this._triggerBookAdded = this.homey.flow.getDeviceTriggerCard('book_added');
    this._triggerSeriesAdded = this.homey.flow.getDeviceTriggerCard('series_added');
    this._triggerAnyUserBookStarted = this.homey.flow.getDeviceTriggerCard('any_user_book_started');
    this._triggerAnyUserBookFinished = this.homey.flow.getDeviceTriggerCard('any_user_book_finished');
    this._triggerAnyUserSeriesFinished = this.homey.flow.getDeviceTriggerCard('any_user_series_finished');

    this.homey.flow
      .getConditionCard('komga_server_is_healthy')
      .registerRunListener((args) => !args.device.getCapabilityValue('alarm_generic'));

    this.homey.flow
      .getActionCard('scan_library')
      .registerRunListener((args) => args.device.scanLibrary(args.library.id))
      .registerArgumentAutocompleteListener('library', (query, args) => args.device.getLibraryAutocomplete(query));

    this.homey.flow
      .getActionCard('scan_all_libraries')
      .registerRunListener((args) => args.device.scanAllLibraries());

    this.log('KomgaServerDriver initialized');
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
      return [{
        name: `Komga (${host})`,
        data: { id: host },
        settings: {
          host, username, password, pollInterval: 60,
        },
      }];
    });
  }

  // --- Trigger helpers ---

  triggerServerOffline(device) {
    this._triggerServerOffline.trigger(device, {}).catch(this.error);
  }

  triggerServerOnline(device) {
    this._triggerServerOnline.trigger(device, {}).catch(this.error);
  }

  triggerBookAdded(device, tokens) {
    this._triggerBookAdded.trigger(device, tokens).catch(this.error);
  }

  triggerSeriesAdded(device, tokens) {
    this._triggerSeriesAdded.trigger(device, tokens).catch(this.error);
  }

  triggerAnyUserBookStarted(device, tokens) {
    this._triggerAnyUserBookStarted.trigger(device, tokens).catch(this.error);
  }

  triggerAnyUserBookFinished(device, tokens) {
    this._triggerAnyUserBookFinished.trigger(device, tokens).catch(this.error);
  }

  triggerAnyUserSeriesFinished(device, tokens) {
    this._triggerAnyUserSeriesFinished.trigger(device, tokens).catch(this.error);
  }

}

module.exports = KomgaServerDriver;
