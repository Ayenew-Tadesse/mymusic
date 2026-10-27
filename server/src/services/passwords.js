import bcrypt from 'bcryptjs';

const COST = 12;

export const hashPassword = (plain) => bcrypt.hash(plain, COST);

/** Always runs a bcrypt compare so response time doesn't reveal whether the account exists. */
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser', COST);
export const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash || DUMMY_HASH);
