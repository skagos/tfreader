from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.schemas import AnalyzeResponse, ResourceRecord
from app.terraform_parser import parse_tf_content, parse_tf_directory, parse_tf_from_zip

app = FastAPI(
    title="Terraform Reader API",
    version="0.1.0",
    description=(
        "Upload Terraform IaC as a single .tf file or a zipped folder, then get "
        "recognized resource types."
    ),
)

BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"

app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")


def _build_response(resources: list[ResourceRecord]) -> AnalyzeResponse:
    resource_types = sorted({r.resource_type for r in resources})
    return AnalyzeResponse(
        resource_types=resource_types,
        resource_count=len(resources),
        resources=resources,
    )


@app.get("/")
def index() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "index.html")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/analyze/file", response_model=AnalyzeResponse)
async def analyze_tf_file(
    tf_file: UploadFile = File(..., description="A single Terraform file ending in .tf"),
) -> AnalyzeResponse:
    if not tf_file.filename or not tf_file.filename.endswith(".tf"):
        raise HTTPException(status_code=400, detail="File must end with .tf")

    try:
        content = (await tf_file.read()).decode("utf-8")
        resources = parse_tf_content(content, tf_file.filename)
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=400, detail="File must be UTF-8 encoded") from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Failed to parse Terraform file: {exc}") from exc

    return _build_response(resources)


@app.post("/analyze/folder", response_model=AnalyzeResponse)
async def analyze_tf_folder(
    tf_folder_zip: UploadFile = File(
        ...,
        description="A .zip file that contains one or more Terraform .tf files",
    ),
) -> AnalyzeResponse:
    if not tf_folder_zip.filename or not tf_folder_zip.filename.endswith(".zip"):
        raise HTTPException(status_code=400, detail="Folder input must be a .zip file")

    try:
        payload = await tf_folder_zip.read()
        resources = parse_tf_from_zip(payload)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Failed to parse zipped folder: {exc}") from exc

    return _build_response(resources)


@app.post("/analyze/local-path", response_model=AnalyzeResponse)
def analyze_local_path(path: str = Form(...)) -> AnalyzeResponse:
    target = Path(path)
    if not target.exists():
        raise HTTPException(status_code=404, detail=f"Path not found: {path}")

    try:
        if target.is_file():
            if target.suffix != ".tf":
                raise HTTPException(status_code=400, detail="Local file input must end in .tf")
            resources = parse_tf_content(target.read_text(encoding="utf-8"), str(target))
        else:
            resources = parse_tf_directory(target)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Failed to parse local path: {exc}") from exc

    return _build_response(resources)
