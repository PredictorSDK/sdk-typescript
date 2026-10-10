const INITIAL_RETRY_DELAY = 1000; // in milliseconds
const MAX_RETRY_DELAY = 60000; // in milliseconds
const DEFAULT_MAX_RETRIES = 2;
const JITTER_FACTOR = 0.2; // 20% random jitter

function isRetryableStatusCode(statusCode: number): boolean {
    return [408, 429].includes(statusCode) || statusCode >= 500;
}

function addPositiveJitter(delay: number): number {
    const jitterMultiplier = 1 + Math.random() * JITTER_FACTOR;
    return delay * jitterMultiplier;
}

function addSymmetricJitter(delay: number): number {
    const jitterMultiplier = 1 + (Math.random() - 0.5) * JITTER_FACTOR;
    return delay * jitterMultiplier;
}

export function getRetryDelayFromHeaders(response: Response, retryAttempt: number): number {
    const retryAfter = response.headers.get("Retry-After");
    if (retryAfter) {
        const retryAfterSeconds = parseInt(retryAfter, 10);
        if (!Number.isNaN(retryAfterSeconds) && retryAfterSeconds > 0) {
            return Math.min(retryAfterSeconds * 1000, MAX_RETRY_DELAY);
        }

        const retryAfterDate = new Date(retryAfter);
        if (!Number.isNaN(retryAfterDate.getTime())) {
            const delay = retryAfterDate.getTime() - Date.now();
            if (delay > 0) {
                return Math.min(Math.max(delay, 0), MAX_RETRY_DELAY);
            }
        }
    }

    // X-RateLimit-Reset times the rate-limit window, so it paces a 429 only.
    const rateLimitReset = response.status === 429 ? response.headers.get("X-RateLimit-Reset") : null;
    if (rateLimitReset) {
        const resetTime = parseInt(rateLimitReset, 10);
        if (!Number.isNaN(resetTime)) {
            const resetTimeMilliseconds = resetTime >= 1_000_000_000_000 ? resetTime : resetTime * 1000;
            const delay = resetTimeMilliseconds - Date.now();
            if (delay > 0) {
                return Math.min(addPositiveJitter(Math.min(delay, MAX_RETRY_DELAY)), MAX_RETRY_DELAY);
            }
        }
    }

    return Math.min(addSymmetricJitter(Math.min(INITIAL_RETRY_DELAY * 2 ** retryAttempt, MAX_RETRY_DELAY)), MAX_RETRY_DELAY);
}

// Waits between attempts. An abort ends the wait at once, rejecting with
// the signal's reason, so it is not held until the backoff finishes.
function waitUnlessAborted(delay: number, abortSignal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        if (abortSignal?.aborted) {
            reject(abortSignal.reason);
            return;
        }
        const onAbort = () => {
            clearTimeout(timer);
            reject(abortSignal?.reason);
        };
        const timer = setTimeout(() => {
            abortSignal?.removeEventListener("abort", onAbort);
            resolve();
        }, delay);
        abortSignal?.addEventListener("abort", onAbort, { once: true });
    });
}

// Error codes that mean the connection failed before any response arrived:
// the server refused it, reset it, or closed it. Node's fetch (undici),
// node-fetch and Bun report them on the thrown error or its `cause`.
const CONNECTION_FAILURE_CODES = new Set([
    "ECONNREFUSED",
    "ECONNRESET",
    "ECONNABORTED",
    "EPIPE",
    "UND_ERR_SOCKET",
    "ConnectionRefused",
    "ConnectionClosed",
]);

// Whether `error`, thrown for a request that got no response, is a
// connection that failed (see above). A timeout, an abort and any other error
// are not retried: a caller who aborted or timed out asked to stop, and
// waiting does not change the answer to the rest.
function isConnectionFailure(error: unknown, abortSignal?: AbortSignal): boolean {
    if (abortSignal?.aborted) {
        return false;
    }
    let current: unknown = error;
    for (let depth = 0; depth < 5 && current instanceof Error; ++depth) {
        if (current.name === "AbortError" || current.name === "TimeoutError") {
            return false;
        }
        const code = (current as { code?: unknown }).code;
        if (typeof code === "string" && CONNECTION_FAILURE_CODES.has(code)) {
            return true;
        }
        current = (current as { cause?: unknown }).cause;
    }
    return false;
}

function getBackoffDelay(retryAttempt: number): number {
    return Math.min(addSymmetricJitter(Math.min(INITIAL_RETRY_DELAY * 2 ** retryAttempt, MAX_RETRY_DELAY)), MAX_RETRY_DELAY);
}

export async function requestWithRetries(
    requestFn: () => Promise<Response>,
    maxRetries: number = DEFAULT_MAX_RETRIES,
    abortSignal?: AbortSignal,
): Promise<Response> {
    const retries = maxRetries > 0 ? maxRetries : 0;
    let response: Response | undefined;

    for (let i = 0; i <= retries; ++i) {
        try {
            response = await requestFn();
        } catch (error) {
            // No response arrived. A connection that failed before one is retried
            // like a retryable status, with the same backoff and cap; any other
            // error is thrown at once.
            if (i < retries && isConnectionFailure(error, abortSignal)) {
                await waitUnlessAborted(getBackoffDelay(i), abortSignal);
                continue;
            }
            throw error;
        }

        if (i < retries && isRetryableStatusCode(response.status)) {
            await waitUnlessAborted(getRetryDelayFromHeaders(response, i), abortSignal);
            continue;
        }
        break;
    }
    return response!;
}
