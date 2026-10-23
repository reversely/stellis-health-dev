"""Demo-only upload, review and one-action reset routes."""
import asyncio
from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from stellis import demo_patient, storage

router = APIRouter(prefix='/demo')


def response(value, active=None):
    result = JSONResponse(value)
    if active is True:
        result.set_cookie(demo_patient.COOKIE, 'maya', httponly=True, samesite='strict', path='/')
    elif active is False:
        result.delete_cookie(demo_patient.COOKIE, path='/')
    result.headers['Cache-Control'] = 'no-store'
    return result


@router.get('/status')
def status(request: Request):
    return {**demo_patient.status(), 'active': request.cookies.get(demo_patient.COOKIE) == 'maya'}


@router.post('/enter')
def enter():
    demo_patient.workspace()
    return response(demo_patient.status(), True)


@router.post('/leave')
def leave():
    return response({'active': False}, False)


@router.delete('/history')
async def clear():
    from stellis import agent_runtime, agents
    pending=[]
    if demo_patient._control().exists():
        with storage.demo_workspace(demo_patient.workspace()):
            for agent in agents.list_agents():
                for job in agents.jobs(agent['id']):
                    task=agent_runtime._RUNNING_JOBS.get(job['id'])
                    if task:
                        task.cancel(); pending.append(task)
    if pending:
        await asyncio.gather(*pending, return_exceptions=True)
    demo_patient.clear()
    return response({'cleared': True}, False)


async def checked(action):
    try:
        with storage.demo_workspace(demo_patient.workspace()):
            def synchronized():
                with demo_patient._LOCK:
                    return action()
            return await asyncio.to_thread(synchronized)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error


@router.post('/upload')
async def upload(file: UploadFile = File(...)):
    if not (file.filename or '').lower().endswith('.zip'):
        raise HTTPException(422, 'Choose a yearly demo ZIP')
    content = await file.read(demo_patient.MAX_ZIP_BYTES + 1)
    return await checked(lambda: demo_patient.import_year(content))


@router.get('/years/{year}')
async def review(year: str):
    return await checked(lambda: demo_patient.review(year))


class Dates(BaseModel):
    dates: dict[str, str]


@router.post('/years/{year}/dates')
async def confirm_dates(year: str, request: Dates):
    return await checked(lambda: demo_patient.confirm_dates(year, request.dates))


class Notebooks(BaseModel):
    templates: list[str]


@router.post('/years/{year}/notebooks')
async def notebooks(year: str, request: Notebooks):
    return await checked(lambda: demo_patient.file_records(year, request.templates))
