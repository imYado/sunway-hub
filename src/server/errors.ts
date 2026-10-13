// Errors thrown by the data-access layer. Server actions turn these into
// friendly messages; route handlers turn them into status codes.

export class AppError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to do that.") {
    super(message, 403);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "We could not find that.") {
    super(message, 404);
    this.name = "NotFoundError";
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Too many attempts. Please wait a while and try again.") {
    super(message, 429);
    this.name = "RateLimitError";
  }
}

export class ReauthRequiredError extends AppError {
  constructor() {
    super("Please confirm your password to continue.", 401);
    this.name = "ReauthRequiredError";
  }
}

export class ProfanityError extends AppError {
  constructor() {
    super("Please remove inappropriate language and try again.", 400);
    this.name = "ProfanityError";
  }
}
