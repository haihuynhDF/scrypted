import { sleep } from '@scrypted/common/src/sleep';
import sdk, { Device, DeviceProvider, HttpRequest, HttpRequestHandler, HttpResponse, ScryptedDeviceBase, ScryptedDeviceType, ScryptedInterface, Setting, Settings, SettingValue } from '@scrypted/sdk';
import { StorageSettings } from '@scrypted/sdk/storage-settings';
import crypto from 'crypto';
import { RingLocationDevice } from './location';
import { Location, RingBaseApi, RingRestClient } from './ring-client-api';
import { RingCameraDevice } from './camera';

const { deviceManager, mediaManager } = sdk;

class RingPlugin extends ScryptedDeviceBase implements DeviceProvider, Settings, HttpRequestHandler {
    loginClient: RingRestClient;
    api: RingBaseApi;
    devices = new Map<string, RingLocationDevice>();
    locations: Location[];

    settingsStorage = new StorageSettings(this, {
        systemId: {
            title: 'System ID',
            description: 'Used to provide client uniqueness for retrieving the latest set of events.',
            hide: true,
            persistedDefaultValue: crypto.createHash('sha256').update(crypto.randomBytes(32)).digest('hex'),
        },
        controlCenterDisplayName: {
            hide: true,
            defaultValue: 'scrypted-ring',
        },
        polling: {
            title: 'Polling',
            description: 'Poll the Ring servers instead of using server delivered Push events. May fix issues with events not being delivered.',
            type: 'boolean',
            onPut: async () => {
                await this.tryLogin();
                await this.discoverDevices();
            },
            defaultValue: true,
        },
        refreshToken: {
            title: 'Refresh Token',
            onPut: async () => {
                await this.onReceiveToken();
                await this.discoverDevices();
                this.console.log('discovery completed successfully');
            },
        },
        locationIds: {
            title: 'Location ID',
            description: 'Optional: If supplied will on show this locationID.',
            hide: true,
        },
        nightModeBypassAlarmState: {
            title: 'Night Mode Bypass Alarm State',
            description: 'Set this to enable the "Night" option on the alarm panel. When arming in "Night" mode, all open sensors will be bypassed and the alarm will be armed to the selected option.',
            choices: [
                'Disabled',
                'Home',
                'Away'
            ],
            defaultValue: 'Disabled',
        },
        legacyRtspStream: {
            title: 'Legacy RTSP Streaming',
            description: 'Enable legacy RTSP Stream support. No longer supported and is being phased out by Ring.',
            type: 'boolean',
            persistedDefaultValue: false,
        },
    });

    constructor() {
        super();

        this.discoverDevices()
            .catch(e => this.console.error('discovery failure', e));
    }

    async onRequest(request: HttpRequest, response: HttpResponse) {
        if (request.isPublicEndpoint) {
            response.send('', {
                code: 401,
            });
            return;
        }

        let normalizedUrl = request.url.substring(request.rootPath.length);
        if (normalizedUrl.startsWith('/thumbnail')) {
            const [, , id, ding_id] = normalizedUrl.split('/');
            const locationId = sdk.systemManager.getDeviceById(id).providerId;
            const locationNativeId = sdk.systemManager.getDeviceById(locationId).nativeId;
            const location = this.devices.get(locationNativeId);
            const camera = location.devices.get(sdk.systemManager.getDeviceById(id).nativeId) as RingCameraDevice;
            const clip = camera.videoClips.get(ding_id);
            const mo = await sdk.mediaManager.createFFmpegMediaObject({
                inputArguments: [
                    // it may be h264 or h265.
                    // '-f', 'h264',
                    '-i', clip.thumbnail_url,
                ]
            });
            const jpeg = await sdk.mediaManager.convertMediaObjectToBuffer(mo, 'image/jpeg');
            response.send(jpeg, {
                headers: {
                    'Content-Type': 'image/jpeg',
                }
            });
            return;
        }

        response.send('', {
            code: 404,
        });
    }

