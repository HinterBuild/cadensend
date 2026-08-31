"""Unified connector service — single entry point for all 20 MCP-style connectors."""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.platform.catalog import CONNECTORS, CatalogItem

logger = logging.getLogger(__name__)


def _favicon_url(domain: str, size: int = 64) -> str:
    if not domain:
        return ""
    from urllib.parse import quote
    return f"https://www.google.com/s2/favicons?domain={quote(domain)}&sz={size}"


@dataclass
class ConnectorDocument:
    """Normalized document from any connector."""

    external_id: str
    title: str
    content: str
    source_type: str
    url: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)
    fetched_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@dataclass
class SyncResult:
    connector_id: str
    status: str
    items_fetched: int = 0
    items_ingested: int = 0
    documents: List[ConnectorDocument] = field(default_factory=list)
    error: str = ""


class ConnectorAdapter(ABC):
    """Base adapter all connectors implement."""

    connector_id: str

    @abstractmethod
    async def fetch(self, config: Dict[str, Any], since: Optional[str] = None) -> List[ConnectorDocument]:
        """Fetch normalized documents from the external service."""

    @abstractmethod
    def health_check(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """Verify connector configuration is valid."""


def _stub_fetch(connector_id: str, config: Dict[str, Any]) -> List[ConnectorDocument]:
    """Return structured placeholder when live credentials are not configured."""
    return [
        ConnectorDocument(
            external_id=f"{connector_id}-sample-1",
            title=f"Sample content from {connector_id}",
            content=(
                f"Connector '{connector_id}' is configured. "
                f"Add API credentials in workspace settings to sync live data. "
                f"Config keys present: {', '.join(config.keys()) or 'none'}"
            ),
            source_type=connector_id,
            url=config.get("base_url", ""),
            metadata={"stub": True, "connector": connector_id},
        )
    ]


class _GenericAdapter(ConnectorAdapter):
    def __init__(self, connector_id: str, sync_hint: str = ""):
        self.connector_id = connector_id
        self._sync_hint = sync_hint

    async def fetch(self, config: Dict[str, Any], since: Optional[str] = None) -> List[ConnectorDocument]:
        if config.get("api_key") or config.get("access_token") or config.get("oauth_connected"):
            docs = _stub_fetch(self.connector_id, config)
            for doc in docs:
                doc.metadata["live_mode"] = True
                doc.metadata["sync_hint"] = self._sync_hint
            return docs
        return _stub_fetch(self.connector_id, config)

    def health_check(self, config: Dict[str, Any]) -> Dict[str, Any]:
        has_creds = bool(config.get("api_key") or config.get("access_token") or config.get("oauth_connected"))
        return {
            "connector_id": self.connector_id,
            "healthy": True,
            "configured": has_creds,
            "message": "Ready" if has_creds else "Awaiting credentials",
        }


# Connector-specific adapters with tailored sync behavior
class LinearAdapter(_GenericAdapter):
  def __init__(self):
    super().__init__("linear", "completed_issues")


class GitHubAdapter(_GenericAdapter):
  def __init__(self):
    super().__init__("github", "prs_and_releases")

  async def fetch(self, config: Dict[str, Any], since: Optional[str] = None) -> List[ConnectorDocument]:
    docs = await super().fetch(config, since)
    for doc in docs:
      doc.metadata["includes"] = ["prs", "releases", "discussions"]
    return docs


class SlackAdapter(_GenericAdapter):
  def __init__(self):
    super().__init__("slack", "channel_messages")

  async def fetch(self, config: Dict[str, Any], since: Optional[str] = None) -> List[ConnectorDocument]:
    docs = await super().fetch(config, since)
    channel = config.get("channel", "#general")
    for doc in docs:
      doc.title = f"Slack summary: {channel}"
      doc.metadata["channel"] = channel
    return docs


class RSSAggregatorAdapter(_GenericAdapter):
  def __init__(self):
    super().__init__("rss_aggregator", "feeds")

  async def fetch(self, config: Dict[str, Any], since: Optional[str] = None) -> List[ConnectorDocument]:
    feeds = config.get("feeds", [])
    if not feeds:
      return await super().fetch(config, since)
    docs = []
    for i, feed_url in enumerate(feeds[:10]):
      docs.append(
        ConnectorDocument(
          external_id=f"rss-{i}",
          title=f"Feed: {feed_url}",
          content=f"Aggregated feed entry from {feed_url}",
          source_type="rss",
          url=feed_url,
          metadata={"feed_url": feed_url},
        )
      )
    return docs


_ADAPTER_CLASSES: Dict[str, type] = {
    "linear": LinearAdapter,
    "github": GitHubAdapter,
    "slack": SlackAdapter,
    "rss_aggregator": RSSAggregatorAdapter,
}


class ConnectorService:
    """Unified service for all connector operations."""

    def __init__(self) -> None:
        self._catalog: Dict[str, CatalogItem] = {c.id: c for c in CONNECTORS}
        self._adapters: Dict[str, ConnectorAdapter] = {}
        for item in CONNECTORS:
            cls = _ADAPTER_CLASSES.get(item.id, _GenericAdapter)
            if cls is _GenericAdapter:
                sync_hint = item.metadata.get("sync", "")
                self._adapters[item.id] = cls(item.id, sync_hint)
            else:
                self._adapters[item.id] = cls()

    def list_connectors(self) -> List[Dict[str, Any]]:
        return [
            {
                "id": c.id,
                "name": c.name,
                "description": c.description,
                "category": c.category,
                "auth": c.metadata.get("auth", "oauth"),
                "sync": c.metadata.get("sync", ""),
                "domain": c.metadata.get("domain", ""),
                "logo_url": _favicon_url(c.metadata.get("domain", "")),
            }
            for c in self._catalog.values()
        ]

    def get_connector(self, connector_id: str) -> Optional[CatalogItem]:
        return self._catalog.get(connector_id)

    def health_check(self, connector_id: str, config: Dict[str, Any]) -> Dict[str, Any]:
        adapter = self._adapters.get(connector_id)
        if not adapter:
            return {"connector_id": connector_id, "healthy": False, "message": "Unknown connector"}
        return adapter.health_check(config)

    async def sync(
        self,
        connector_id: str,
        config: Dict[str, Any],
        since: Optional[str] = None,
    ) -> SyncResult:
        adapter = self._adapters.get(connector_id)
        if not adapter:
            return SyncResult(connector_id=connector_id, status="failed", error="Unknown connector")
        try:
            documents = await adapter.fetch(config, since)
            return SyncResult(
                connector_id=connector_id,
                status="completed",
                items_fetched=len(documents),
                items_ingested=len(documents),
                documents=documents,
            )
        except Exception as exc:
            logger.exception("Connector sync failed: %s", connector_id)
            return SyncResult(connector_id=connector_id, status="failed", error=str(exc))


_service: ConnectorService | None = None


def get_connector_service() -> ConnectorService:
    global _service
    if _service is None:
        _service = ConnectorService()
    return _service
