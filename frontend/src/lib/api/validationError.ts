// A validation failure that a caller caused, as opposed to something going wrong on our side.
// Several lib/ functions signal "bad input" by throwing (players.ts, replacements.ts), and the
// API routes above them had no way to tell that apart from a database fault - so a rejected
// rank score and a dropped connection both came back as a 500. Routes catch this specific type
// and answer 400; anything else stays a 500.
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError;
}
