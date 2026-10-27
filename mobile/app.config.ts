import type { ExpoConfig } from 'expo/config';

/**
 * Dynamic Expo config. Values come from EXPO_PUBLIC_* / build env so the same
 * code builds for development, staging and production (see eas.json).
 */
const IOS_BUNDLE_ID = process.env.IOS_BUNDLE_ID ?? 'app.mymusic.ios';
const ANDROID_PACKAGE = process.env.ANDROID_PACKAGE ?? 'app.mymusic.android';
// iOS Google sign-in redirects through the reversed iOS client id.
const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';
const googleIosScheme = googleIosClientId ? googleIosClientId.split('.').reverse().join('.') : undefined;

const config: ExpoConfig = {
  name: 'MyMusic',
  slug: 'mymusic',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  scheme: ['mymusic', ...(googleIosScheme ? [googleIosScheme] : [])],
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  splash: { image: './assets/splash-icon.png', resizeMode: 'contain', backgroundColor: '#121212' },
  ios: {
    bundleIdentifier: IOS_BUNDLE_ID,
    supportsTablet: true,
    usesAppleSignIn: true,
    associatedDomains: process.env.UNIVERSAL_LINK_DOMAIN ? [`applinks:${process.env.UNIVERSAL_LINK_DOMAIN}`] : [],
    infoPlist: {
      // Background audio is used only for licensed catalog tracks; YouTube
      // content plays exclusively in the visible embedded player.
      UIBackgroundModes: ['audio'],
      ITSAppUsesNonExemptEncryption: false,
    },
    privacyManifests: {
      NSPrivacyAccessedAPITypes: [
        { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults', NSPrivacyAccessedAPITypeReasons: ['CA92.1'] },
        { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp', NSPrivacyAccessedAPITypeReasons: ['C617.1'] },
        { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryDiskSpace', NSPrivacyAccessedAPITypeReasons: ['E174.1'] },
      ],
    },
  },
  android: {
    package: ANDROID_PACKAGE,
    adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#121212' },
    edgeToEdgeEnabled: true,
    // Downloads are encrypted, but keep them out of cloud backups too.
    allowBackup: false,
    permissions: ['android.permission.FOREGROUND_SERVICE', 'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK', 'android.permission.WAKE_LOCK'],
    blockedPermissions: ['android.permission.RECORD_AUDIO', 'android.permission.READ_EXTERNAL_STORAGE', 'android.permission.WRITE_EXTERNAL_STORAGE'],
    intentFilters: process.env.UNIVERSAL_LINK_DOMAIN
      ? [
          {
            action: 'VIEW',
            autoVerify: true,
            data: [{ scheme: 'https', host: process.env.UNIVERSAL_LINK_DOMAIN, pathPrefix: '/p/' }],
            category: ['BROWSABLE', 'DEFAULT'],
          },
        ]
      : [],
  },
  plugins: ['expo-router', 'expo-secure-store', 'expo-web-browser', 'expo-apple-authentication'],
  experiments: { typedRoutes: true },
  extra: {
    eas: { projectId: process.env.EAS_PROJECT_ID },
  },
};

export default config;
