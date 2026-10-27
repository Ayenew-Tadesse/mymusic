import { start, stop, reset, signUp, models } from './helpers.js';

let api;
beforeAll(async () => { api = await start(); });
afterAll(stop);
beforeEach(reset);

async function seedTrack(overrides = {}) {
  const artist = await models.Artist.create({ name: 'The Licensed Band' });
  const album = await models.Album.create({ title: 'First Album', artist: artist._id, artworkUrl: 'https://cdn.example.com/a.jpg' });
  return models.Track.create({
    title: 'Owned Song',
    artist: artist._id,
    album: album._id,
    durationSec: 200,
    audioKey: 'audio/test.mp3',
    status: 'published',
    rights: { licenseType: 'owned', licensor: 'MyMusic Records', territories: ['WW'], offlineAllowed: true, validFrom: new Date(Date.now() - 1000) },
    ...overrides,
  });
}

describe('playlists', () => {
  test('create, add items, reorder, share and view anonymously', async () => {
    const s = await signUp(api);
    const track = await seedTrack();
    const created = await api.post('/api/v1/playlists').set(s.auth).send({ name: 'Road trip' });
    expect(created.status).toBe(201);
    const id = created.body.playlist.id;

    const added = await api
      .post(`/api/v1/playlists/${id}/items`)
      .set(s.auth)
      .send({ items: [{ kind: 'catalog', trackId: track.id }, { kind: 'catalog', trackId: track.id }] });
    expect(added.status).toBe(201);
    const items = added.body.playlist.items;
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ kind: 'catalog', title: 'Owned Song', artworkUrl: 'https://cdn.example.com/a.jpg', durationSec: 200 });
    expect(added.body.playlist.totalDurationSec).toBe(400);

    const moved = await api.put(`/api/v1/playlists/${id}/items/order`).set(s.auth).send({ itemId: items[1].itemId, toIndex: 0 });
    expect(moved.body.playlist.items[0].itemId).toBe(items[1].itemId);

    // Private playlists are invisible to others.
    const other = await signUp(api);
    expect((await api.get(`/api/v1/playlists/${id}`).set(other.auth)).status).toBe(404);

    const share = await api.post(`/api/v1/playlists/${id}/share`).set(s.auth).send({ visibility: 'unlisted' });
    expect(share.status).toBe(200);
    const shareId = share.body.shareUrl.split('/p/')[1];
    const pub = await api.get(`/api/v1/playlists/shared/${shareId}`);
    expect(pub.status).toBe(200);
    expect(pub.body.playlist.name).toBe('Road trip');
    const html = await api.get(`/p/${shareId}`);
    expect(html.text).toContain('Road trip');
  });

  test('collaboration invite lets another user edit', async () => {
    const owner = await signUp(api);
    const friend = await signUp(api);
    const { body } = await api.post('/api/v1/playlists').set(owner.auth).send({ name: 'Together' });
    const invite = await api.post(`/api/v1/playlists/${body.playlist.id}/invite`).set(owner.auth);
    const join = await api.post('/api/v1/playlists/join').set(friend.auth).send({ token: invite.body.token });
    expect(join.status).toBe(200);
    expect(join.body.playlist.canEdit).toBe(true);
    const rename = await api.patch(`/api/v1/playlists/${body.playlist.id}`).set(friend.auth).send({ name: 'Ours' });
    expect(rename.status).toBe(200);
    const vis = await api.patch(`/api/v1/playlists/${body.playlist.id}`).set(friend.auth).send({ visibility: 'public' });
    expect(vis.status).toBe(403);
  });

  test('rejects malformed input', async () => {
    const s = await signUp(api);
    const { body } = await api.post('/api/v1/playlists').set(s.auth).send({ name: 'x' });
    const bad = await api.post(`/api/v1/playlists/${body.playlist.id}/items`).set(s.auth).send({ items: [{ kind: 'youtube', videoId: { $ne: null } }] });
    expect(bad.status).toBe(400);
  });
});

