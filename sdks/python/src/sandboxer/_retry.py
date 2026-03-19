from __future__ import annotations

import time
import asyncio
from dataclasses import dataclass
from typing import Callable, Awaitable


@dataclass
class RetryOptions:
    max_attempts: int = 1
    interval_s: float = 0.2


def do_retry(opts: RetryOptions, fn: Callable[[], None]) -> None:
    max_attempts = max(opts.max_attempts, 1)
    last_err: Exception | None = None
    for i in range(max_attempts):
        try:
            fn()
            return
        except Exception as e:
            last_err = e
        if i < max_attempts - 1:
            time.sleep(opts.interval_s)
    if last_err:
        raise last_err


async def async_do_retry(opts: RetryOptions, fn: Callable[[], Awaitable[None]]) -> None:
    max_attempts = max(opts.max_attempts, 1)
    last_err: Exception | None = None
    for i in range(max_attempts):
        try:
            await fn()
            return
        except Exception as e:
            last_err = e
        if i < max_attempts - 1:
            await asyncio.sleep(opts.interval_s)
    if last_err:
        raise last_err
