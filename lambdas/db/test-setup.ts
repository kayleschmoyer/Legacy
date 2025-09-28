import { config } from 'dotenv';
import { TextDecoder, TextEncoder } from 'util';

config();

Object.assign(global, { TextDecoder, TextEncoder });
