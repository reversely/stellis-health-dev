"""Account-local drafts with explicit, revision-checked external actions."""
from __future__ import annotations
import json
import re
import uuid
from datetime import datetime, timezone
from stellis import agents, storage, gmail_api, todos


def _now():
    return datetime.now(timezone.utc).isoformat()


def kind_for(question):
    if not re.search(r"^(?:(?:can|could|would|will) you\s+)?(?:please\s+)?(?:draft|write|compose|prepare|create)\b", question, re.I):
        return None
    return 'email' if re.search(r'\b(email|mail|reply|letter)\b', question, re.I) else 'document'


def validate(title, body, recipients):
    if not isinstance(title,str) or not title.strip() or len(title)>200 or any(c in title for c in '\r\n'):
        raise ValueError('Enter a title or subject up to 200 characters')
    if not isinstance(body,str) or not body.strip() or len(body)>20000:
        raise ValueError('Enter draft text up to 20,000 characters')
    if not isinstance(recipients,list) or len(recipients)>20 or any(not isinstance(v,str) or not re.fullmatch(r'[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+',v) for v in recipients):
        raise ValueError('Enter valid recipient email addresses')


def parse(content, question, sources):
    value=content.strip()
    if value.startswith('```'):
        value=re.sub(r'^```(?:json)?\s*|\s*```$', '',value)
    result=json.loads(value)
    if not isinstance(result,dict):raise ValueError('Draft response is not an object')
    validate(result.get('title'),result.get('body'),result.get('recipients',[]))
    # A generated recipient must already occur in supplied evidence or the user's request.
    evidence=question+'\n'+'\n'.join(str(source.get('excerpt','')) for source in sources)
    allowed={value.casefold().strip('.,;') for value in re.findall(r'[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+',evidence)}
    result['recipients']=[v for v in result.get('recipients',[]) if v.casefold() in allowed]
    explicit = re.search(r'\bto\s+([A-Za-z0-9.!#$%&*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})', question, re.I)
    if explicit and not result['recipients']:
        result['recipients'] = [explicit.group(1)]
    from stellis import agent_followups
    from stellis import source_comparisons
    result['comparison'] = source_comparisons.validate(result.get('comparison'), sources) if not question.startswith('Prepare a detailed comparison') else None
    result['follow_up'] = agent_followups.validate(result.get('follow_up'), sources)
    return result


def _record(row, conn=None):
    if row is None:raise LookupError('Draft not found')
    item=dict(row)
    item['recipients']=json.loads(item.pop('recipients_json'));item['sources']=json.loads(item.pop('sources_json'))
    from stellis import agent_followups
    item['follow_up'] = agent_followups.for_artifact(item['id'], conn)
    return item


def get(identifier):
    with storage.connect() as conn:return _record(conn.execute('SELECT * FROM agent_artifacts WHERE id = ?', (identifier,)).fetchone(), conn)


def list_for(agent_id):
    agents.get(agent_id)
    with storage.connect() as conn:return [_record(row, conn) for row in conn.execute('SELECT * FROM agent_artifacts WHERE agent_id = ? ORDER BY created_at',(agent_id,))]


def create(agent_id, message_id, notebook_id, kind, title, body, recipients, sources, follow_up=None, comparison=None):
    validate(title,body,recipients);identifier=str(uuid.uuid4());stamp=_now()
    with storage.connect() as conn:
        conn.execute('''INSERT INTO agent_artifacts
            (id,agent_id,message_id,notebook_id,kind,title,body,recipients_json,sources_json,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)''',(identifier,agent_id,message_id,notebook_id,kind,title.strip(),body.strip(),json.dumps(recipients),json.dumps(sources),stamp,stamp))
        if comparison:
            from stellis import source_comparisons
            source_comparisons.create(conn, identifier, notebook_id, comparison)
        if follow_up:
            conn.execute('INSERT INTO agent_followups(artifact_id,candidate_json) VALUES(?,?)', (identifier,json.dumps(follow_up)))
    return get(identifier)


