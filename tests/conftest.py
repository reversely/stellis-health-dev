"""Shared pytest setup: each test starts with empty sign-in and sign-up limits."""
import pytest

from stellis import rate_limit


@pytest.fixture(autouse=True)
def empty_rate_limits():
    for window in (rate_limit.LOGIN_FAILURES_BY_USERNAME, rate_limit.LOGIN_FAILURES_BY_CLIENT,
                   rate_limit.SIGNUPS_BY_CLIENT):
        window._events.clear()
    yield
