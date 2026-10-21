"""Explicit notebook-scoped addressing with replies retained in the originating thread."""
from __future__ import annotations
import asyncio
import uuid
from stellis import agents, agent_runtime, storage


def validate(origin_id, target_id, notebook_id):
    if not notebook_id:
        raise ValueError('Choose a notebook before mentioning another agent')
    with storage.connect() as conn:
        if not conn.execute('SELECT 1 FROM notebooks WHERE id=?',(notebook_id,)).fetchone():
            raise LookupError('Notebook not found')
    for identifier in (origin_id, target_id):
        agent = agents.require_enabled(identifier, notebook_id)
        if not agent['is_default'] and not any(item['notebook_id'] == notebook_id for item in agent['notebooks']):
            raise ValueError('Both agents must be assigned to this notebook')
    return agents.get(target_id)


async def ask(origin_id, target_id, question, notebook_id):
    target = validate(origin_id, target_id, notebook_id)
    if origin_id == target_id:
        return await agent_runtime.ask(target_id, question, notebook_id)
    question = ' '.join(question.split())
    if not question or len(question) > 2000:
        raise ValueError('Question must be 1–2000 characters')
    job_id = agents.start_job(origin_id, notebook_id)
    with storage.connect() as conn:
        conn.execute('INSERT INTO agent_handoffs(id,origin_id,target_id,target_name,notebook_id) VALUES(?,?,?,?,?)',
                     (job_id, origin_id, target_id, target['name'], notebook_id))
    user = agents.append_message(origin_id, 'user', question, notebook_id, job_id)
    task = asyncio.current_task()
    agent_runtime._RUNNING_JOBS[job_id] = task
    async def watch():
        while True:
            await asyncio.sleep(1)
            try:validate(origin_id, target_id, notebook_id)
            except (ValueError,LookupError):
                task.cancel()
                return
    watcher = asyncio.create_task(watch())
    try:
        result = await agent_runtime.ask(target_id, question, notebook_id, started_job_id=job_id)
        validate(origin_id, target_id, notebook_id)
        reply_id = str(uuid.uuid4())
        with storage.connect() as conn:
            conn.execute('BEGIN IMMEDIATE')
            conn.execute('INSERT INTO agent_messages(id,agent_id,notebook_id,role,content,job_id,created_at) VALUES(?,?,?,?,?,?,?)',
                (reply_id, origin_id, notebook_id, 'agent', result['agent_message']['content'], job_id, agents._now()))
            conn.execute('UPDATE agent_handoffs SET reply_id=?,target_message_id=? WHERE id=?',
                         (reply_id, result['agent_message']['id'], job_id))
            conn.execute("UPDATE agent_jobs SET state='succeeded',finished_at=? WHERE id=?", (agents._now(),job_id))
            from stellis import agent_followups
            agent_followups.publish(conn, job_id)
            reply = dict(conn.execute('SELECT * FROM agent_messages WHERE id=?',(reply_id,)).fetchone())
        return {**result, 'user_message':user, 'agent_message':reply, 'responding_agent_id':target_id}
    except asyncio.CancelledError:
        agents.finish_job(job_id, 'interrupted', 'Reply stopped')
        raise
    except Exception as exc:
        agents.finish_job(job_id, 'failed', str(exc) if isinstance(exc,(ValueError,LookupError,agent_runtime.AgentRunError)) else 'Could not reach the selected agent')
        raise
    finally:
        agent_runtime._RUNNING_JOBS.pop(job_id, None)
        watcher.cancel()
        await asyncio.gather(watcher, return_exceptions=True)
