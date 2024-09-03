import { TextEncoder, TextDecoder } from 'util';
import { config } from 'dotenv';

config();

Object.assign(global, { TextDecoder, TextEncoder });
