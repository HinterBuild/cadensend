"""Unit tests for RSS/Atom feed parsing and content-hash dedup helpers."""

import unittest

from app.workers.ingestion_worker import IngestionWorker


RSS_SAMPLE = """<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Infra Weekly</title>
    <item>
      <title>Continuous batching explained</title>
      <link>https://example.com/batching</link>
      <description>&lt;p&gt;Batching keeps GPUs busy.&lt;/p&gt;</description>
      <content:encoded><![CDATA[<p>Deep dive: <b>paged attention</b>.</p>]]></content:encoded>
    </item>
    <item>
      <title>Kubernetes upgrades</title>
      <link>https://example.com/k8s</link>
      <description>Skip-level upgrades are risky.</description>
    </item>
  </channel>
</rss>
"""

ATOM_SAMPLE = """<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Digest</title>
  <entry>
    <title>First post</title>
    <link href="https://example.org/1"/>
    <summary>Hello world summary.</summary>
  </entry>
</feed>
"""


class FeedParsingTests(unittest.TestCase):
    def setUp(self):
        self.worker = IngestionWorker()

    def test_detects_rss_and_atom(self):
        self.assertTrue(self.worker._looks_like_feed(RSS_SAMPLE))
        self.assertTrue(self.worker._looks_like_feed(ATOM_SAMPLE))
        self.assertFalse(self.worker._looks_like_feed("<html><body>article</body></html>"))

    def test_parses_rss_entries(self):
        text = self.worker._parse_feed(RSS_SAMPLE)
        self.assertIn("Infra Weekly", text)
        self.assertIn("Continuous batching explained", text)
        self.assertIn("https://example.com/batching", text)
        # HTML stripped from summaries
        self.assertNotIn("<p>", text)
        # content:encoded preferred when richer
        self.assertIn("Deep dive", text)
        self.assertIn("Skip-level upgrades are risky.", text)

    def test_parses_atom_entries(self):
        text = self.worker._parse_feed(ATOM_SAMPLE)
        self.assertIn("Atom Digest", text)
        self.assertIn("First post", text)
        self.assertIn("Hello world summary.", text)

    def test_malformed_feed_falls_back_to_html(self):
        broken = "<rss><channel><title>Broken"
        text = self.worker._parse_feed(broken)
        self.assertIsInstance(text, str)

    def test_empty_feed_falls_back_to_html(self):
        text = self.worker._parse_feed('<?xml version="1.0"?><rss></rss>')
        self.assertEqual(text, "")

    def test_content_hash_is_stable_and_normalizes(self):
        a = self.worker._content_hash("Hello   World\n\nFoo")
        b = self.worker._content_hash("hello world foo")
        c = self.worker._content_hash("different entirely")
        self.assertEqual(a, b)
        self.assertNotEqual(a, c)


if __name__ == "__main__":
    unittest.main()
