"""Unit tests for stale-content refresh prompt shaping."""

import unittest
from unittest.mock import Mock

from app.services.agent_graph import NewsletterAgent


class AgentRefreshPromptTests(unittest.TestCase):
    def setUp(self):
        self.agent = NewsletterAgent(model_service=Mock(), memory_store=Mock())

    def test_refresh_source_text_embeds_old_issue_snapshot(self):
        text = self.agent._refresh_source_text(
            {
                "issue_id": "issue-1",
                "subject": "Old subject",
                "updated_at": "2026-07-01T10:00:00Z",
                "content_blocks": [
                    {"title": "Intro", "type": "markdown", "text": "Old body text"},
                ],
            }
        )
        self.assertIn("Refresh this older issue instead of writing from scratch.", text)
        self.assertIn('"issue_id": "issue-1"', text)
        self.assertIn('"subject": "Old subject"', text)
        self.assertIn('"title": "Intro"', text)

    def test_seed_messages_include_refresh_instructions(self):
        messages = self.agent._seed_messages(
            {
                "workflow": "issue",
                "brief": {
                    "topic": "AI newsletters",
                    "level": "intermediate",
                    "refresh_mode": "stale_content_refresh",
                    "refresh_source": {
                        "issue_id": "issue-9",
                        "subject": "Then vs now",
                        "content_blocks": [{"title": "Body", "text": "Old version"}],
                    },
                },
                "memory_context": [],
                "plan": {"modules": [{"title": "Module 1", "learning_objectives": ["Update old draft"]}]},
            }
        )
        self.assertEqual(len(messages), 2)
        self.assertIn("refreshing an older issue as of August 25, 2026", messages[0].content)
        self.assertIn("What changed", messages[0].content)
        self.assertIn("Refresh this older issue instead of writing from scratch.", messages[1].content)
        self.assertIn('"issue_id": "issue-9"', messages[1].content)


if __name__ == "__main__":
    unittest.main()
