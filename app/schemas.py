from __future__ import annotations

from pydantic import BaseModel, Field


class ResourceRecord(BaseModel):
    file: str = Field(..., description="Terraform file where the resource was found")
    resource_type: str = Field(..., description="Terraform resource type, e.g. aws_instance")
    resource_name: str = Field(..., description="Terraform resource name")
    config: dict = Field(default_factory=dict, description="Raw resource configuration")


class AnalyzeResponse(BaseModel):
    resource_types: list[str]
    resource_count: int
    resources: list[ResourceRecord]
