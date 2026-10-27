/**
 * Promote an existing account to admin, or create an admin account.
 * Usage: npm run seed:admin -- admin@example.com "Admin Name"
 * The password is read from ADMIN_PASSWORD so it never lands in shell history.
 */
import { connectDb, disconnectDb } from '../src/config/db.js';
import { User } from '../src/models/index.js';
import { hashPassword } from '../src/services/passwords.js';

const [email, name = 'Admin'] = process.argv.slice(2);
if (!email) {
  console.error('Usage: npm run seed:admin -- <email> [display name]');
  process.exit(1);
}

await connectDb();
let user = await User.findOne({ email: email.toLowerCase() });
if (user) {
  user.role = 'admin';
  await user.save();
  console.log(`Promoted ${email} to admin`);
} else {
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.length < 12) {
    console.error('Set ADMIN_PASSWORD (12+ characters) to create a new admin account');
    process.exit(1);
  }
  user = await User.create({ email, displayName: name, role: 'admin', emailVerified: true, passwordHash: await hashPassword(password) });
  console.log(`Created admin ${email}`);
}
await disconnectDb();
