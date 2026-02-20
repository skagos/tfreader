# tfreader

FastAPI service to read Terraform IaC and return recognized resources from `.tf` files.

## Run

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Web UI: `http://127.0.0.1:8000/`
Swagger UI: `http://127.0.0.1:8000/docs`

## Run With Docker

Build and start:

```bash
docker compose up --build
```

The app will be available at `http://127.0.0.1:8000/`.

If you will use Azure export endpoints, run Azure login inside the container:

```bash
docker compose exec tfreader az login --use-device-code
```

Notes:
- The local `./exports` folder is mounted to `/app/exports` in the container.
- `Azure CLI` and `aztfexport` are included in the image.
- You do not need to install `az` or `aztfexport` on the host machine when using Docker.

## Frontend

The frontend supports both inputs:
- `Single TF File` -> sends multipart request to `POST /analyze/file`
- `Folder ZIP` -> sends multipart request to `POST /analyze/folder`

It renders:
- a type-to-resource diagram
- a detailed resource table with filter and expandable config JSON

## API Endpoints

- `GET /health`
- `POST /analyze/file`
  - multipart fields:
    - `tf_file`: a single `.tf` file
- `POST /analyze/folder`
  - multipart fields:
    - `tf_folder_zip`: a `.zip` containing one or more `.tf` files
- `POST /analyze/local-path`
  - multipart fields:
    - `path`: local file/folder path on the API server
- `POST /security/file`
  - multipart fields:
    - `tf_file`: a single `.tf` file
- `POST /security/folder`
  - multipart fields:
    - `tf_folder_zip`: a `.zip` containing one or more `.tf` files
- `POST /security/local-path`
  - multipart fields:
    - `path`: local file/folder path on the API server
- `POST /advise/file`
  - multipart fields:
    - `tf_file`: a single `.tf` file
- `POST /advise/folder`
  - multipart fields:
    - `tf_folder_zip`: a `.zip` containing one or more `.tf` files
- `POST /advise/local-path`
  - multipart fields:
    - `path`: local file/folder path on the API server

## Example `curl`

```bash
curl -X POST "http://127.0.0.1:8000/analyze/file" \
  -F "tf_file=@main.tf"
```

```bash
curl -X POST "http://127.0.0.1:8000/analyze/folder" \
  -F "tf_folder_zip=@infra.zip"
```

## Notes

- This phase only parses Terraform and returns detected resource types and resource entries.
- No database is used by the API.
- Security analysis phase:
  - runs as an additive layer after Terraform parsing
  - endpoints return both parsed resources and structured findings with severities (`low`, `medium`, `high`, `critical`)
  - findings are produced by scanner libraries: `checkov`, `tfsec`, and `terrascan`
  - each finding includes `source_library` so the UI can show which scanner detected it
  - includes a severity-weighted security score (`0-100`)
  - findings include resource-level keys (for attaching to visualization nodes) and optional compliance tags (CIS/NIST/ISO mapping hooks)
  - scanner binaries must be installed and available on PATH in the API runtime environment
- Azure export can include security analysis by setting `include_security=true` in `POST /export/azure`.
- Advisor phase:
  - default mode is rules-based (`ADVISOR_MODE=rules`)
  - optional future AI path is available via `ADVISOR_MODE=llm` (currently stubbed until provider integration is added)
