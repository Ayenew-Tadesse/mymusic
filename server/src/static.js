/**
 * Serves the built web app at / and the admin dashboard at /admin from this
 * process, so one server (and one origin) runs the whole product.
 * Unknown GET paths fall back to the app's index.html for client-side routing.
 */
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import env from './config/env.js';
import logger from './config/logger.js';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function resolveDist(dir) {
  if (!dir) return null;
  const abs = path.resolve(serverRoot, dir);
  return fs.existsSync(path.join(abs, 'index.html')) ? abs : null;
}

function spa(dir) {
  const router = express.Router();
  // Hashed build assets never change; index.html must always be revalidated.
  router.use(
    express.static(dir, {
      index: false,
      setHeaders: (res, file) => {
        res.set('Cache-Control', file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    }),
  );
  router.get(/.*/, (req, res, next) => {
    if (!req.accepts('html')) return next();
    res.set('Cache-Control', 'no-cache');
    res.sendFile(path.join(dir, 'index.html'));
  });
  return router;
}

export function mountStatic(app) {
  const admin = resolveDist(env.ADMIN_DIST_DIR);
  const web = resolveDist(env.WEB_DIST_DIR);
  if (admin) app.use('/admin', spa(admin));
  if (web) app.use('/', spa(web));
  logger.info({ web: Boolean(web), admin: Boolean(admin) }, 'Static apps');
}
