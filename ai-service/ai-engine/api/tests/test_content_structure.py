from app.services.content_structure import analyze_content_structure, normalize_issue_content_order


def test_analyze_flags_back_to_back_diagrams():
    issue = {
        "content_blocks": [
            {
                "title": "Modes",
                "text": (
                    "Enough intro context for readers to understand the section.\n\n"
                    "```mermaid\nflowchart TD\n  A-->B\n```\n\n"
                    "```mermaid\nflowchart TD\n  C-->D\n```"
                ),
            }
        ]
    }
    checks = analyze_content_structure(issue)
    assert any(check.id == "consecutive_diagrams_in_block" for check in checks)


def test_normalize_prepends_title_before_leading_fence():
    issue = {
        "content_blocks": [
            {
                "title": "Launch modes",
                "text": "```mermaid\nflowchart TD\n  A-->B\n```",
            }
        ]
    }
    normalized = normalize_issue_content_order(issue)
    text = normalized["content_blocks"][0]["text"]
    assert text.startswith("## Launch modes")
