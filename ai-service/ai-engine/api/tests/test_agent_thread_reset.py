"""Each generation run must start from a clean checkpoint thread."""

from unittest.mock import AsyncMock, Mock

import pytest

from app.services.agent_graph import NewsletterAgent


def _agent_with_fake_graph(order):
    agent = NewsletterAgent(model_service=Mock(), memory_store=Mock())
    agent.model_service.resolve_model = Mock(return_value="m")

    checkpointer = Mock()
    checkpointer.adelete_thread = AsyncMock(side_effect=lambda tid: order.append(("delete", tid)))
    compiled = Mock()
    compiled.checkpointer = checkpointer

    async def ainvoke(state, config):
        order.append(("invoke", config["configurable"]["thread_id"]))
        return {"status": "planning_complete", "plan": {"modules": []}, "messages": []}

    compiled.ainvoke = ainvoke
    agent.compile_graph = AsyncMock(return_value=compiled)
    return agent


@pytest.mark.asyncio
async def test_plan_run_resets_thread_before_invoking():
    order = []
    agent = _agent_with_fake_graph(order)
    await agent.run_plan_generation({"topic": "t"}, "ws-1", series_id="s-1")
    assert order[:2] == [("delete", "plan-s-1"), ("invoke", "plan-s-1")]


@pytest.mark.asyncio
async def test_reset_failure_does_not_block_the_run():
    order = []
    agent = _agent_with_fake_graph(order)
    (await agent.compile_graph()).checkpointer.adelete_thread = AsyncMock(side_effect=RuntimeError("db down"))
    await agent.run_plan_generation({"topic": "t"}, "ws-1", series_id="s-1")
    assert ("invoke", "plan-s-1") in order
