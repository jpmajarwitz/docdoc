import json
import os
import tempfile
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from openai import OpenAI

load_dotenv()

app = FastAPI(title='DocDoc Backend Proxy')
app.add_middleware(
    CORSMiddleware,
    allow_origins=['http://localhost:5173', 'http://127.0.0.1:5173'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)


class LlmRequest(BaseModel):
    model: str = 'gpt-5-mini'
    system_prompt: str = Field(..., alias='systemPrompt')
    messages: list[dict[str, Any]]
    store: bool = False


class LlmResponse(BaseModel):
    output_text: str = Field(..., alias='outputText')


def get_client() -> OpenAI:
    api_key = os.getenv('OPENAI_API_KEY')
    if not api_key:
        raise HTTPException(status_code=500, detail='OPENAI_API_KEY is not configured on the backend.')
    return OpenAI(api_key=api_key)


@app.get('/api/health')
def healthcheck() -> dict[str, str]:
    return {'status': 'ok'}


async def parse_form_request(request: str) -> LlmRequest:
    try:
        payload = json.loads(request)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f'Invalid request payload JSON: {exc.msg}') from exc

    try:
        return LlmRequest.model_validate(payload)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f'Invalid request payload: {exc}') from exc


async def upload_to_openai(client: OpenAI, upload: UploadFile) -> str:
    suffix = Path(upload.filename or 'upload.bin').suffix
    temp_path = None

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            temp_path = Path(temp_file.name)
            data = await upload.read()
            temp_file.write(data)

        with open(temp_path, 'rb') as file_handle:
            created_file = client.files.create(file=file_handle, purpose='user_data')
    finally:
        if temp_path and temp_path.exists():
            temp_path.unlink()

    return created_file.id


async def build_input_content(
    llm_request: LlmRequest,
    file_map: dict[str, UploadFile | None],
    client: OpenAI,
) -> list[dict[str, Any]]:
    built_messages: list[dict[str, Any]] = []

    for message in llm_request.messages:
        message_type = message.get('type')
        if message_type == 'input_text':
            built_messages.append({'type': 'input_text', 'text': message.get('text', '')})
            continue

        if message_type != 'input_file':
            raise HTTPException(status_code=400, detail=f'Unsupported message type: {message_type}')

        source = message.get('source')
        upload = file_map.get(source)
        if not source or upload is None:
            raise HTTPException(status_code=400, detail=f"Missing uploaded file for source '{source}'.")

        file_id = await upload_to_openai(client, upload)
        built_messages.append({'type': 'input_file', 'file_id': file_id})

    return built_messages


async def invoke_llm(llm_request: LlmRequest, file_map: dict[str, UploadFile | None]) -> LlmResponse:
    client = get_client()
    content = await build_input_content(llm_request, file_map, client)

    response = client.responses.create(
        model=llm_request.model,
        store=llm_request.store,
        input=[
            {'role': 'system', 'content': llm_request.system_prompt},
            {'role': 'user', 'content': content},
        ],
    )

    output_text = response.output_text
    if not output_text:
        output_text = '\n'.join(
            item.get('text', '')
            for output_item in response.output or []
            for item in output_item.get('content', [])
            if isinstance(item, dict)
        ).strip()

    return LlmResponse(outputText=output_text or 'No output text returned.')


@app.post('/api/critique', response_model=LlmResponse)
async def critique(
    request: str = Form(...),
    primary_document: UploadFile = File(...),
    supporting_document: UploadFile | None = File(None),
    prior_response_document: UploadFile | None = File(None),
) -> LlmResponse:
    llm_request = await parse_form_request(request)
    return await invoke_llm(
        llm_request,
        {
            'primary_document': primary_document,
            'supporting_document': supporting_document,
            'prior_response_document': prior_response_document,
        },
    )


@app.post('/api/apply-change-items', response_model=LlmResponse)
async def apply_change_items(
    request: str = Form(...),
    original_document: UploadFile = File(...),
) -> LlmResponse:
    llm_request = await parse_form_request(request)
    return await invoke_llm(llm_request, {'original_document': original_document})


@app.post('/api/critique-changed-document', response_model=LlmResponse)
async def critique_changed_document(llm_request: LlmRequest) -> LlmResponse:
    return await invoke_llm(llm_request, {})
