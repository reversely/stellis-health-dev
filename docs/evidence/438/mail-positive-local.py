import os,tempfile,asyncio,json
from pathlib import Path
with tempfile.TemporaryDirectory(prefix='stellis-mail-positive-') as data:
 os.environ.update(STELLIS_DATA_DIR=data,STELLIS_AUTH_DB_DIR=data,STELLIS_RUNTIME_PROFILE='local',STELLIS_ACCOUNT_ID='1')
 os.environ.update(NEMOCLAW_GATEWAY_PORT='8990',STELLIS_NEMOCLAW_SANDBOX='stellis-local',STELLIS_NEMOCLAW_COMMAND='/home/springbuilt/.local/bin/nemoclaw')
 from stellis import notebooks,agents,mail_runs,pages,storage
 book=notebooks.create('Writing verification');writer=agents.create('Writing','Writing',template_id='writing',notebook_id=book['id'])
 note=pages.create('Explicit verification message',book['id'],'From: colleague@example.test\nCan you tell me which documents you need before our next review? Please send me a list so I can prepare them.')
 evidence=[{'source_id':'page:'+note['id'],'title':'Explicit verification message','excerpt':note['markdown'],'target':'/page/'+note['id'],'start_ms':None}]
 async def run():
  needed,result=await mail_runs.assess(writer['id'],book['id'],evidence)
  assert needed,'Positive supplied message was not classified as needing a reply'
  reply=await mail_runs.prepare_reply(writer['id'],book['id'],evidence)
  with storage.connect() as conn:
   drafts=[dict(row) for row in conn.execute('SELECT kind,state,body,recipients_json FROM agent_artifacts')]
  assert len(drafts)==1 and drafts[0]['state']=='draft' and drafts[0]['kind']=='email'
  assert len(drafts[0]['body'].split())>=25
  assert all(m['role']!='user' for m in agents.messages(writer['id']))
  proof={'source':'Explicit local verification message; not a received Gmail message','actual_local_classification':True,'actual_local_draft':True,'draft_words':len(drafts[0]['body'].split()),'automatic_request_label':True,'provider_writes':False}
  out=Path('docs/evidence/438');out.mkdir(parents=True,exist_ok=True);(out/'mail-positive-local.json').write_text(json.dumps(proof,indent=2)+'\n')
  print(json.dumps(proof),flush=True)
 asyncio.run(run())
