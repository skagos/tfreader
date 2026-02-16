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
