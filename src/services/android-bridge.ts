type AndroidNative = {
  getIdentityJson(): string;
  getSettingsJson(): string;
  getStatusJson(): string;
  setCredentials(value: string): string;
  clearCredentials(): string;
  updateSettings(value: string): string;
  startAgent(): void;
  hideWindow(): void;
  showWindow(): void;
  exit(): void;
  openSection(section: string): void;
  authGoogle(): void;
};

declare global {
  interface Window {
    AndroidHost?: AndroidNative;
    controllerAndroid?: true;
    __controllerAndroidState?: (state: string, details: string) => void;
    __controllerGoogleAuthResult?: (
      idToken: string,
      accessToken: string,
      error: string
    ) => void;
  }
}

const native = window.AndroidHost;

if (native) {
  window.controllerAndroid = true;

  const stateListeners = new Set<
    (value: { state: any; details?: string }) => void
  >();

  const settingsListeners = new Set<(value: any) => void>();
  const sectionListeners = new Set<(value: string) => void>();

  const status = () => JSON.parse(native.getStatusJson());

  window.__controllerAndroidState = (state, details) => {
    stateListeners.forEach((listener) => listener({ state, details }));
  };

  window.addEventListener('controller-open-section', (event) => {
    const section = (event as CustomEvent<string>).detail;
    sectionListeners.forEach((listener) => listener(section));
  });

  window.controllerDesktop = {
    getIdentity: async () => JSON.parse(native.getIdentityJson()),

    getSettings: async () => JSON.parse(native.getSettingsJson()),

    getStatus: async () => status(),

    setCredentials: async (value) =>
      native.setCredentials(JSON.stringify(value)) === 'true',

    clearCredentials: async () =>
      native.clearCredentials() === 'true',

    updateSettings: async (value) => {
      const settings = JSON.parse(
        native.updateSettings(JSON.stringify(value))
      );

      settingsListeners.forEach((listener) => listener(settings));

      return settings;
    },

    startAgent: async () => {
      native.startAgent();
      return true;
    },

    hideWindow: async () => native.hideWindow(),

    showWindow: async () => native.showWindow(),

    openSection: async (value) => native.openSection(value),

    exit: async () => native.exit(),

    authGoogle: async () => {
      native.authGoogle();

      return await new Promise<{
        idToken: string;
        accessToken?: string;
      }>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          window.__controllerGoogleAuthResult = undefined;
          reject(new Error('Google Sign-In timed out.'));
        }, 120000);

        window.__controllerGoogleAuthResult = (
          idToken,
          accessToken,
          error
        ) => {
          window.clearTimeout(timeout);
          window.__controllerGoogleAuthResult = undefined;

          if (error) {
            reject(new Error(error));
            return;
          }

          if (!idToken) {
            reject(
              new Error(
                'Google did not return a valid authentication token.'
              )
            );
            return;
          }

          resolve({
            idToken,
            accessToken: accessToken || undefined,
          });
        };
      });
    },

    onState: (callback) => {
      stateListeners.add(callback);
      callback(status());
      return () => stateListeners.delete(callback);
    },

    onSettings: (callback) => {
      settingsListeners.add(callback);
      return () => settingsListeners.delete(callback);
    },

    onOpenSection: (callback) => {
      sectionListeners.add(callback);
      return () => sectionListeners.delete(callback);
    },

    onSignal: () => () => {},

    acknowledgeSignal: () => {},
  };
}

export {};