describe('favorites and history', () => {
  test('like / unlike and record plays', async () => {
    const s = await signUp(api);
    const track = await seedTrack();
    expect((await api.post('/api/v1/library/favorites').set(s.auth).send({ kind: 'catalog', trackId: track.id })).status).toBe(204);
    // Idempotent
    expect((await api.post('/api/v1/library/favorites').set(s.auth).send({ kind: 'catalog', trackId: track.id })).status).toBe(204);
    const ids = await api.get('/api/v1/library/favorites/ids').set(s.auth);
    expect(ids.body.trackIds).toEqual([track.id]);
    const favs = await api.get('/api/v1/library/favorites').set(s.auth);
    expect(favs.body.items[0].title).toBe('Owned Song');

    const play = await api
      .post('/api/v1/library/history')
      .set(s.auth)
      .send({ plays: [{ kind: 'catalog', trackId: track.id, msPlayed: 45_000, platform: 'ios' }] });
    expect(play.status).toBe(202);
    const hist = await api.get('/api/v1/library/history').set(s.auth);
    expect(hist.body.items).toHaveLength(1);
    expect((await models.Track.findById(track.id)).playCount).toBe(1);

    await api.delete('/api/v1/library/favorites').set(s.auth).send({ kind: 'catalog', trackId: track.id });
    expect((await api.get('/api/v1/library/favorites/ids').set(s.auth)).body.trackIds).toEqual([]);
  });
});

describe('catalog rights', () => {
  test('territory and licence window are enforced', async () => {
    const s = await signUp(api);
    await seedTrack({ title: 'Only in Germany', rights: { licenseType: 'licensed', licensor: 'Label', territories: ['DE'], validFrom: new Date(0) } });
    await seedTrack({ title: 'Expired', rights: { licenseType: 'licensed', licensor: 'Label', validFrom: new Date(0), validUntil: new Date(Date.now() - 1000) } });
    await seedTrack({ title: 'Everywhere' });

    const us = await api.get('/api/v1/catalog/tracks').set(s.auth).set('cf-ipcountry', 'US');
    expect(us.body.items.map((t) => t.title)).toEqual(['Everywhere']);
    const de = await api.get('/api/v1/catalog/tracks').set(s.auth).set('cf-ipcountry', 'DE');
    expect(de.body.items.map((t) => t.title).sort()).toEqual(['Everywhere', 'Only in Germany']);
  });

  test('premium-only tracks and downloads require a paid plan', async () => {
    const s = await signUp(api);
    const track = await seedTrack({ freeTier: false });
    const stream = await api.get(`/api/v1/catalog/tracks/${track.id}/stream`).set(s.auth);
    expect(stream.status).toBe(402);
    const dev = await api.post('/api/v1/downloads/devices').set(s.auth).send({ deviceId: 'device-12345678' });
    expect(dev.status).toBe(402);
  });

  test('device limit is enforced for offline downloads', async () => {
    const s = await signUp(api);
    await models.User.updateOne(
      { _id: s.user.id },
      { subscription: { plan: 'premium', status: 'active', currentPeriodEnd: new Date(Date.now() + 86400_000) } },
    );
    for (const i of [1, 2, 3]) {
      expect((await api.post('/api/v1/downloads/devices').set(s.auth).send({ deviceId: `device-0000000${i}` })).status).toBe(201);
    }
    const fourth = await api.post('/api/v1/downloads/devices').set(s.auth).send({ deviceId: 'device-00000004' });
    expect(fourth.status).toBe(409);
    // Re-registering a known device is fine.
    expect((await api.post('/api/v1/downloads/devices').set(s.auth).send({ deviceId: 'device-00000001' })).status).toBe(200);
  });
});

