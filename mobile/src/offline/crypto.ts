/**
 * Chunked AES-256-GCM file encryption for offline downloads.
 *
 * File layout:  "MMv1" | repeat( u32 BE length | 12 byte IV | ciphertext+16 byte tag )
 *
 * Each chunk's additional authenticated data binds the licence id, chunk
 * index and a "last chunk" flag, so chunks can't be reordered, swapped
 * between files or truncated without decryption failing.
 * Working in 512 KB chunks keeps memory flat regardless of track length.
 */
import { gcm } from '@noble/ciphers/aes.js';
import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';

const MAGIC = new Uint8Array([0x4d, 0x4d, 0x76, 0x31]); // "MMv1"
const CHUNK = 512 * 1024;
const IV_LEN = 12;
const encoder = new TextEncoder();

const aad = (licenseId: string, index: number, last: boolean) => encoder.encode(`${licenseId}:${index}:${last ? 1 : 0}`);

function u32(n: number) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n);
  return b;
}

export function base64ToBytes(b64: string) {
  const bin = globalThis.atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Yield to the JS event loop so long operations don't freeze the UI. */
const tick = () => new Promise((r) => setTimeout(r, 0));

export async function encryptFile(src: File, dest: File, key: Uint8Array, licenseId: string) {
  const total = src.size ?? 0;
  if (dest.exists) dest.delete();
  dest.create();
  const input = src.open();
  const output = dest.open();
  try {
    output.writeBytes(MAGIC);
    let index = 0;
    let read = 0;
    while (read < total) {
      const plain = input.readBytes(Math.min(CHUNK, total - read));
      read += plain.length;
      const iv = Crypto.getRandomBytes(IV_LEN);
      const sealed = gcm(key, iv, aad(licenseId, index, read >= total)).encrypt(plain);
      output.writeBytes(u32(sealed.length));
      output.writeBytes(iv);
      output.writeBytes(sealed);
      index += 1;
      if (index % 4 === 0) await tick();
    }
  } finally {
    input.close();
    output.close();
  }
}

export async function decryptFile(src: File, dest: File, key: Uint8Array, licenseId: string) {
  const total = src.size ?? 0;
  if (dest.exists) dest.delete();
  dest.create();
  const input = src.open();
  const output = dest.open();
  try {
    const magic = input.readBytes(4);
    if (magic.some((b, i) => b !== MAGIC[i])) throw new Error('Not a MyMusic offline file');
    let pos = 4;
    let index = 0;
    while (pos < total) {
      const len = new DataView(input.readBytes(4).buffer).getUint32(0);
      const iv = input.readBytes(IV_LEN);
      const sealed = input.readBytes(len);
      pos += 4 + IV_LEN + len;
      // Throws if the data, key or position was tampered with.
      output.writeBytes(gcm(key, iv, aad(licenseId, index, pos >= total)).decrypt(sealed));
      index += 1;
      if (index % 4 === 0) await tick();
    }
  } catch (e) {
    output.close();
    dest.delete();
    throw e;
  } finally {
    input.close();
    try {
      output.close();
    } catch {
      // already closed after a failure
    }
  }
}
