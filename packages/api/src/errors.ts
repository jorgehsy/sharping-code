/** Errors the Router turns into HTTP responses (see `errorHandler` registrations in app.ts). */
export class ConflictError extends Error {
  constructor(message = 'conflict') {
    super(message);
    this.name = 'ConflictError';
  }
}

export class NotImplementedError extends Error {
  constructor(message = 'not implemented') {
    super(message);
    this.name = 'NotImplementedError';
  }
}
