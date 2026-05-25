// Mobile/web destinations (no Node fs dependencies). The device-file
// destination is intentionally not re-exported here so consumers must import
// it explicitly from its `.native` path — that keeps Jest from pulling
// `expo-file-system` into web/node test environments.
export { ConsoleOutputDestination } from './ConsoleOutputDestination';
