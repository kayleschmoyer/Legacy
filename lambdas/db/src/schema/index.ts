import { builder } from './builder';

// Import all schema modules to register them with the builder
import './users';
import './players';
import './statistics';
import './leagues';
import './teams';
import './waivers';
import './trades';
import './matchups';
import './version';
import './scoring';
import './notifications';
import './chat-and-tiebreakers';
import './drafts';
import './gdpr';
import './achievements';
import './badges';
import './playoff-schema';
import './commissioner-tools';
import './on-this-day';
import './activity-log';
import './season-draft-game';
import './season-awards';
import './league-history';
import './dues';
import './analytics';
import './subscriptions';
import './account-merge';
import './scoreboard';
import './disclosure-game';
import './twenty-questions';
import './sports';
import './football';

// Export the final schema
export const schema = builder.toSchema();
