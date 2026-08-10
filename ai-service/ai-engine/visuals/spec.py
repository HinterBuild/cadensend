"""Visual specifications for AI Engine"""

from typing import Optional, List, Dict, Any
from pydantic import BaseModel

class VisualSpecBase(BaseModel):
    type: str
    content: str
    alt_text: str
    width: int = 800
    height: int = 600
    format: str = "svg"

class VisualSpecCreate(VisualSpecBase):
    pass

class VisualSpec(VisualSpecBase):
    id: str
    generated_at: str
    storage_key: str

class VisualSpecInput(BaseModel):
    content_description: str
    diagram_type: str = "mermaid"
    data: Optional[Dict[str, Any]] = None
    brand_colors: Optional[List[str]] = None
    max_width: int = 800
    max_height: int = 600
