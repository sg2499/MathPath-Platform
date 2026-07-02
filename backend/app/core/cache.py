from cachetools import TTLCache, cached
from cachetools.keys import hashkey
from fastapi import Request
from functools import wraps

# Create a global cache for dashboard and results endpoints.
# Max size 1024 items, Time-To-Live 60 seconds.
global_query_cache = TTLCache(maxsize=1024, ttl=60)

def cache_by_user_id():
    """
    A simple decorator to cache FastAPI route responses based on the current user's ID.
    This safely prevents cross-user cache leakage and avoids trying to hash SQLAlchemy objects.
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Extract student from kwargs (standard dependency injection pattern)
            student = kwargs.get("student")
            if not student:
                return func(*args, **kwargs)
                
            # Create a safe, unique cache key based on the function name and student ID
            cache_key = hashkey(func.__name__, student.id)
            
            if cache_key in global_query_cache:
                return global_query_cache[cache_key]
                
            result = func(*args, **kwargs)
            global_query_cache[cache_key] = result
            return result
        return wrapper
    return decorator
