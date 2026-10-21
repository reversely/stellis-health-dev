import os,tempfile,subprocess,time,urllib.request,json,re
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path.cwd();out=root/'docs/evidence/467';out.mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory(prefix='stellis-onboarding-policy-') as data:
 os.environ.update(STELLIS_DATA_DIR=data,STELLIS_AUTH_DB_DIR=data,STELLIS_AUTH_MODE='required',STELLIS_RUNTIME_PROFILE='local',STELLIS_ACCOUNT_ID='1')
 os.environ.update(NEMOCLAW_GATEWAY_PORT='8990',STELLIS_NEMOCLAW_SANDBOX='stellis-local',STELLIS_NEMOCLAW_COMMAND='/home/springbuilt/.local/bin/nemoclaw')
 from stellis import auth,agents,pages,notebooks,onboarding,storage
 auth.register('setup-policy-proof','disposable-proof-password')

 account=auth.account_id_for_username('setup-policy-proof');onboarding.choose(account,[],'review')
 state=onboarding._read();state['scan']={'id':'review-fixture','state':'ready','days':14,'processed':1,'total':1,'selected_group_ids':['source-book'],
  'sources':[{'id':'note:1','kind':'Note','title':'Source notes','date':'2026-10-20','excerpt':'A measurement log is needed for the review.','url':''}],
  'groups':[{'id':'source-book','name':'Imported notebook','collection':'Work','source_ids':['note:1']}]};onboarding._save(state)
 with open('/tmp/comparison-server.log','w') as log:
  proc=subprocess.Popen([str(root/'.venv/bin/python'),'-m','uvicorn','stellis.server:app','--host','127.0.0.1','--port','8825'],stdout=log,stderr=log,stdin=subprocess.DEVNULL)
  try:
   for _ in range(60):
    try:urllib.request.urlopen('http://127.0.0.1:8825/api/health');break
    except Exception:time.sleep(.5)
   with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/home/springbuilt/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome',args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':1440,'height':1100});page=context.new_page();base='http://127.0.0.1:8825';errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    assert context.request.post(base+'/api/v1/auth/login',data={'username':'setup-policy-proof','password':'disposable-proof-password'}).status==200
    page.goto(base+'/onboarding');choice=page.get_by_role('checkbox',name='Suggest tasks for Imported notebook',exact=True)
    choice.check();page.wait_for_function("!document.querySelector('[aria-label=\"Suggest tasks for Imported notebook\"]').disabled")
    page.reload();assert choice.is_checked()
    for width,theme in [(1440,'dark'),(390,'light')]:
     page.set_viewport_size({'width':width,'height':1100});page.evaluate('(t)=>document.documentElement.dataset.theme=t',theme)
     page.screenshot(path=str(out/f'review-{width}-{theme}.png'),full_page=True)
    page.get_by_role('button',name='Set up 1 notebook',exact=True).click();page.wait_for_url(re.compile(r'.*/(?:\?guide=workspace)?$'))
    books=context.request.get(base+'/api/v1/notebooks').json()['notebooks']
    assert len(books)==1 and books[0]['todo_list']=='on'
    assert len(pages.list_pages(books[0]['id']))==1
    book=books[0]['id']
    pages.create('First proposal',book,'The first proposal includes equipment for 2500 units, installation for 500 units, and delivery in two weeks. The total is 3000 units. Warranty lasts one year.')
    pages.create('Second proposal',book,'The second proposal includes equipment for 3100 units, installation for 500 units, and delivery in four weeks. The total is 3600 units. Warranty lasts two years.')
    page.goto(base+'/notebook/'+book)
    page.get_by_role('button',name='Review sources',exact=True).click()
    print('Review requested through the notebook UI',flush=True)
    for _ in range(600):
     activity=context.request.get(base+f'/api/v1/notebooks/{book}/activity').json()
     proposals=[i for i in activity['items'] if i['kind']=='comparison']
     if proposals:break
     failed=[i for i in activity['items'] if i['kind']=='job' and i['detail']=='Request failed']
     if failed:raise AssertionError(failed)
     time.sleep(1)
    assert proposals,activity
    proposal=proposals[0];identifier=proposal['id']
    (out/'proposal.json').write_text(json.dumps(proposal,indent=2))
    print('Actual local proposal: '+proposal['text'],flush=True)
    page.reload();card=page.locator('[data-activity-id="'+identifier+'"]')
    card.get_by_role('button',name='Compare',exact=True).wait_for()
    for width,theme in [(1440,'dark'),(390,'light')]:
     page.set_viewport_size({'width':width,'height':1100});page.evaluate('(t)=>document.documentElement.dataset.theme=t',theme)
     page.screenshot(path=str(out/f'proposal-{width}-{theme}.png'),full_page=True)
    card.get_by_role('button',name='Compare',exact=True).click()
    card.get_by_role('button',name='Stop',exact=True).wait_for()
    page.reload();card.get_by_role('button',name='Stop',exact=True).wait_for()
    for _ in range(600):
     activity=context.request.get(base+f'/api/v1/notebooks/{book}/activity').json()
     proposal=next(i for i in activity['items'] if i['id']==identifier)
     if proposal['comparison']['state']!='running':break
     time.sleep(1)
    assert proposal['comparison']['state']=='done',proposal
    job=proposal['comparison']['job_id']
    with storage.connect() as conn:
     artifact=dict(conn.execute('SELECT a.* FROM agent_artifacts a JOIN agent_messages m ON m.id=a.message_id WHERE m.job_id=?',(job,)).fetchone())
    (out/'comparison.json').write_text(json.dumps(artifact,indent=2))
    assert '3000' in artifact['body'] and '3600' in artifact['body'],artifact['body']
    assert len(json.loads(artifact['sources_json']))==2
    print('Actual local comparison: '+artifact['title'],flush=True)
    repeated=context.request.post(base+f'/api/v1/notebooks/{book}/comparisons/{identifier}/run').json()
    assert repeated['job_id']==job
    page.reload();page.get_by_text('Comparison prepared',exact=True).wait_for()
    page.screenshot(path=str(out/'comparison-complete.png'),full_page=True)
    print('Review, exact-quoted proposal, reload, Compare, completed cited artifact and repeated-click dedupe passed',flush=True)
    assert not errors,errors
    browser.close()
  finally:
   from stellis import runtime_trace
   (out/"runtime-traces.json").write_text(json.dumps(runtime_trace.recent(),indent=2))
   proc.terminate();proc.wait(timeout=30)
