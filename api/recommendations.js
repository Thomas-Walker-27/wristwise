import { database } from '../lib/database.js';
import { createRecommendationsHandler } from '../lib/recommendations.js';
export default createRecommendationsHandler(database);
