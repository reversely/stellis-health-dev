"""Notebook instructions and activity derived from persisted work, never sample events."""
from __future__ import annotations
from stellis import agents, storage, suggestions, agent_artifacts
from stellis.todos import markdown_inline_text


def instructions(notebook_id):
    with storage.connect() as conn:
        if not conn.execute('SELECT 1 FROM notebooks WHERE id=?',(notebook_id,)).fetchone():
            raise LookupError('Notebook not found')
        row=conn.execute('SELECT instructions,revision FROM notebook_instructions WHERE notebook_id=?',(notebook_id,)).fetchone()
    return dict(row) if row else {'instructions':'','revision':0}


def save_instructions(notebook_id, text, revision):
    if not isinstance(text,str) or len(text)>4000:raise ValueError('Keep notebook instructions within 4,000 characters')
    with storage.connect() as conn:
        conn.execute('BEGIN IMMEDIATE')
        if not conn.execute('SELECT 1 FROM notebooks WHERE id=?',(notebook_id,)).fetchone():raise LookupError('Notebook not found')
        row=conn.execute('SELECT revision FROM notebook_instructions WHERE notebook_id=?',(notebook_id,)).fetchone()
        if (row['revision'] if row else 0)!=revision:raise ValueError('Notebook instructions changed. Reload before saving.')
        conn.execute('INSERT INTO notebook_instructions(notebook_id,instructions,revision) VALUES(?,?,?) ON CONFLICT(notebook_id) DO UPDATE SET instructions=excluded.instructions,revision=excluded.revision',(notebook_id,text.strip(),revision+1))
    return instructions(notebook_id)


def activity(notebook_id):
    policy=instructions(notebook_id)
    team=[agent for agent in agents.list_agents() if any(book['notebook_id']==notebook_id for book in agent['notebooks'])]
    items=[]
    for suggestion in suggestions.list_pending(notebook_id=notebook_id):
        title=suggestion['values'].get('text') or 'Change task status to '+suggestion['values'].get('status','')
        items.append({'kind':'suggestion','id':suggestion['id'],'state':'needs_you','author':suggestion['author'],'text':title,'created_at':suggestion['created_at'],'suggestion':suggestion,'target':('/conversation/' if suggestion['target_kind']=='conversation' else '/page/')+suggestion['target_id']})
    with storage.connect() as conn:
        drafts=conn.execute('SELECT d.*,a.name AS author,m.job_id FROM agent_artifacts d JOIN agents a ON a.id=d.agent_id LEFT JOIN agent_messages m ON m.id=d.message_id WHERE d.notebook_id=? ORDER BY d.created_at DESC',(notebook_id,)).fetchall()
        artifact_jobs={row['job_id'] for row in drafts if row['job_id']}
        for row in drafts:
            state='needs_you' if row['state'] in {'draft','save_unknown'} else 'working' if row['state']=='saving' else 'done'
            items.append({'kind':'artifact','artifact':agent_artifacts._record(row),'id':row['id'],'agent_id':row['agent_id'],'author':row['author'],'state':state,'text':row['title'],'detail':{'draft':'Draft ready for review','save_unknown':'Check Gmail save status','saving':'Saving draft','saved':'Saved to Gmail drafts · Not sent','filed':'Saved as a notebook note','discarded':'Draft discarded'}.get(row['state'],row['state']),'created_at':row['updated_at'],'target':'/chat/'+row['agent_id']+'#message-'+str(row['message_id'] or '')})
        delegated=conn.execute('SELECT d.*,a.name AS author FROM agent_delegations d JOIN agents a ON a.id=d.specialist_id WHERE d.notebook_id=? ORDER BY d.created_at DESC LIMIT 100',(notebook_id,)).fetchall()
        for row in delegated:
            if row['id'] in artifact_jobs:continue
            working=row['state'] in {'queued','running'}
            items.append({'kind':'delegation','id':row['id'],'agent_id':row['steward_id'],'author':row['author'],'state':'working' if working else 'done','text':row['error'] or row['research'] or row['question'],'detail':{'queued':'Queued','researching':'Researching','drafting':'Preparing draft','complete':'Draft prepared','stopped':'Stopped or interrupted'}.get(row['stage'],row['stage']),'created_at':row['updated_at'],'target':'/chat/'+row['steward_id']})
        jobs=conn.execute('SELECT j.*,a.name AS author FROM agent_jobs j JOIN agents a ON a.id=j.agent_id WHERE j.notebook_id=? ORDER BY j.created_at DESC LIMIT 100',(notebook_id,)).fetchall()
        for row in jobs:
            if row['id'] in artifact_jobs:continue
            message=conn.execute("SELECT id,content FROM agent_messages WHERE job_id=? AND role='agent' ORDER BY created_at DESC LIMIT 1",(row['id'],)).fetchone()
            question=conn.execute("SELECT content FROM agent_messages WHERE job_id=? AND role='user' LIMIT 1",(row['id'],)).fetchone()
            state='working' if row['state']=='running' else 'done'
            text=message['content'] if message else row['error'] or (question['content'] if question else 'Agent request')
            items.append({'kind':'job','id':row['id'],'agent_id':row['agent_id'],'author':row['author'],'state':state,'text':text,'detail':{'running':'Working','succeeded':'Reply ready','failed':'Request failed','interrupted':'Stopped or interrupted'}.get(row['state'],row['state']),'created_at':row['finished_at'] or row['created_at'],'target':'/chat/'+row['agent_id']+('#message-'+message['id'] if message else '')})
    items.sort(key=lambda item:item['created_at'],reverse=True)
    counts={state:sum(item['state']==state for item in items) for state in ['needs_you','working','done']}
    return {'items':items[:150],'counts':counts,'agents':team,**policy}


def overview():
    with storage.connect() as conn:books=[dict(row) for row in conn.execute('SELECT id,name,color,collection_id FROM notebooks ORDER BY created_at')]
    for book in books:
        work=activity(book['id']);latest=next((item for item in work['items'] if item['state']!='working'),None)
        book.update(counts=work['counts'],latest={"text":markdown_inline_text(latest['text']),"target":latest['target']} if latest else None)
    return books
