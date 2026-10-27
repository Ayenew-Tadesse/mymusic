/**
 * Native social sign-in. Each helper returns the provider's signed token,
 * which the API verifies before creating a session.
 */
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { Auth } from '@/api/endpoints';

WebBrowser.maybeCompleteAuthSession();

export const googleConfigured = Boolean(
  Platform.select({
    ios: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    android: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    default: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  }),
);

/** Google sign-in via the system browser (OAuth 2.0 + PKCE). Returns [ready, promptAsync]. */
export function useGoogleIdToken() {
  const [request, , promptAsync] = Google.useIdTokenAuthRequest({
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    selectAccount: true,
  });

  const signIn = async () => {
    const result = await promptAsync();
    if (result.type !== 'success') return null;
    const idToken = result.params.id_token ?? result.authentication?.idToken;
    if (!idToken) throw new Error('Google did not return an ID token');
    return Auth.google(idToken);
  };

  return { ready: Boolean(request) && googleConfigured, signIn };
}

export const appleAvailable = () => (Platform.OS === 'ios' ? AppleAuthentication.isAvailableAsync() : Promise.resolve(false));

/**
 * Sign in with Apple. A random nonce is generated per attempt; Apple embeds
 * its SHA-256 in the identity token and the server checks it, which stops
 * replay of intercepted tokens.
 */
export async function signInWithApple() {
  const rawNonce = Array.from(Crypto.getRandomBytes(32), (b) => b.toString(16).padStart(2, '0')).join('');
  const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  try {
    const cred = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce: hashed,
    });
    if (!cred.identityToken) throw new Error('Apple did not return an identity token');
    const fullName = [cred.fullName?.givenName, cred.fullName?.familyName].filter(Boolean).join(' ') || undefined;
    return Auth.apple({ identityToken: cred.identityToken, nonce: rawNonce, authorizationCode: cred.authorizationCode ?? undefined, fullName });
  } catch (e) {
    if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') return null;
    throw e;
  }
}
