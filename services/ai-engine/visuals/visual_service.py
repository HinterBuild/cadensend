"""Visual generation service
Handles Mermaid/D2 diagram generation and rendering
"""

from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
import logging
import os

logger = logging.getLogger(__name__)

class VisualSpec(BaseModel):
    """Visual specification for diagram generation"""
    id: str
    type: str  # "mermaid", "d2", "chart", "infographic"
    content: str
    alt_text: str
    width: int = 800
    height: int = 600
    format: str = "svg"  # "svg" or "png"
    generated_at: Optional[str] = None
    storage_key: Optional[str] = None

class VisualSpecInput(BaseModel):
    """Input for visual specification"""
    content_description: str
    diagram_type: str = "mermaid"
    data: Optional[Dict[str, Any]] = None
    brand_colors: Optional[List[str]] = None
    max_width: int = 800
    max_height: int = 600

class VisualSpecOutput(BaseModel):
    """Output from visual specification"""
    id: str
    type: str
    content: str
    alt_text: str
    width: int
    height: int
    format: str
    generated_at: str
    storage_key: str

class VisualService:
    """Service for visual generation and rendering"""
    
    def __init__(self):
        self.supported_types = ["mermaid", "d2"]
        self.max_text_size = 10000
        self.supported_formats = ["svg", "png"]
    
    def create_visual_spec(self, input: VisualSpecInput, model_service) -> VisualSpecOutput:
        """Create a visual specification based on input"""
        import uuid
        from datetime import datetime
        
        # Validate diagram type
        if input.diagram_type not in self.supported_types:
            raise ValueError(f"Unsupported diagram type: {input.diagram_type}")
        
        # Generate diagram content using AI
        content = self._generate_diagram_content(input, model_service)
        
        # Validate content
        if not content or len(content) > self.max_text_size:
            raise ValueError("Generated content exceeds maximum size or is empty")
        
        # Validate content safety
        if self._is_unsafe_diagram(content):
            raise ValueError("Diagram content flagged as unsafe")
        
        # Create visual spec output
        visual_spec = VisualSpecOutput(
            id=str(uuid.uuid4()),
            type=input.diagram_type,
            content=content,
            alt_text=input.content_description,
            width=input.max_width,
            height=input.max_height,
            format="svg",
            generated_at=datetime.utcnow().isoformat(),
            storage_key=f"visuals/{uuid.uuid4()}.svg",
        )
        
        return visual_spec
    
    def render_visual(self, spec: VisualSpecOutput, output_dir: str = "visuals") -> str:
        """Render a visual specification to SVG/PNG"""
        os.makedirs(output_dir, exist_ok=True)
        
        filename = f"{spec.id}.{spec.format}"
        filepath = os.path.join(output_dir, filename)
        
        if spec.type == "mermaid":
            svg_content = self._render_mermaid(spec.content)
        elif spec.type == "d2":
            svg_content = self._render_d2(spec.content)
        else:
            raise ValueError(f"Unsupported diagram type: {spec.type}")
        
        with open(filepath, 'w') as f:
            f.write(svg_content)
        
        logger.info(f"Rendered visual to: {filepath}")
        return filepath
    
    def _generate_diagram_content(self, input: VisualSpecInput, model_service) -> str:
        """Generate diagram content using AI"""
        import asyncio
        
        prompt = f"""Generate a {input.diagram_type} diagram based on:
        Description: {input.content_description}
        Data: {str(input.data) if input.data else "No additional data"}
        
        Output only the {input.diagram_type} code, no extra text.
        """
        
        # Use model service to generate content
        response = model_service.generate_response(
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=2000
        )
        
        return response.strip()
    
    def _render_mermaid(self, content: str) -> str:
        """Render Mermaid diagram to SVG"""
        # For production use, use a proper Mermaid renderer
        # For local development, we'll return the raw content wrapped in basic SVG
        svg_template = f'''<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
    <foreignObject width="800" height="600">
        <body xmlns="http://www.w3.org/1999/xhtml">
            <div id="mermaid-diagram">{content}</div>
        </body>
    </foreignObject>
</svg>'''
        return svg_template
    
    def _render_d2(self, content: str) -> str:
        """Render D2 diagram to SVG"""
        # For production use, use the actual D2 renderer
        # For local development, we'll return the raw content wrapped in basic SVG
        svg_template = f'''<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
    <foreignObject width="800" height="600">
        <body xmlns="http://www.w3.org/1999/xhtml">
            <div id="d2-diagram">{content}</div>
        </body>
    </foreignObject>
</svg>'''
        return svg_template
    
    def _is_unsafe_diagram(self, content: str) -> bool:
        """Check if diagram content is unsafe"""
        unsafe_patterns = [
            "<script", "javascript:", "data:", "vbscript:",
            "onload", "onerror", "onclick", "onmouseover",
        ]
        
        lower_content = content.lower()
        for pattern in unsafe_patterns:
            if pattern in lower_content:
                return True
        
        return False

# Singleton instance
visual_service = VisualService()