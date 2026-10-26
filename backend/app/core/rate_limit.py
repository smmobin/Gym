"""Simple in-memory rate limit for login (MVP / local)."""

from __future__ import annotations

import time
from collections import defaultdict, deque
from threading import Lock


class SlidingWindowRateLimiter:
    def __init__(self, *, max_attempts: int, window_seconds: int) -> None:
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def is_allowed(self, key: str) -> bool:
        now = time.monotonic()
        with self._lock:
            bucket = self._hits[key]
            cutoff = now - self.window_seconds
            while bucket and bucket[0] < cutoff:
                bucket.popleft()
            if len(bucket) >= self.max_attempts:
                return False
            bucket.append(now)
            return True

    def reset(self, key: str | None = None) -> None:
        with self._lock:
            if key is None:
                self._hits.clear()
            else:
                self._hits.pop(key, None)


# Shared limiter for login endpoints (tests may call reset).
login_rate_limiter = SlidingWindowRateLimiter(max_attempts=20, window_seconds=60)

# Mobile identity lookup before auth steps.
lookup_rate_limiter = SlidingWindowRateLimiter(max_attempts=30, window_seconds=60)

# OTP send / verify (stricter than password login).
otp_send_rate_limiter = SlidingWindowRateLimiter(max_attempts=5, window_seconds=60)
otp_verify_rate_limiter = SlidingWindowRateLimiter(max_attempts=20, window_seconds=60)

# Public trial form (by client IP); tests may call reset.
trial_lead_rate_limiter = SlidingWindowRateLimiter(max_attempts=15, window_seconds=60)

# Public landing plans list (by client IP); tests may call reset.
public_plans_rate_limiter = SlidingWindowRateLimiter(max_attempts=60, window_seconds=60)
