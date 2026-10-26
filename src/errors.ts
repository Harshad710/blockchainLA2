export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super('VALIDATION_ERROR', message, 400, details);
    this.name = 'ValidationError';
  }
}

export class PreflightError extends AppError {
  constructor(message: string, details?: unknown) {
    super('PREFLIGHT_ERROR', message, 422, details);
    this.name = 'PreflightError';
  }
}

export class PaymentNotConfiguredError extends AppError {
  constructor() {
    super(
      'PAYMENTS_NOT_CONFIGURED',
      'Payment processing is not configured on this server. Set PAYMENTS_ENABLED=true with valid credentials.',
      503,
    );
    this.name = 'PaymentNotConfiguredError';
  }
}

export class ResourceLimitError extends AppError {
  constructor(message: string, details?: unknown) {
    super('RESOURCE_LIMIT_EXCEEDED', message, 413, details);
    this.name = 'ResourceLimitError';
  }
}

export class InvalidRequestError extends AppError {
  constructor(message: string, details?: unknown) {
    super('INVALID_REQUEST', message, 400, details);
    this.name = 'InvalidRequestError';
  }
}
