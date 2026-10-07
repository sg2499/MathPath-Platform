from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from app.core.config import DATABASE_URL

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine_kwargs = {"connect_args": connect_args, "future": True, "pool_pre_ping": True}

# Connections one backend worker may hold at once: POOL_SIZE kept open, plus
# up to MAX_OVERFLOW more under load.
POOL_SIZE = 20
MAX_OVERFLOW = 10

# How many requests one backend worker works on at the same time; the rest
# wait their turn at the door (see RequestConcurrencyLimitMiddleware in
# app/main.py). MUST NOT exceed POOL_SIZE.
#
# 2026-10-07 (event-day load test). Every request holds one database
# connection from its first query (the sign-in check) to its last, but it is
# handed between several short thread jobs on the way (sign-in check, role
# check, the endpoint itself). With no limit, a burst -- a few hundred
# students pressing Start together -- let more requests in than there were
# connections. Thirty of them took a connection and then queued for a thread
# for their next step; every thread was meanwhile occupied by a newer request
# waiting for a connection. Neither side could move. The worker stood still
# with the processor idle until the pool's 30-second timeout, failed
# everything, and did it again. Measured on a production-style setup: 100
# students at once were fine; at 300, 85% of all requests failed.
#
# Letting in no more requests than there are connections removes the
# standstill entirely: a request that is in never waits for a connection.
# Twenty at a time per worker is far more than two processor cores can
# usefully run in parallel, so this costs no speed; under a burst the extra
# requests simply wait a moment longer in line.
REQUEST_CONCURRENCY_LIMIT = 20

if not DATABASE_URL.startswith("sqlite"):
    engine_kwargs["pool_size"] = POOL_SIZE
    engine_kwargs["max_overflow"] = MAX_OVERFLOW

engine = create_engine(DATABASE_URL, **engine_kwargs)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
