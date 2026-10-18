'use strict';

/**
 * backend/src/middleware/validate.js
 *
 * Middleware factory for validating incoming requests with Zod schemas.
 */

const { ValidationError } = require('../shared/errors/AppError');

/**
 * Validates request body, query, or params against a Zod schema.
 * @param {import('zod').ZodSchema} schema
 * @param {'body'|'query'|'params'} [source='body']
 */
function validate(schema, source = 'body') {
    return (req, res, next) => {
        const result = schema.safeParse(req[source]);
        if (!result.success) {
            const details = result.error.issues.map((issue) => ({
                field: issue.path.join('.'),
                issue: issue.message,
            }));
            const primaryMessage = details[0]?.issue || 'Validation failed';
            return next(new ValidationError(primaryMessage, details));
        }

        // Replace with parsed/sanitized value (handling Express 5 req.query getter)
        if (source === 'query' && req.query) {
            for (const key of Object.keys(req.query)) {
                delete req.query[key];
            }
            Object.assign(req.query, result.data);
        } else {
            req[source] = result.data;
        }
        next();
    };
}

module.exports = { validate };
