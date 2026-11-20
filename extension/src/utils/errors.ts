export class VoltixError extends Error {
  constructor(message: string, public readonly recoverable = true) {
    super(message);
    this.name = 'VoltixError';
  }
}
