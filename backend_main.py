import asyncio
import json
import os
import tempfile
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
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
    api_mode: str = Field('responses', alias='apiMode')
    model: str = 'gpt-5-mini'
    system_prompt: str = Field(..., alias='systemPrompt')
    messages: list[dict[str, Any]]
    store: bool = False
    delete_file_on_llm: bool = Field(True, alias='deleteFileOnLlm')


class LlmResponse(BaseModel):
    output_text: str = Field(..., alias='outputText')
    delete_logs: dict[str, Any] | None = Field(default=None, alias='deleteLogs')


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
) -> tuple[list[dict[str, Any]], list[str], list[str]]:
    built_messages: list[dict[str, Any]] = []
    uploaded_file_ids: list[str] = []
    referenced_file_ids: list[str] = []

    for message in llm_request.messages:
        message_type = message.get('type')
        if message_type == 'input_text':
            built_messages.append({'type': 'input_text', 'text': message.get('text', '')})
            continue

        if message_type != 'input_file':
            raise HTTPException(status_code=400, detail=f'Unsupported message type: {message_type}')

        source = message.get('source')
        upload = file_map.get(source)
        if not source:
            raise HTTPException(status_code=400, detail=f"Missing uploaded file for source '{source}'.")

        if upload is None:
            if isinstance(source, str) and source.startswith('file-'):
                referenced_file_ids.append(source)
                built_messages.append({'type': 'input_file', 'file_id': source})
                continue
            raise HTTPException(status_code=400, detail=f"Missing uploaded file for source '{source}'.")

        file_id = await upload_to_openai(client, upload)
        uploaded_file_ids.append(file_id)
        built_messages.append({'type': 'input_file', 'file_id': file_id})

    return built_messages, uploaded_file_ids, referenced_file_ids


async def delete_uploaded_files(client: OpenAI, file_ids: list[str]) -> None:
    for file_id in file_ids:
        try:
            await asyncio.to_thread(client.files.delete, file_id)
        except Exception:
            continue


async def invoke_llm(llm_request: LlmRequest, file_map: dict[str, UploadFile | None]) -> LlmResponse:
    client = get_client()
    content, uploaded_file_ids, referenced_file_ids = await build_input_content(llm_request, file_map, client)

    if llm_request.api_mode == 'chat':
        chat_content: list[dict[str, Any]] = []
        for item in content:
            if item['type'] == 'input_text':
                chat_content.append({'type': 'text', 'text': item.get('text', '')})
            elif item['type'] == 'input_file':
                chat_content.append({'type': 'file', 'file': {'file_id': item['file_id']}})

        response = client.chat.completions.create(
            model=llm_request.model,
            store=llm_request.store,
            messages=[
                {'role': 'system', 'content': llm_request.system_prompt},
                {'role': 'user', 'content': chat_content},
            ],
        )

        message_content = response.choices[0].message.content if response.choices else ''
        if isinstance(message_content, str):
            output_text = message_content
        elif isinstance(message_content, list):
            output_text = '\n'.join(
                item.get('text', '')
                for item in message_content
                if isinstance(item, dict) and item.get('type') == 'text'
            ).strip()
        else:
            output_text = ''
    else:
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

    delete_logs: dict[str, Any] | None = None
    file_ids_to_delete = [*uploaded_file_ids, *referenced_file_ids]
    if llm_request.delete_file_on_llm and file_ids_to_delete:
        asyncio.create_task(delete_uploaded_files(client, file_ids_to_delete))
        delete_logs = {
            'deleteRequested': True,
            'scheduled': True,
            'fileIds': file_ids_to_delete,
            'note': 'Deletion scheduled in background.'
        }
    elif file_ids_to_delete:
        delete_logs = {
            'deleteRequested': False,
            'scheduled': False,
            'fileIds': file_ids_to_delete,
            'note': 'Deletion disabled by request.'
        }

    return LlmResponse(outputText=output_text or 'No output text returned.', deleteLogs=delete_logs)


@app.post('/api/critique', response_model=LlmResponse)
async def critique(http_request: Request) -> LlmResponse:
    form = await http_request.form()
    request_payload = form.get('request')
    if not isinstance(request_payload, str):
        raise HTTPException(status_code=400, detail='Missing request form field.')

    llm_request = await parse_form_request(request_payload)
    file_map: dict[str, UploadFile | None] = {
        'primary_document': None,
        'supporting_document': None,
        'job_description_document': None,
        'prior_response_document': None,
    }
    for field_name, value in form.multi_items():
        if hasattr(value, 'filename') and hasattr(value, 'read'):
            file_map[field_name] = value

    return await invoke_llm(llm_request, file_map)


@app.post('/api/apply-change-items', response_model=LlmResponse)
async def apply_change_items(
    request: str = Form(...),
    original_document: UploadFile | None = File(None),
    job_description_document: UploadFile | None = File(None),
) -> LlmResponse:
    llm_request = await parse_form_request(request)
    return await invoke_llm(llm_request, {'original_document': original_document, 'job_description_document': job_description_document})


@app.post('/api/critique-changed-document', response_model=LlmResponse)
async def critique_changed_document(llm_request: LlmRequest) -> LlmResponse:
    return await invoke_llm(llm_request, {})
