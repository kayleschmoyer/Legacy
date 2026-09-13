// MIXED barrel: local code (LOGGER) alongside `export … from` re-exports.
// Mirrors lib/logging/src/index.ts, whose shape exposed LS-10056.
import { createConsoleLogger } from './factories';

export const LOGGER = createConsoleLogger();

export { DeviceFileStub } from './device-file-stub';