def edit(identifier, revision, title, body, recipients):
    validate(title,body,recipients)
    with storage.connect() as conn:
        changed=conn.execute('''UPDATE agent_artifacts SET title=?,body=?,recipients_json=?,revision=revision+1,updated_at=?,error=NULL
            WHERE id=? AND revision=? AND state='draft' ''',(title.strip(),body.strip(),json.dumps(recipients),_now(),identifier,revision)).rowcount
        if not changed:raise ValueError('This draft changed or is no longer editable. Refresh it first.')
    return get(identifier)


def discard(identifier, revision):
    with storage.connect() as conn:
        if not conn.execute("UPDATE agent_artifacts SET state='discarded',revision=revision+1,updated_at=? WHERE id=? AND revision=? AND state='draft'",(_now(),identifier,revision)).rowcount:
            raise ValueError('Only the current unsaved draft can be discarded')
    return get(identifier)


async def save_to_gmail(identifier, revision):
    draft=get(identifier)
    if draft['state']=='saved':return draft
    if draft['state']!='draft' or draft['revision']!=revision:raise ValueError('Refresh this draft before saving')
    if draft['kind']!='email' or not draft['recipients']:raise ValueError('Add a recipient before saving an email draft')
    account=(await gmail_api.profile())['email']
    with storage.connect() as conn:
        if not conn.execute("UPDATE agent_artifacts SET state='saving',account_email=?,error=NULL,updated_at=? WHERE id=? AND revision=? AND state='draft'",(account,_now(),identifier,revision)).rowcount:
            raise ValueError('This draft is already being saved or changed')
    try:
        result=await gmail_api.create_draft(draft['recipients'],draft['title'],draft['body'],message_id=f'stellis-{identifier}@draft.stellis.local')
        with storage.connect() as conn:
            conn.execute("UPDATE agent_artifacts SET state='saved',gmail_draft_id=?,updated_at=? WHERE id=?",(result['id'],_now(),identifier))
    except BaseException:
        with storage.connect() as conn:
            conn.execute("UPDATE agent_artifacts SET state='save_unknown',error='Gmail save was interrupted. Check its status before taking another action.',updated_at=? WHERE id=?",(_now(),identifier))
        raise
    return get(identifier)


async def reconcile(identifier):
    draft=get(identifier)
    if draft['state']!='save_unknown':return draft
    if (await gmail_api.profile())['email']!=draft['account_email']:raise ValueError('Reconnect the Gmail account used for this draft')
    result=await gmail_api.find_draft(f'stellis-{identifier}@draft.stellis.local')
    if result:
        with storage.connect() as conn:conn.execute("UPDATE agent_artifacts SET state='saved',gmail_draft_id=?,error=NULL,updated_at=? WHERE id=?",(result['id'],_now(),identifier))
    # An absent search result is not proof a delayed write failed; never auto-create a duplicate.
    return get(identifier)


def interrupt_saves():
    with storage.connect() as conn:
        conn.execute("UPDATE agent_artifacts SET state='save_unknown',error='Save interrupted. Check Gmail status.',updated_at=? WHERE state='saving'",(_now(),))


def save_note(identifier, revision):
    """File the reviewed document and mark its artifact in the same transaction."""
    with storage.connect() as conn:
        conn.execute("BEGIN IMMEDIATE")
        draft = _record(conn.execute("SELECT * FROM agent_artifacts WHERE id=?", (identifier,)).fetchone(), conn)
        if draft['state'] == 'filed':
            return draft
        if draft['kind'] != 'document' or draft['state'] != 'draft' or draft['revision'] != revision:
            raise ValueError('Refresh this draft before saving')
        stamp = _now()
        markdown = todos.reindex(conn, 'page', identifier, draft['body'])
        conn.execute("INSERT INTO pages(id,title,markdown,notebook_id,created_at,updated_at) VALUES(?,?,?,?,?,?)",
                     (identifier,draft['title'],markdown,draft['notebook_id'],stamp,stamp))
        conn.execute("UPDATE agent_artifacts SET state='filed',updated_at=? WHERE id=?", (stamp,identifier))
    return get(identifier)
