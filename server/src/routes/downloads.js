/**
 * Offline downloads for licensed catalog content only (never YouTube).
 *
 * Flow:
 *  1. App registers the device (max MAX_OFFLINE_DEVICES per account).
 *  2. App requests a licence for a track: the server checks plan, rights and
 *     territory and returns a signed download URL plus a per-licence AES key.
 *  3. App downloads over HTTPS, encrypts the file with that key, stores the
 *     key in the OS keystore and the ciphertext in app-private storage.
 *  4. While online the app syncs licences; expired / revoked licences make
 *     the app delete the file and key. Licences last at most 30 days offline.
 */
import { Router } from 'express';
import { z } from 'zod';
import { OfflineLicense, Track, User } from '../models/index.js';
import { validate } from '../middleware/validate.js';
import { requirePremium } from '../middleware/auth.js';
import { signedAudioUrl } from '../services/storage.js';
import { contentKeyFor } from '../services/offlineKeys.js';
import { trackDto, TRACK_POPULATE } from '../services/serializers.js';
import { objectId } from './catalog.js';
import { HttpError, notFound, forbidden } from '../utils/httpError.js';
import env from '../config/env.js';

const router = Router();
const deviceId = z.string().regex(/^[\w-]{8,128}$/);

function assertDevice(user, id) {
  if (!user.offlineDevices.some((d) => d.deviceId === id)) throw forbidden('Register this device for offline listening first');
}

router.get('/devices', (req, res) => res.json({ devices: req.user.offlineDevices, max: env.MAX_OFFLINE_DEVICES }));

router.post('/devices', requirePremium, validate({ body: z.object({ deviceId, name: z.string().trim().max(80).optional() }) }), async (req, res) => {
  const { deviceId: id, name } = req.valid.body;
  const existing = req.user.offlineDevices.find((d) => d.deviceId === id);
  if (!existing) {
    // Conditional update enforces the limit atomically.
    const result = await User.updateOne(
      { _id: req.user._id, [`offlineDevices.${env.MAX_OFFLINE_DEVICES - 1}`]: { $exists: false }, 'offlineDevices.deviceId': { $ne: id } },
      { $push: { offlineDevices: { deviceId: id, name } } },
    );
    if (!result.modifiedCount) {
      throw new HttpError(409, `You can use offline mode on up to ${env.MAX_OFFLINE_DEVICES} devices. Remove one first.`, 'device_limit');
    }
  }
  res.status(existing ? 200 : 201).json({ deviceId: id });
});

router.delete('/devices/:deviceId', validate({ params: z.object({ deviceId }) }), async (req, res) => {
  const id = req.valid.params.deviceId;
  await Promise.all([
    User.updateOne({ _id: req.user._id }, { $pull: { offlineDevices: { deviceId: id } } }),
    OfflineLicense.updateMany({ user: req.user._id, deviceId: id, revokedAt: null }, { $set: { revokedAt: new Date(), revokeReason: 'device_removed' } }),
  ]);
  res.status(204).end();
});

/** Issue (or renew) a licence and return everything needed to download the file. */
router.post('/licenses', requirePremium, validate({ body: z.object({ trackId: objectId, deviceId }) }), async (req, res) => {
  const { trackId, deviceId: device } = req.valid.body;
  assertDevice(req.user, device);

  const track = await Track.findById(trackId).select('+audioKey').populate(TRACK_POPULATE);
  if (!track || track.status !== 'published') throw notFound('Track');
  if (!track.isAvailable('offline', req.country)) {
    throw new HttpError(451, 'This track can’t be downloaded under its licence', 'offline_not_licensed');
  }

  const max = Date.now() + env.OFFLINE_LICENSE_DAYS * 86400_000;
  // Never let a licence outlive the content licence or the paid period.
  const caps = [max, track.rights.validUntil?.getTime(), req.user.subscription?.currentPeriodEnd?.getTime()].filter(Boolean);
  const expiresAt = new Date(Math.min(...caps));

  const license = await OfflineLicense.findOneAndUpdate(
    { user: req.user._id, deviceId: device, track: track._id },
    { $set: { expiresAt, revokedAt: null, revokeReason: null } },
    { upsert: true, new: true },
  );

  res.set('Cache-Control', 'no-store');
  res.status(201).json({
    license: { id: license.id, trackId: track.id, expiresAt },
    // 32 byte AES-256-GCM key, base64. Store only in the OS keystore.
    contentKey: contentKeyFor(license.id),
    download: { url: await signedAudioUrl(track.audioKey, { download: true, ttl: 900 }), mimeType: track.audioMimeType, sizeBytes: track.fileSizeBytes ?? null },
    track: trackDto(track, { user: req.user, country: req.country }),
  });
});

/**
 * Called on app start and periodically while online. Renews valid licences
 * and tells the app which files it must delete.
 */
router.post(
  '/licenses/sync',
  validate({ body: z.object({ deviceId, licenseIds: z.array(objectId).max(5000) }) }),
  async (req, res) => {
    const { deviceId: device, licenseIds } = req.valid.body;
    const licenses = await OfflineLicense.find({ _id: { $in: licenseIds }, user: req.user._id, deviceId: device }).populate('track');
    const found = new Map(licenses.map((l) => [l.id, l]));
    const premium = req.user.isPremium();
    const registered = req.user.offlineDevices.some((d) => d.deviceId === device);
    const now = new Date();
    const renewed = [];
    const revoked = [];

    for (const id of licenseIds) {
      const lic = found.get(id);
      const ok = lic && !lic.revokedAt && premium && registered && lic.track?.isAvailable('offline', req.country, now);
      if (!ok) {
        revoked.push(id);
        if (lic && !lic.revokedAt) {
          lic.revokedAt = now;
          lic.revokeReason = premium ? 'rights_changed' : 'subscription_ended';
          await lic.save();
        }
        continue;
      }
      const caps = [now.getTime() + env.OFFLINE_LICENSE_DAYS * 86400_000, lic.track.rights.validUntil?.getTime(), req.user.subscription?.currentPeriodEnd?.getTime()].filter(Boolean);
      lic.expiresAt = new Date(Math.min(...caps));
      await lic.save();
      renewed.push({ id, expiresAt: lic.expiresAt });
    }
    res.json({ renewed, revoked, serverTime: now });
  },
);

router.delete('/licenses/:id', validate({ params: z.object({ id: objectId }) }), async (req, res) => {
  await OfflineLicense.deleteOne({ _id: req.valid.params.id, user: req.user._id });
  res.status(204).end();
});

export default router;
