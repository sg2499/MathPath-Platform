"""2026-10-07 (event-day load test): the backend must never let more requests
in at once than it has database connections for them.

Without that, a burst (a few hundred students pressing Start together) left
every connection held by a request waiting for a thread, and every thread held
by a request waiting for a connection: the worker stood still, processor
idle, for 30 seconds at a time. Measured on a production-style setup, 300
students at once failed 85% of their requests. See REQUEST_CONCURRENCY_LIMIT
in app/database.py.
"""

import asyncio

from app import database
from app.main import RequestConcurrencyLimitMiddleware, app


def test_the_limit_never_exceeds_the_connections_a_worker_keeps_open():
    assert 1 <= database.REQUEST_CONCURRENCY_LIMIT <= database.POOL_SIZE


def test_the_limit_is_installed_on_the_real_app():
    installed = [m for m in app.user_middleware if m.cls is RequestConcurrencyLimitMiddleware]
    assert len(installed) == 1
    assert installed[0].kwargs["limit"] == database.REQUEST_CONCURRENCY_LIMIT


def test_no_more_than_the_limit_are_in_flight_and_everyone_is_served():
    in_flight = 0
    peak = 0
    served = []

    async def slow_app(scope, receive, send):
        nonlocal in_flight, peak
        in_flight += 1
        peak = max(peak, in_flight)
        await asyncio.sleep(0.02)
        in_flight -= 1
        served.append(scope["path"])

    guarded = RequestConcurrencyLimitMiddleware(slow_app, limit=3)

    async def burst():
        await asyncio.gather(*[guarded({"type": "http", "path": f"/r{i}"}, None, None) for i in range(25)])

    asyncio.run(burst())
    assert peak == 3            # never more than the limit at once
    assert len(served) == 25    # and nobody is turned away: the rest waited their turn


def test_a_failing_request_gives_its_place_back():
    calls = 0

    async def flaky_app(scope, receive, send):
        nonlocal calls
        calls += 1
        if calls <= 2:
            raise RuntimeError("boom")

    guarded = RequestConcurrencyLimitMiddleware(flaky_app, limit=1)

    async def run():
        for _ in range(2):
            try:
                await guarded({"type": "http", "path": "/x"}, None, None)
            except RuntimeError:
                pass
        # If a failed request kept its place, this third call would wait forever.
        await asyncio.wait_for(guarded({"type": "http", "path": "/x"}, None, None), timeout=1)

    asyncio.run(run())
    assert calls == 3


def test_non_http_traffic_is_not_counted():
    seen = []

    async def inner(scope, receive, send):
        seen.append(scope["type"])

    guarded = RequestConcurrencyLimitMiddleware(inner, limit=1)
    asyncio.run(guarded({"type": "lifespan"}, None, None))
    assert seen == ["lifespan"]
