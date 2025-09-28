import { Argv } from 'yargs';

export type ArgsType<T> = T extends Argv<infer P> ? P : never;
