"""API routes for issue management"""

from fastapi import APIRouter, Depends, HTTPException

router = APIRouter(prefix="/issues")

@router.post("/{issue_id}/generate")
async def generate_issue(issue_id: str):
    """Generate an email issue with RAG citations"""
    # This would integrate with the LangGraph issue generation workflow
    return {"message": "Issue generation started", "issue_id": issue_id}