describe('YouTube playlist import', () => {
  const PL = 'PLtestplaylist0001';
  const ids = ['aaaaaaaaaa1', 'bbbbbbbbbb2', 'cccccccccc3', 'dddddddddd4'];
  let realFetch;

  beforeAll(() => {
    realFetch = global.fetch;
    // Fake YouTube Data API: 4 videos over two pages, one of them private.
    global.fetch = async (input) => {
      const url = new URL(String(input));
      const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
      if (url.pathname.endsWith('/playlists')) {
        return json({ items: url.searchParams.get('id') === PL ? [{ id: PL, snippet: { title: 'Road songs', channelTitle: 'Some DJ', thumbnails: {} }, contentDetails: { itemCount: 4 } }] : [] });
      }
      if (url.pathname.endsWith('/playlistItems')) {
        const second = url.searchParams.get('pageToken') === 'p2';
        const page = second ? ids.slice(2) : ids.slice(0, 2);
        return json({ items: page.map((videoId) => ({ contentDetails: { videoId } })), nextPageToken: second ? undefined : 'p2' });
      }
      if (url.pathname.endsWith('/videos')) {
        const asked = url.searchParams.get('id').split(',');
        return json({
          items: asked.map((id) => ({
            id,
            snippet: { title: `Song ${id}`, channelTitle: 'Artist', thumbnails: {} },
            contentDetails: { duration: 'PT3M' },
            status: { embeddable: true, privacyStatus: id === 'cccccccccc3' ? 'private' : 'public', uploadStatus: 'processed' },
          })),
        });
      }
      return realFetch(input);
    };
  });
  afterAll(() => {
    global.fetch = realFetch;
  });

  test('preview, import into a new playlist, then re-import without duplicates', async () => {
    const s = await signUp(api);
    const link = `https://www.youtube.com/playlist?list=${PL}`;

    const preview = await api.get('/api/v1/youtube/playlist').query({ url: link }).set(s.auth);
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({ title: 'Road songs', channelTitle: 'Some DJ', playableCount: 3, skipped: 1 });

    const created = await api.post('/api/v1/playlists/import/youtube').set(s.auth).send({ url: link, name: 'My road songs' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ added: 3, unavailable: 1, alreadyInPlaylist: 0 });
    expect(created.body.playlist.name).toBe('My road songs');
    expect(created.body.playlist.visibility).toBe('private');
    expect(created.body.playlist.items.map((i) => i.videoId)).toEqual(['aaaaaaaaaa1', 'bbbbbbbbbb2', 'dddddddddd4']);

    const again = await api.post('/api/v1/playlists/import/youtube').set(s.auth).send({ url: link, playlistId: created.body.playlist.id });
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ added: 0, alreadyInPlaylist: 3 });

    // Only ids are stored, never YouTube titles.
    const doc = await models.Playlist.findById(created.body.playlist.id).lean();
    expect(doc.items.every((i) => i.kind === 'youtube' && i.videoId && !i.title)).toBe(true);
  });

  test('rejects bad links, missing playlists and other people’s playlists', async () => {
    const s = await signUp(api);
    const other = await signUp(api);
    const bad = await api.post('/api/v1/playlists/import/youtube').set(s.auth).send({ url: 'https://example.com', name: 'x' });
    expect(bad.status).toBe(400);
    const missing = await api.post('/api/v1/playlists/import/youtube').set(s.auth).send({ url: 'https://www.youtube.com/playlist?list=PLdoesnotexist01', name: 'x' });
    expect(missing.status).toBe(404);
    const mix = await api.get('/api/v1/youtube/playlist').query({ url: 'https://www.youtube.com/watch?v=aaaaaaaaaa1&list=RDaaaaaaaaaa1' }).set(s.auth);
    expect(mix.status).toBe(422);
    const { body } = await api.post('/api/v1/playlists').set(other.auth).send({ name: 'Not yours' });
    const foreign = await api.post('/api/v1/playlists/import/youtube').set(s.auth).send({ url: `https://www.youtube.com/playlist?list=${PL}`, playlistId: body.playlist.id });
    expect(foreign.status).toBe(404);
  });
});
