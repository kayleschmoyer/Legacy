import {
  pgTable,
  unique,
  serial,
  text,
  varchar,
  foreignKey,
  integer,
  date,
  index,
  timestamp,
  bigint,
  numeric,
  doublePrecision,
  primaryKey,
  char,
  pgEnum,
  pgView,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { accessLevel } from './Enums';

export const users = pgView('users', {
  id: integer('id'),
  email: varchar('email', { length: 100 }),
  username: varchar('username', { length: 50 }),
  accessLevel: accessLevel('access_level'),
}).as(sql`SELECT id,
       email,
       username,
       access_level::character varying::access_level AS access_level
FROM app_internal.users`);
