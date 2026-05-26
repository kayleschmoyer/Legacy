/** Throw when a request contains invalid or conflicting user input. Maps to Apollo code `BAD_USER_INPUT`. */
export class UserInputError extends Error {
  readonly extensions = { code: 'BAD_USER_INPUT' } as const;
  constructor(message: string) {
    super(message);
    this.name = 'UserInputError';
  }
}
