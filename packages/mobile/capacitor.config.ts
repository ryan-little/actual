import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'org.actualbudget.mobile',
  appName: 'Actual Budget',
  // Point to the desktop-client build output
  webDir: '../desktop-client/build',
  server: {
    // Serve from localhost to enable COOP/COEP headers,
    // which are required for SharedArrayBuffer (used by absurd-sql).
    // On iOS, this uses WKURLSchemeHandler with the http scheme,
    // allowing cross-origin isolation to work in WKWebView.
    iosScheme: 'http',
    androidScheme: 'http',
  },
  ios: {
    // Minimum iOS version that supports SharedArrayBuffer in WKWebView
    // with cross-origin isolation headers (iOS 15.2+)
    minVersion: '16.0',
    // Allow inline media playback (needed for some UI interactions)
    allowsLinkPreview: false,
    contentInset: 'always',
    preferredContentMode: 'mobile',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 2000,
      backgroundColor: '#5c3dbb',
      showSpinner: false,
      iosSpinnerStyle: 'small',
      splashFullScreen: true,
      splashImmersive: true,
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#5c3dbb',
    },
  },
};

export default config;
