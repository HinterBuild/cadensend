"""Queue-order tests for the AI worker (workers/main.py).

Producers (control-api, plan reconcile) RPUSH onto the tail, so the worker
must take from the head to process jobs oldest-first, and every job it takes
must pass through the processing list so a crash can't lose it.
"""

import importlib.util
import json
import pathlib

import pytest

_MAIN = pathlib.Path(__file__).resolve().parents[2] / "workers" / "main.py"
_spec = importlib.util.spec_from_file_location("ai_worker_main", _MAIN)
worker_main = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(worker_main)


class FakeRedisLists:
    """Just the list commands the worker uses, with Redis semantics."""

    def __init__(self):
        self.lists = {}

    def _l(self, key):
        return self.lists.setdefault(key, [])

    async def rpush(self, key, value):
        self._l(key).append(value)

    async def lpush(self, key, value):
        self._l(key).insert(0, value)

    async def lmove(self, src, dst, wherefrom, whereto):
        items = self._l(src)
        if not items:
            return None
        value = items.pop(0 if wherefrom == "LEFT" else -1)
        if whereto == "RIGHT":
            self._l(dst).append(value)
        else:
            self._l(dst).insert(0, value)
        return value

    async def blmove(self, src, dst, timeout, wherefrom, whereto):
        return await self.lmove(src, dst, wherefrom, whereto)

    async def lrem(self, key, count, value):
        items = self._l(key)
        if value in items:
            items.remove(value)


def _worker(fake):
    worker = worker_main.AIWorker.__new__(worker_main.AIWorker)
    worker._redis_client = lambda: fake
    worker.dispatched = []
    worker._dispatch_job = lambda msg, ack=None: worker.dispatched.append(json.loads(msg)["n"])
    worker._llm_task = None
    worker._last_llm_finished = None
    return worker


@pytest.mark.asyncio
async def test_jobs_are_taken_oldest_first():
    fake = FakeRedisLists()
    for n in range(3):
        await fake.rpush(worker_main.QUEUE_KEY, json.dumps({"task": "ingest_source", "n": n}))

    worker = _worker(fake)
    await worker._process_pending_jobs()

    assert worker.dispatched == [0, 1, 2]


@pytest.mark.asyncio
async def test_batched_jobs_go_through_the_processing_list():
    fake = FakeRedisLists()
    for n in range(3):
        await fake.rpush(worker_main.QUEUE_KEY, json.dumps({"task": "ingest_source", "n": n}))

    await _worker(fake)._process_pending_jobs()

    processing = [json.loads(m)["n"] for m in fake.lists[worker_main.PROCESSING_KEY]]
    assert processing == [0, 1, 2]
    assert fake.lists[worker_main.QUEUE_KEY] == []


@pytest.mark.asyncio
async def test_non_matching_extra_is_returned_to_the_front():
    fake = FakeRedisLists()
    await fake.rpush(worker_main.QUEUE_KEY, json.dumps({"task": "ingest_source", "n": 0}))
    await fake.rpush(worker_main.QUEUE_KEY, json.dumps({"task": "generate_plan", "n": 1}))

    worker = _worker(fake)
    await worker._process_pending_jobs()

    assert worker.dispatched == [0]
    assert [json.loads(m)["n"] for m in fake.lists[worker_main.QUEUE_KEY]] == [1]
    assert [json.loads(m)["n"] for m in fake.lists[worker_main.PROCESSING_KEY]] == [0]
