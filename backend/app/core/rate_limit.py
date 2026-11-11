"""Simple in-memory rate limit for login (MVP / local).

State lives in the API process: run a single uvicorn worker (Dockerfile default) or the
limits multiply per worker.
"""

from __future__ import annotations

import time
from collections import defaultdict, deque
from threading import Lock

from starlette.requests import Request


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
            if len(self._hits) > _MAX_TRACKED_KEYS:
                self._prune(cutoff_now=now)
            return True

    def _prune(self, *, cutoff_now: float) -> None:
        cutoff = cutoff_now - self.window_seconds
        stale = [k for k, b in self._hits.items() if not b or b[-1] < cutoff]
        for key in stale:
            self._hits.pop(key, None)

    def reset(self, key: str | None = None) -> None:
        with self._lock:
            if key is None:
                self._hits.clear()
            else:
                self._hits.pop(key, None)


_MAX_TRACKED_KEYS = 50_000


def client_ip(request: Request) -> str:
    """Peer address after uvicorn --proxy-headers (trusted proxy only)."""
    return request.client.host if request.client else "unknown"


# Shared limiter for login endpoints (tests may call reset).
login_rate_limiter = SlidingWindowRateLimiter(max_attempts=20, window_seconds=60)

# Mobile identity lookup before auth steps.
lookup_rate_limiter = SlidingWindowRateLimiter(max_attempts=30, window_seconds=60)

# OTP send / verify (stricter than password login).
otp_send_rate_limiter = SlidingWindowRateLimiter(max_attempts=5, window_seconds=60)
otp_verify_rate_limiter = SlidingWindowRateLimiter(max_attempts=20, window_seconds=60)

# Long windows per mobile: SMS cost (pumping) and OTP guessing across many fresh codes.
otp_send_hourly_limiter = SlidingWindowRateLimiter(max_attempts=10, window_seconds=3600)
otp_verify_hourly_limiter = SlidingWindowRateLimiter(max_attempts=40, window_seconds=3600)

# Per client IP across all auth endpoints (spraying many mobiles from one address).
auth_ip_rate_limiter = SlidingWindowRateLimiter(max_attempts=60, window_seconds=60)
otp_send_ip_hourly_limiter = SlidingWindowRateLimiter(max_attempts=30, window_seconds=3600)

# Public trial form (by client IP); tests may call reset.
trial_lead_rate_limiter = SlidingWindowRateLimiter(max_attempts=15, window_seconds=60)

# Public landing plans list (by client IP); tests may call reset.
public_plans_rate_limiter = SlidingWindowRateLimiter(max_attempts=60, window_seconds=60)

# Public landing group-classes list (by client IP); tests may call reset.
public_group_classes_rate_limiter = SlidingWindowRateLimiter(max_attempts=60, window_seconds=60)

# Public landing testimonials list (by client IP); tests may call reset.
public_testimonials_rate_limiter = SlidingWindowRateLimiter(max_attempts=60, window_seconds=60)


def reset_auth_limiters() -> None:
    for limiter in (
        login_rate_limiter,
        lookup_rate_limiter,
        otp_send_rate_limiter,
        otp_verify_rate_limiter,
        otp_send_hourly_limiter,
        otp_verify_hourly_limiter,
        auth_ip_rate_limiter,
        otp_send_ip_hourly_limiter,
    ):
        limiter.reset()
