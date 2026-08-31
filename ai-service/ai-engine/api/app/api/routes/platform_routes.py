"""Platform API routes — skills, connectors, insights, workflows, editorial."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.platform.catalog import ALL_CATALOG, catalog_to_dict, list_by_kind
from app.platform.connectors.service import get_connector_service
from app.platform.editorial.tools import (
    get_evaluation_harness,
    get_plugin_packaging,
    get_sandbox,
)
from app.platform.insights.engine import get_insight_engine
from app.platform.skills.registry import get_skill_registry
from app.platform.workflows.engine import get_workflow_engine

router = APIRouter(tags=["platform"])


class ConnectorSyncRequest(BaseModel):
    workspace_id: str
    connector_id: str
    config: Dict[str, Any] = Field(default_factory=dict)
    since: Optional[str] = None


class InsightComputeRequest(BaseModel):
    workspace_data: Dict[str, Any] = Field(default_factory=dict)


class WorkflowRunRequest(BaseModel):
    mode_id: str
    brief: Dict[str, Any] = Field(default_factory=dict)
    context: str = ""
    model: Optional[str] = None


class SandboxRequest(BaseModel):
    skill_id: str
    brief: Dict[str, Any] = Field(default_factory=dict)
    prompt: str = ""


class EvaluateRequest(BaseModel):
    issue: Dict[str, Any] = Field(default_factory=dict)
    prior_issues: List[Dict[str, Any]] = Field(default_factory=list)


class PluginValidateRequest(BaseModel):
    manifest: Dict[str, Any] = Field(default_factory=dict)


@router.get("/platform/catalog")
async def list_catalog(kind: Optional[str] = None):
    if kind:
        items = list_by_kind(kind)  # type: ignore[arg-type]
    else:
        items = ALL_CATALOG
    return {"data": [catalog_to_dict(i) for i in items], "total": len(items)}


@router.get("/platform/skills")
async def list_skills():
    return {"data": get_skill_registry().list_skills()}


@router.get("/platform/skills/{skill_id}")
async def get_skill(skill_id: str):
    skill = get_skill_registry().get(skill_id)
    if not skill:
        raise HTTPException(404, "Skill not found")
    return {"data": catalog_to_dict(skill)}


@router.get("/platform/connectors")
async def list_connectors():
    return {"data": get_connector_service().list_connectors()}


@router.post("/platform/connectors/{connector_id}/health")
async def connector_health(connector_id: str, config: Dict[str, Any]):
    return get_connector_service().health_check(connector_id, config)


@router.post("/platform/connectors/sync")
async def connector_sync(req: ConnectorSyncRequest):
    result = await get_connector_service().sync(req.connector_id, req.config, req.since)
    return {
        "connector_id": result.connector_id,
        "status": result.status,
        "items_fetched": result.items_fetched,
        "items_ingested": result.items_ingested,
        "error": result.error,
        "documents": [
            {
                "external_id": d.external_id,
                "title": d.title,
                "content": d.content[:500],
                "source_type": d.source_type,
                "url": d.url,
                "metadata": d.metadata,
            }
            for d in result.documents
        ],
    }


@router.get("/platform/insights/types")
async def list_insight_types():
    return {"data": get_insight_engine().list_types()}


@router.post("/platform/insights/compute")
async def compute_insights(req: InsightComputeRequest):
    results = get_insight_engine().compute_all(req.workspace_data)
    return {"data": results, "total": len(results)}


@router.get("/platform/workflows")
async def list_workflows():
    return {"data": get_workflow_engine().list_workflows()}


@router.post("/platform/workflows/run")
async def run_workflow(req: WorkflowRunRequest):
    result = await get_workflow_engine().run_pipeline(
        req.mode_id, req.brief, req.context, req.model
    )
    return {"data": result}


@router.post("/platform/sandbox")
async def sandbox_preview(req: SandboxRequest):
    return {"data": get_sandbox().dry_run(req.skill_id, req.brief, req.prompt)}


@router.post("/platform/evaluate")
async def evaluate_issue(req: EvaluateRequest):
    return {"data": get_evaluation_harness().evaluate(req.issue, req.prior_issues)}


@router.post("/platform/plugins/validate")
async def validate_plugin(req: PluginValidateRequest):
    return get_plugin_packaging().validate_manifest(req.manifest)
