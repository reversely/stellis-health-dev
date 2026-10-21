"""In-process sliding-window limits for sign-in and sign-up attempts.

The account gateway is one process, so a dictionary of recent attempt times per key
covers every account. Limits reset when the process restarts.
"""
from __future__ import annotations

import threading
import time
from collections import defaultdict, deque


class SlidingWindow:
    """Allow at most `limit` recorded events per key within `seconds`."""

    def __init__(self, limit: int, seconds: float, clock=time.monotonic):
        self.limit = limit
        self.seconds = seconds
        self._clock = clock
        self._events: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def _trim(self, key: str, now: float) -> deque[float]:
        events = self._events[key]
        while events and events[0] <= now - self.seconds:
            events.popleft()
        if not events:
            del self._events[key]
            return deque()
        return events

    def retry_after(self, key: str) -> int:
        """Return seconds until `key` may try again, or 0 when it is under the limit."""
        with self._lock:
            now = self._clock()
            events = self._trim(key, now)
            if len(events) < self.limit:
                return 0
            return max(1, int(events[0] + self.seconds - now + 0.999))

    def record(self, key: str) -> None:
        with self._lock:
            now = self._clock()
            events = self._trim(key, now)
            events.append(now)
            self._events[key] = events

    def clear(self, key: str) -> None:
        with self._lock:
            self._events.pop(key, None)


# Failed sign-ins: 5 per username and 20 per client address in 15 minutes.
LOGIN_FAILURES_BY_USERNAME = SlidingWindow(5, 15 * 60)
LOGIN_FAILURES_BY_CLIENT = SlidingWindow(20, 15 * 60)
# Accounts created: 5 per client address per hour.
SIGNUPS_BY_CLIENT = SlidingWindow(5, 60 * 60)
