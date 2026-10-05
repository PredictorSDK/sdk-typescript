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

export async function requestWithRetries(
    requestFn: () => Promise<Response>,
    maxRetries: number = DEFAULT_MAX_RETRIES,
    abortSignal?: AbortSignal,
): Promise<Response> {
    let response: Response = await requestFn();

    for (let i = 0; i < maxRetries; ++i) {
        if (isRetryableStatusCode(response.status)) {
            const delay = getRetryDelayFromHeaders(response, i);

            await waitUnlessAborted(delay, abortSignal);
            response = await requestFn();
        } else {
            break;
        }
    }
    return response!;
}
