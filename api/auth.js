import { database } from '../lib/database.js';
import { createHandler } from '../lib/auth.js';
export default createHandler(database);
