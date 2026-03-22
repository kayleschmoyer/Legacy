type LogArgs = (string | number | boolean | object | null | undefined)[];
interface Logger {
  debug(message: string, ...args: LogArgs): void;
  info(message: string, ...args: LogArgs): void;
  warn(message: string, ...args: LogArgs): void;
  error(message: string, ...args: LogArgs): void;
  fatal(message: string, ...args: LogArgs): void;
}
declare class UniversalLogger implements Logger {
  private shouldLog;
  private formatMessage;
  private writeToFile;
  debug(message: string, ...args: LogArgs): void;
  info(message: string, ...args: LogArgs): void;
  warn(message: string, ...args: LogArgs): void;
  error(message: string, ...args: LogArgs): void;
  fatal(message: string, ...args: LogArgs): void;
}
export declare const LOGGER: UniversalLogger;
export {};
