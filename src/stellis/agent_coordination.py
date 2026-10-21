"""Notebook-scoped, persisted collaboration through the configured managed runtime."""
from __future__ import annotations

import asyncio
import json
import os
import re
import uuid

from stellis import agent_gateway, agent_handoffs, agent_runtime, agents
from stellis import notebook_work, runtime_profile, runtime_trace, storage


def participants(origin_id: str, notebook_id: str) -> list[dict]:
    agent_handoffs.validate(origin_id, origin_id, notebook_id)
    eligible = []
    for agent in agents.list_agents():
        if not agent['enabled']:
            continue
        if agent['id'] == origin_id or any(n['notebook_id'] == notebook_id and n.get('enabled', True) for n in agent['notebooks']):
            eligible.append(agent)
    return eligible


def steps(job_id: str) -> list[dict]:
    with storage.connect() as conn:
        rows = [dict(row) for row in conn.execute(
            'SELECT * FROM agent_work_steps WHERE job_id=? ORDER BY position', (job_id,))]
    for row in rows:
        row['sources'] = json.loads(row.pop('sources_json'))
    return rows


def add_step(job_id: str, position: int, agent: dict, task: str) -> str:
    identifier = str(uuid.uuid4())
    with storage.connect() as conn:
        conn.execute('INSERT INTO agent_work_steps(id,job_id,position,agent_id,agent_name,task) VALUES(?,?,?,?,?,?)',
                     (identifier, job_id, position, agent['id'], agent['name'], task))
    return identifier


def update_step(identifier: str, state: str, *, child_job_id=None, result='', sources=None, error=None):
    with storage.connect() as conn:
        conn.execute('UPDATE agent_work_steps SET state=?,child_job_id=COALESCE(?,child_job_id),result=?,sources_json=?,error=? WHERE id=?',
                     (state, child_job_id, result, json.dumps(sources or []), error, identifier))


def parse_plan(raw: str, eligible: list[dict], origin_id: str) -> list[dict]:
    raw = re.sub(r'^```(?:json)?\s*|\s*```$', '', raw.strip())
    try:
        payload = json.loads(raw)
    except (ValueError, TypeError) as exc:
        raise agent_runtime.AgentRunError('Could not plan this request. Try again.') from exc
    plan = payload.get('steps') if isinstance(payload, dict) else None
    allowed = {item['id'] for item in eligible}
    if not isinstance(plan, list) or len(plan) > 3:
        raise agent_runtime.AgentRunError('The work plan was invalid. Try again.')
    used = set()
    for step in plan:
        if not isinstance(step, dict) or set(step) != {'agent_id', 'task'}:
            raise agent_runtime.AgentRunError('The work plan was invalid. Try again.')
        agent_id, task = step['agent_id'], step['task']
        if not isinstance(agent_id, str) or agent_id not in allowed or agent_id == origin_id or agent_id in used:
            raise agent_runtime.AgentRunError('The work plan selected an unavailable agent. Try again.')
        if not isinstance(task, str) or not 1 <= len(task.strip()) <= 1000:
            raise agent_runtime.AgentRunError('The work plan contained an invalid step. Try again.')
        used.add(agent_id)
    return plan


async def plan(origin: dict, notebook_id: str, question: str, eligible: list[dict], job_id: str) -> list[dict]:
    prompt = ('Plan assistance for the user request using only the supplied eligible agents. '
              'Return ONLY JSON: {"steps":[{"agent_id":"exact supplied ID","task":"specific evidence-gathering or checking request"}]}. '
              'Use zero to three steps, each with a different agent other than the requesting agent. '
              'Use an empty steps list for a simple question needing no assistance. '
              'For a draft needing notebook evidence and a specialist check, ask the notebook steward for relevant evidence, '
              'then the appropriate specialist to check it. Choose by actual role and instructions, not by invented identities. '
              'Do not draft the final answer in these steps; the requesting agent will synthesize the results. '
              'Never send, save externally, or use external tools. Follow notebook instructions.\n' + json.dumps({
                  'requesting_agent': origin['id'], 'request': question,
                  'notebook_instructions': notebook_work.instructions(notebook_id)['instructions'],
                  'eligible_agents': [{'agent_id': a['id'], 'name': a['name'], 'role': a['role'],
                      'instructions': agent_runtime.agent_templates.instructions(a)} for a in eligible]}, ensure_ascii=False))
    process = None
    with runtime_trace.span('agent_plan', agent_id=origin['id'], model=runtime_profile.model_id('agent')):
        runtime_trace.job(job_id)
        await agent_runtime.ensure_managed_mcp()
        runtime_trace.event('model_requested')
        try:
            if runtime_profile.cloud():
                answer, _ = await agent_gateway.turn(prompt, job_id + '-plan')
            else:
                command = agent_runtime._command()
                process = await asyncio.create_subprocess_exec(
                    command, os.environ.get('STELLIS_NEMOCLAW_SANDBOX', ''), 'agent', '--agent', 'main',
                    '--session-id', job_id + '-plan', '-m', prompt, '--json', '--timeout', '90',
                    stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
                    env=agent_runtime._cli_env(command))
                stdout, _ = await asyncio.wait_for(process.communicate(), timeout=150)
                if process.returncode or len(stdout) > 1_048_576:
                    raise agent_runtime.AgentRunError('Could not plan this request. Try again.')
                answer, _ = agent_runtime._openclaw_reply(json.loads(stdout))
            parsed = parse_plan(answer, eligible, origin['id'])
            runtime_trace.event('plan_ready', step_count=len(parsed))
            return parsed
        finally:
            if process is not None and process.returncode is None:
                try:
                    process.terminate()
                    await asyncio.wait_for(process.wait(), timeout=30)
                except asyncio.TimeoutError:
                    process.kill()
                    await process.wait()
                except ProcessLookupError:
                    pass


