/**
 * Offline downloads for licensed catalog tracks.
 *
 *  - Only tracks the server grants a licence for can be downloaded (paid
 *    plan + rights that allow offline use). YouTube content is never
 *    downloaded.
 *  - Files are encrypted at rest with a per-licence key held in the OS
 *    keystore; the index of downloads lives in AsyncStorage.
 *  - Playback decrypts to a temporary cache file which is deleted when the
 *    next track starts and on every launch.
 *  - Licences expire after at most 30 days without a successful sync, and
 *    are revoked when the subscription ends or rights change.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { create } from 'zustand';
import { Downloads } from '@/api/endpoints';
import type { CatalogTrack } from '@/api/types';
import { base64ToBytes, decryptFile, encryptFile } from './crypto';

export type DownloadEntry = {
  trackId: string;
  licenseId: string;
  expiresAt: string;
  mimeType: string;
  sizeBytes: number;
  downloadedAt: string;
  track: CatalogTrack;
};

type State = {
  entries: Record<string, DownloadEntry>;
  inProgress: Record<string, true>;
  loaded: boolean;
};

const INDEX_KEY = 'mm.offline.index';
const DEVICE_KEY = 'mm.deviceId';
const keyName = (licenseId: string) => `mm.ck.${licenseId}`;

const storeDir = () => new Directory(Paths.document, 'offline');
const playDir = () => new Directory(Paths.cache, 'playback');
const encFile = (licenseId: string) => new File(storeDir(), `${licenseId}.mmenc`);
const extFor = (mime: string) => ({ 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/flac': 'flac' })[mime] ?? 'mp3';

export const useDownloads = create<State>(() => ({ entries: {}, inProgress: {}, loaded: false }));

async function persist() {
  await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(useDownloads.getState().entries));
}

async function deviceId() {
  let id = await SecureStore.getItemAsync(DEVICE_KEY);
  if (!id) {
    id = Crypto.randomUUID();
    await SecureStore.setItemAsync(DEVICE_KEY, id);
  }
  return id;
}

function ensureDir(d: Directory) {
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
}

async function deleteLocal(trackId: string) {
  const entry = useDownloads.getState().entries[trackId];
  if (!entry) return;
  const f = encFile(entry.licenseId);
  if (f.exists) f.delete();
  await SecureStore.deleteItemAsync(keyName(entry.licenseId));
  useDownloads.setState((s) => {
    const entries = { ...s.entries };
    delete entries[trackId];
    return { entries };
  });
  await persist();
}

export const offline = {
  /** Load the index, purge expired licences and leftover decrypted files. */
  async init() {
    const raw = await AsyncStorage.getItem(INDEX_KEY);
    useDownloads.setState({ entries: raw ? JSON.parse(raw) : {}, loaded: true });
    const pd = playDir();
    if (pd.exists) pd.delete();
    const now = Date.now();
    for (const e of Object.values(useDownloads.getState().entries)) {
      if (new Date(e.expiresAt).getTime() <= now) await deleteLocal(e.trackId);
    }
  },

  isDownloaded: (trackId: string) => {
    const e = useDownloads.getState().entries[trackId];
    return Boolean(e && new Date(e.expiresAt).getTime() > Date.now());
  },

  async download(track: CatalogTrack) {
    if (useDownloads.getState().inProgress[track.id] || offline.isDownloaded(track.id)) return;
    useDownloads.setState((s) => ({ inProgress: { ...s.inProgress, [track.id]: true } }));
    const tmp = new File(Paths.cache, `dl-${Crypto.randomUUID()}`);
    try {
      const device = await deviceId();
      await Downloads.registerDevice(device);
      const grant = await Downloads.license(track.id, device);
      ensureDir(storeDir());
      await File.downloadFileAsync(grant.download.url, tmp);
      const key = base64ToBytes(grant.contentKey);
      await encryptFile(tmp, encFile(grant.license.id), key, grant.license.id);
      await SecureStore.setItemAsync(keyName(grant.license.id), grant.contentKey, {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
      });
      useDownloads.setState((s) => ({
        entries: {
          ...s.entries,
          [track.id]: {
            trackId: track.id,
            licenseId: grant.license.id,
            expiresAt: grant.license.expiresAt,
            mimeType: grant.download.mimeType,
            sizeBytes: encFile(grant.license.id).size ?? 0,
            downloadedAt: new Date().toISOString(),
            track: grant.track,
          },
        },
      }));
      await persist();
    } finally {
      if (tmp.exists) tmp.delete();
      useDownloads.setState((s) => {
        const inProgress = { ...s.inProgress };
        delete inProgress[track.id];
        return { inProgress };
      });
    }
  },

  async remove(trackId: string) {
    const entry = useDownloads.getState().entries[trackId];
    await deleteLocal(trackId);
    if (entry) Downloads.release(entry.licenseId).catch(() => {});
  },

  async removeAll() {
    for (const id of Object.keys(useDownloads.getState().entries)) await deleteLocal(id);
    const d = storeDir();
    if (d.exists) d.delete();
  },

  /**
   * Decrypt a downloaded track to a temporary file for the player.
   * Returns null when the track isn't available offline.
   */
  async playableUri(trackId: string): Promise<string | null> {
    const entry = useDownloads.getState().entries[trackId];
    if (!entry || new Date(entry.expiresAt).getTime() <= Date.now()) return null;
    const keyB64 = await SecureStore.getItemAsync(keyName(entry.licenseId));
    const src = encFile(entry.licenseId);
    if (!keyB64 || !src.exists) {
      await deleteLocal(trackId);
      return null;
    }
    const pd = playDir();
    if (pd.exists) pd.delete(); // only one decrypted file at a time
    ensureDir(pd);
    const out = new File(pd, `${Crypto.randomUUID()}.${extFor(entry.mimeType)}`);
    await decryptFile(src, out, base64ToBytes(keyB64), entry.licenseId);
    return out.uri;
  },

  /** Renew licences with the server and delete anything revoked. */
  async sync() {
    const entries = Object.values(useDownloads.getState().entries);
    if (!entries.length) return;
    const res = await Downloads.sync(await deviceId(), entries.map((e) => e.licenseId));
    const byLicense = new Map(entries.map((e) => [e.licenseId, e]));
    for (const id of res.revoked) {
      const e = byLicense.get(id);
      if (e) await deleteLocal(e.trackId);
    }
    useDownloads.setState((s) => {
      const next = { ...s.entries };
      for (const r of res.renewed) {
        const e = byLicense.get(r.id);
        if (e && next[e.trackId]) next[e.trackId] = { ...next[e.trackId], expiresAt: r.expiresAt };
      }
      return { entries: next };
    });
    await persist();
  },
};
