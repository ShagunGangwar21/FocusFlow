'use strict';

/**
 * Custom application error with HTTP status and standard error code.
 */
class AppError extends Error {
    constructor(message, statusCode = 500, code = 'INTERNAL_SERVER_ERROR', details = []) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
    }
}

class BadRequestError extends AppError {
    constructor(message = 'Bad Request', details = []) {
        super(message, 400, 'BAD_REQUEST', details);
    }
}

class ValidationError extends AppError {
    constructor(message = 'Validation Error', details = []) {
        super(message, 400, 'VALIDATION_ERROR', details);
    }
}

class UnauthorizedError extends AppError {
    constructor(message = 'Unauthorized') {
        super(message, 401, 'UNAUTHORIZED');
    }
}

class ForbiddenError extends AppError {
    constructor(message = 'Forbidden') {
        super(message, 403, 'FORBIDDEN');
    }
}

class NotFoundError extends AppError {
    constructor(message = 'Not Found') {
        super(message, 404, 'NOT_FOUND');
    }
}

class ConflictError extends AppError {
    constructor(message = 'Conflict') {
        super(message, 409, 'CONFLICT');
    }
}

module.exports = {
    AppError,
    BadRequestError,
    ValidationError,
    UnauthorizedError,
    ForbiddenError,
    NotFoundError,
    ConflictError,
};
