import { describe, expect, it } from 'vitest';
import { LocationService, type LocationEnv } from './locationService';

type Listener = () => void;

function setup(initialPermission: PermissionState) {
  const watches = new Map<number, { success: PositionCallback; error: PositionErrorCallback }>();
  let nextWatch = 1;
  const cleared: number[] = [];
  let hidden = false;
  let visibilityListener: Listener | undefined;
  let permissionState = initialPermission;
  let changeListener: Listener | undefined;

  const geo = {
    watchPosition: (success: PositionCallback, error: PositionErrorCallback) => {
      const id = nextWatch++;
      watches.set(id, { success, error });
      return id;
    },
    clearWatch: (id: number) => {
      cleared.push(id);
      watches.delete(id);
    },
    getCurrentPosition: () => {},
  } as unknown as Geolocation;

  const env: LocationEnv = {
    geo,
    permissions: {
      query: async () => ({
        get state() {
          return permissionState;
        },
        addEventListener: (_type, listener) => {
          changeListener = listener;
        },
      }),
    },
    isHidden: () => hidden,
    onVisibilityChange: (listener) => {
      visibilityListener = listener;
    },
  };

  const service = new LocationService(env);
  const lastWatch = () => [...watches.values()].at(-1);
  const deniedError = { code: 1, PERMISSION_DENIED: 1 } as GeolocationPositionError;

  return {
    service,
    watchCount: () => watches.size,
    cleared,
    setHidden(value: boolean) {
      hidden = value;
      visibilityListener?.();
    },
    setPermission(value: PermissionState) {
      permissionState = value;
      changeListener?.();
    },
    /** The browser says "denied" to the watch; `then` is what the permission is afterwards. */
    deny(then: PermissionState) {
      permissionState = then;
      lastWatch()?.error(deniedError);
    },
    grantPosition() {
      lastWatch()?.success({
        coords: { latitude: 39.7, longitude: -105, accuracy: 8 },
        timestamp: Date.now(),
      } as GeolocationPosition);
    },
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('LocationService', () => {
  it('does not ask on its own before a trip exists', async () => {
    const t = setup('prompt');
    await t.service.init();
    expect(t.watchCount()).toBe(0);
    expect(t.service.getSnapshot().permission).toBe('prompt');
  });

  it('starts silently when permission is already granted', async () => {
    const t = setup('granted');
    await t.service.init();
    expect(t.watchCount()).toBe(1);
  });

  it('asks as soon as it is armed', async () => {
    const t = setup('prompt');
    await t.service.init();
    t.service.arm();
    expect(t.watchCount()).toBe(1);
  });

  it('asks at launch when armed before the permission check finished', async () => {
    const t = setup('prompt');
    const init = t.service.init();
    t.service.arm();
    await init;
    expect(t.watchCount()).toBe(1);
  });

  it('pauses in the background and asks again on return, even after a lapsed one-time grant', async () => {
    const t = setup('granted');
    await t.service.init();
    t.service.arm();
    t.grantPosition();

    t.setHidden(true);
    expect(t.watchCount()).toBe(0);
    expect(t.service.getSnapshot().watching).toBe(false);

    // "Allow this time" lapses while away.
    t.setPermission('prompt');
    t.setHidden(false);
    expect(t.watchCount()).toBe(1);
  });

  it('does not ask while the app is hidden', async () => {
    const t = setup('prompt');
    await t.service.init();
    t.setHidden(true);
    t.service.arm();
    expect(t.watchCount()).toBe(0);
    t.setHidden(false);
    expect(t.watchCount()).toBe(1);
  });

  it('treats a dismissed prompt as "ask later", not "blocked", and stops auto-asking', async () => {
    const t = setup('prompt');
    await t.service.init();
    t.service.arm();
    t.deny('prompt');
    await flush();

    expect(t.service.getSnapshot().permission).toBe('prompt');
    expect(t.watchCount()).toBe(0);

    t.setHidden(true);
    t.setHidden(false);
    expect(t.watchCount()).toBe(0);

    // The banner button asks again.
    t.service.enable();
    expect(t.watchCount()).toBe(1);
  });

  it('marks location blocked when the browser says denied, and stays quiet', async () => {
    const t = setup('prompt');
    await t.service.init();
    t.service.arm();
    t.deny('denied');
    await flush();

    expect(t.service.getSnapshot().permission).toBe('denied');
    t.setHidden(true);
    t.setHidden(false);
    expect(t.watchCount()).toBe(0);
  });

  it('records a position and reports it as fresh', async () => {
    const t = setup('granted');
    await t.service.init();
    t.grantPosition();
    expect(t.service.getFreshFix()).toMatchObject({ lat: 39.7, lng: -105, accuracy: 8 });
  });
});