async def ask(origin_id: str, question: str, notebook_id: str | None) -> dict:
    if not notebook_id:
        return await agent_runtime.ask(origin_id, question, notebook_id)
    eligible = participants(origin_id, notebook_id)
    if len(eligible) < 2:
        return await agent_runtime.ask(origin_id, question, notebook_id)
    question = ' '.join(question.split())
    if not question or len(question) > 2000:
        raise ValueError('Question must be 1–2000 characters')
    origin = agents.get(origin_id)
    job_id = agents.start_job(origin_id, notebook_id)
    user = agents.append_message(origin_id, 'user', question, notebook_id, job_id)
    task = asyncio.current_task()
    agent_runtime._RUNNING_JOBS[job_id] = task
    current = add_step(job_id, 0, origin, 'Plan the work')
    active_ids = {origin_id}
    child_id = None

    async def watch():
        while True:
            await asyncio.sleep(1)
            try:
                for identifier in active_ids.copy():
                    agent_handoffs.validate(origin_id, identifier, notebook_id)
            except (ValueError, LookupError):
                task.cancel()
                return

    watcher = asyncio.create_task(watch())
    try:
        update_step(current, 'running')
        planned = await plan(origin, notebook_id, question, eligible, job_id)
        update_step(current, 'succeeded', result='Work plan ready.')
        by_id = {a['id']: a for a in eligible}
        planned_ids = [(add_step(job_id, i + 1, by_id[s['agent_id']], s['task']), s) for i, s in enumerate(planned)]
        final_id = add_step(job_id, len(planned) + 1, origin, 'Prepare the response')
        findings, sources = [], []
        for current, step in planned_ids:
            identifier = step['agent_id']
            active_ids.add(identifier)
            agent_handoffs.validate(origin_id, identifier, notebook_id)
            agent = agents.get(identifier)
            evidence = agent_runtime._sources(agent, question + ' ' + step['task'], notebook_id)
            sources.extend(s for s in evidence if s.get('target') not in {x.get('target') for x in sources})
            child_id = agents.start_job(identifier, notebook_id)
            update_step(current, 'running', child_job_id=child_id)
            result = await agent_runtime.ask(identifier, step['task'], notebook_id, sources,
                automatic=True, review_only=True, started_job_id=child_id, collaboration=[{'request': question}, *findings])
            agent_handoffs.validate(origin_id, identifier, notebook_id)
            update_step(current, 'succeeded', child_job_id=result['job_id'],
                result=result['agent_message']['content'], sources=result['cited_sources'])
            agents.finish_job(child_id, 'succeeded')
            child_id = None
            findings.append({'agent': agent['name'], 'task': step['task'], 'findings': result['agent_message']['content']})
        current = final_id
        update_step(current, 'running')
        for identifier in active_ids:
            agent_handoffs.validate(origin_id, identifier, notebook_id)
        result = await agent_runtime.ask(origin_id, question, notebook_id, sources,
            started_job_id=job_id, collaboration=findings, record_request=False)
        update_step(current, 'succeeded', result='Response ready.', sources=result['cited_sources'])
        agents.finish_job(job_id, 'succeeded')
        return {**result, 'user_message': user}
    except asyncio.CancelledError:
        if child_id:
            agents.finish_job(child_id, 'interrupted', 'Work stopped.')
        update_step(current, 'interrupted', error='Work stopped.')
        agents.finish_job(job_id, 'interrupted', 'Work stopped. Send again to start a new request.')
        raise
    except Exception as exc:
        message = str(exc) if isinstance(exc, (ValueError, LookupError, agent_runtime.AgentRunError)) else 'Could not complete this request. Try again.'
        if child_id:
            agents.finish_job(child_id, 'failed', message)
        update_step(current, 'failed', error=message)
        agents.finish_job(job_id, 'failed', message)
        if isinstance(exc, (ValueError, LookupError, agent_runtime.AgentRunError)):
            raise
        raise agent_runtime.AgentRunError(message) from exc
    finally:
        with storage.connect() as conn:
            conn.execute("UPDATE agent_work_steps SET state='skipped' WHERE job_id=? AND state='queued'", (job_id,))
        agent_runtime._RUNNING_JOBS.pop(job_id, None)
        watcher.cancel()
        await asyncio.gather(watcher, return_exceptions=True)
