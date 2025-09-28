import { config } from 'dotenv';
import { TextDecoder, TextEncoder } from 'util';
import * as path from 'path';

config({
  path: path.join(__dirname, '.env'),
});

Object.assign(global, { TextDecoder, TextEncoder });