    waiting = false;
    async loginNextTick() {
        if (this.waiting)
            return false;
        this.waiting = true;
        await sleep(500);
        this.waiting = false;
        return true;
    }

    async clearTryDiscoverDevices() {
        this.settingsStorage.values.refreshToken = '';
        await this.discoverDevices();
        this.console.log('discovery completed successfully');
    }

    async tryLogin(code?: string) {
        const locationIds = this.settingsStorage.values.locationIds ? [this.settingsStorage.values.locationIds] : undefined;
        const cameraStatusPollingSeconds = 20;

        const createRingApi = async () => {
            this.api?.disconnect();

            this.api = new RingBaseApi({
                controlCenterDisplayName: this.settingsStorage.values.controlCenterDisplayName,
                refreshToken: this.settingsStorage.values.refreshToken,
                ffmpegPath: await mediaManager.getFFmpegPath(),
                locationIds,
                cameraStatusPollingSeconds: this.settingsStorage.values.polling ? cameraStatusPollingSeconds : undefined,
                locationModePollingSeconds: this.settingsStorage.values.polling ? cameraStatusPollingSeconds : undefined,
                systemId: this.settingsStorage.values.systemId,
            }, {
                createPeerConnection: () => {
                    throw new Error('unreachable');
                },
            });
        }

        if (this.settingsStorage.values.refreshToken) {
            await createRingApi();
            return;
        }

        throw new Error('refresh token are missing.');
    }

    async onReceiveToken(code?: string) {
        const locationIds = this.settingsStorage.values.locationIds ? [this.settingsStorage.values.locationIds] : undefined;
        const cameraStatusPollingSeconds = 20;

        const createRingApi = async () => {
            this.api?.disconnect();

            this.api = new RingBaseApi({
                controlCenterDisplayName: this.settingsStorage.values.controlCenterDisplayName,
                refreshToken: this.settingsStorage.values.refreshToken,
                ffmpegPath: await mediaManager.getFFmpegPath(),
                locationIds,
                cameraStatusPollingSeconds: this.settingsStorage.values.polling ? cameraStatusPollingSeconds : undefined,
                locationModePollingSeconds: this.settingsStorage.values.polling ? cameraStatusPollingSeconds : undefined,
                systemId: this.settingsStorage.values.systemId,
            }, {
                createPeerConnection: () => {
                    throw new Error('unreachable');
                },
            });
        }

        await createRingApi();
    }

    getSettings(): Promise<Setting[]> {
        return this.settingsStorage.getSettings();
    }
    putSetting(key: string, value: SettingValue): Promise<void> {
        return this.settingsStorage.putSetting(key, value);
    }

    async discoverDevices() {
        await this.tryLogin();
        this.console.log('login success, trying discovery');
        this.locations = await this.api.getLocations();

        const locationDevices: Device[] = this.locations.map(location => {
            const interfaces = [
                ScryptedInterface.DeviceProvider,
            ];
            let type = ScryptedDeviceType.DeviceProvider;
            if (location.hasAlarmBaseStation) {
                interfaces.push(ScryptedInterface.SecuritySystem);
                type = ScryptedDeviceType.SecuritySystem;
            }
            return {
                nativeId: location.id,
                name: location.name,
                type,
                interfaces,
            };
        });

        await deviceManager.onDevicesChanged({
            devices: locationDevices,
        });

        // probe to intiailize locations
        for (const device of locationDevices) {
            await this.getDevice(device.nativeId);
        };
    }

    async getDevice(nativeId: string) {
        if (!this.devices.has(nativeId)) {
            const location = this.locations.find(x => x.id === nativeId);
            const device = new RingLocationDevice(this, nativeId, location);
            this.devices.set(nativeId, device);
        }
        return this.devices.get(nativeId);
    }

    async releaseDevice(id: string, nativeId: string): Promise<void> { }
}

export default RingPlugin;
