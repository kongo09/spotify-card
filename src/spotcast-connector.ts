import { HassEntity } from 'home-assistant-js-websocket';
import { SpotifyCard } from './spotify-card';
import { ConnectDevice, CurrentPlayer, Playlist } from './types';
interface Message {
  type: string;
  account?: string;
}

interface PlaylistMessage extends Message {
  playlist_type: string;
  country_code?: string;
  limit?: number;
  locale?: string;
}

export class SpotcastConnector {
  parent: SpotifyCard;

  playlists: Array<Playlist> = [];
  devices: Array<ConnectDevice> = [];
  player?: CurrentPlayer;
  chromecast_devices: Array<HassEntity> = [];

  loading = false;

  constructor(parent: SpotifyCard) {
    this.parent = parent;
  }

  public is_loading(): boolean {
    setTimeout(this.set_loading_off, 100);
    return this.loading;
  }

  private set_loading_off() {
    this.loading = false;
  }

  public is_loaded(): boolean {
    if (this.playlists.length !== undefined) {
      return true;
    }
    return false;
  }

  private getPlaybackOptions(uri: string): any {
    const options: any = {
      uri: uri,
      force_playback: this.parent.getSpotifyEntityState() == 'playing',
      random_song: this.parent.config.always_play_random_song || false,
      account: this.parent.config.account,
    };

    return options;
  }

  public playUri(uri: string): void {
    const current_player = this.getCurrentPlayer();
    if (!current_player) {
      console.error('No active device');
      return;
    }
    this.playUriOnConnectDevice(current_player.id, uri);
  }

  public transferPlaybackToCastDevice(device_name: string): void {
    this.parent.hass.callService('spotcast', 'start', {
      device_name: device_name,
      force_playback: true,
      account: this.parent.config.account,
    });
  }

  public transferPlaybackToConnectDevice(device_id: string): void {
    this.parent.hass.callService('spotcast', 'start', {
      spotify_device_id: device_id,
      force_playback: true,
      account: this.parent.config.account,
    });
  }

  public playUriOnCastDevice(device_name: string, uri: string): void {
    const options: any = { ...this.getPlaybackOptions(uri), device_name: device_name };
    this.parent.hass.callService('spotcast', 'start', options);
  }

  public playUriOnConnectDevice(device_id: string, uri: string): void {
    const options: any = { ...this.getPlaybackOptions(uri), spotify_device_id: device_id };
    this.parent.hass.callService('spotcast', 'start', options);
  }

  public async updateState(): Promise<void> {
    await this.fetchDevices();
    await this.fetchPlayer();
    await this.fetchChromecasts();
  }

  public getCurrentPlayer(): ConnectDevice | undefined {
    return this.player?.device;
  }

  private async fetchPlayer(): Promise<void> {
    const message: Message = {
      type: 'spotcast/player',
      account: this.parent.config.account,
    };
    this.player = <CurrentPlayer>await this.parent.hass.callWS(message);
    // console.log('fetchPlayer:', JSON.stringify(this.player, null, 2));
  }

  private async fetchDevices(): Promise<void> {
    const message: Message = {
      type: 'spotcast/devices',
      account: this.parent.config.account,
    };
    const res: any = <Array<ConnectDevice>>await this.parent.hass.callWS(message);
    this.devices = res.devices;

    // console.log('fetchDevices:', JSON.stringify(this.devices, null, 2));
  }

  /**
   * Use HA state for now
   */
  private async fetchChromecasts(): Promise<void> {
    const res2: any = await this.parent.hass.callWS({ type: 'spotcast/castdevices' });
    const res: any = await this.parent.hass.callWS({
      type: 'config/entity_registry/list',
    });
    this.chromecast_devices = res
      .filter((e) => e.platform == 'cast')
      .map((e) => this.parent.hass.states[e.entity_id])
      .filter((e) => e != null && e.state != 'unavailable');
    // console.log('fetchChromecasts:', this.chromecast_devices);
  }

  public async fetchPlaylists(): Promise<void> {
    this.loading = true;
    const message: PlaylistMessage = {
      type: 'spotcast/playlists',
      playlist_type: this.parent.config.playlist_type || '',
      account: this.parent.config.account,
      limit: this.parent.config.limit,
    };
    if (this.parent.config.country_code) {
      message.country_code = this.parent.config.country_code;
    }
    // message.locale = 'implement me later'

    const res: any = <Array<Playlist>>await this.parent.hass.callWS(message);
    this.playlists = res.items;
    // console.log('PLAYLISTS:', JSON.stringify(this.playlists, null, 2));
  }
}