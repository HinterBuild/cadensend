"""Tests for visual service"""

import pytest
import tempfile
import os
from app.visuals.visual_service import VisualService, VisualSpecInput

def test_create_visual_spec_mermaid():
    """Test creation of Mermaid visual spec"""
    service = VisualService()
    
    # Mock model service
    mock_model = Mock()
    mock_model.generate_response.return_value = "graph TD\n    A[Start] --> B[End]"
    
    spec_input = VisualSpecInput(
        content_description="Simple flowchart",
        diagram_type="mermaid"
    )
    
    spec = service.create_visual_spec(spec_input, mock_model)
    
    assert spec.type == "mermaid"
    assert "graph TD" in spec.content
    assert spec.alt_text == "Simple flowchart"
    assert spec.format == "svg"

def test_validate_diagram_type():
    """Test that invalid diagram types raise errors"""
    service = VisualService()
    
    with pytest.raises(ValueError) as exc:
        service.create_visual_spec(
            VisualSpecInput(content_description="test", diagram_type="invalid"),
            Mock()
        )
    assert "Unsupported" in str(exc.value)

def test_unsafe_content_rejected():
    """Test that unsafe content is rejected"""
    service = VisualService()
    
    mock_model = Mock()
    mock_model.generate_response.return_value = "<script>alert('xss')</script>"
    
    with pytest.raises(ValueError) as exc:
        service.create_visual_spec(
            VisualSpecInput(content_description="test", diagram_type="mermaid"),
            mock_model
        )
    assert "unsafe" in str(exc.value).lower()

def test_render_svg():
    """Test that SVG is rendered correctly"""
    service = VisualService()
    
    with tempfile.TemporaryDirectory() as tmpdir:
        service.output_dir = tmpdir
        
        spec = VisualSpecInput(
            content_description="test diagram",
            diagram_type="mermaid"
        )
        mock_model = Mock()
        mock_model.generate_response.return_value = "graph TD\n    A --> B"
        
        visual_spec = service.create_visual_spec(spec, mock_model)
        filepath = service.render_visual(visual_spec)
        
        assert os.path.exists(filepath)
        with open(filepath) as f:
            content = f.read()
        assert "<svg" in content
        assert "graph TD" in content

from unittest.mock import Mock
