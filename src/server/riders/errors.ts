/* LOWPASS — Riders: one error type for every rider server module (its own
   file so photos / embeds can throw it without importing the actions). */

export class RiderError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public data?: unknown,
  ) {
    super(message);
  }
}
