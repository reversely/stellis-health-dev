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
 with open('/tmp/comparison-ui-server.log','w') as log:
  proc=subprocess.Popen([str(root/'.venv/bin/python'),'-m','uvicorn','stellis.server:app','--host','127.0.0.1','--port','8826'],stdout=log,stderr=log,stdin=subprocess.DEVNULL)
  try:
   for _ in range(60):
    try:urllib.request.urlopen('http://127.0.0.1:8826/api/health');break
    except Exception:time.sleep(.5)
   with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/home/springbuilt/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome',args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':1440,'height':1100});page=context.new_page();base='http://127.0.0.1:8826';errors=[]
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
    from stellis import source_search,source_comparisons,agent_artifacts
    agent=agents.resolved_agent(book)['agent']
    docs=[d for d in source_search._documents() if d[2]==book and d[3] in ['First proposal','Second proposal']]
    sources=[{'source_id':d[1],'title':d[3],'target':d[5],'excerpt':d[4]} for d in docs]
    value={'question':'Compare the terms of these two proposals?', 'sources':[{'source_index':i+1,'quote':s['excerpt'].split('\n')[-1]} for i,s in enumerate(sources)]}
    candidate=source_comparisons.validate(value,sources)
    parent=agents.start_job(agent['id'],book);message=agents.append_message(agent['id'],'agent','Review complete',book,parent)
    agent_artifacts.create(agent['id'],message['id'],book,'document','Source review','Review ready',[],[],comparison=candidate)
    agents.finish_job(parent,'succeeded');identifier=source_comparisons.list_for(book)[0]['id']
    page.goto(base+'/notebook/'+book);card=page.locator('[data-activity-id="'+identifier+'"]')
    card.get_by_role('button',name='Compare',exact=True).wait_for()
    audit_text=Path('/tmp/stellis-layout-audit/layout-audit.mjs').read_text()
    audit=audit_text.split('const PAGE_AUDIT = ',1)[1].split(';\n\nasync function main()',1)[0]
    reports=[]
    for width in [360,390,768,1024,1280,1440,1920]:
     for theme in ['dark','light']:
      page.set_viewport_size({'width':width,'height':844 if width<768 else 1100});page.evaluate('(t)=>document.documentElement.dataset.theme=t',theme)
      reports.append({'width':width,'theme':theme,**page.evaluate(audit,{'centerSelectors':[],'ignoreSelectors':['#rail-shader'],'isNarrow':width<768})})
      if width in [390,1440]:page.screenshot(path=str(out/f'fixture-{width}-{theme}.png'),full_page=True)
    (out/'layout.json').write_text(json.dumps(reports,indent=2))
    page_id=sources[0]['source_id'];original=pages.get(page_id)['markdown']
    with storage.connect() as conn:conn.execute('UPDATE pages SET markdown=? WHERE id=?',('Changed source',page_id))
    rejected=context.request.post(base+f'/api/v1/notebooks/{book}/comparisons/{identifier}/run')
    assert rejected.status==400 and 'changed' in rejected.text(),rejected.text()
    with storage.connect() as conn:conn.execute('UPDATE pages SET markdown=? WHERE id=?',(original,page_id))
    agents.update(agent['id'],enabled=False)
    assert context.request.post(base+f'/api/v1/notebooks/{book}/comparisons/{identifier}/run').status==400
    agents.update(agent['id'],enabled=True)
    card.get_by_role('button',name='Compare',exact=True).click()
    card.get_by_role('button',name='Stop',exact=True).wait_for();card.get_by_role('button',name='Stop',exact=True).click()
    card.get_by_role('button',name='Try comparison again',exact=True).wait_for(timeout=60000)
    page.reload();card.get_by_role('button',name='Try comparison again',exact=True).wait_for()
    card.get_by_role('button',name='Dismiss',exact=True).click();card.get_by_text('Comparison dismissed',exact=True).wait_for()
    page.reload();card.get_by_text('Comparison dismissed',exact=True).wait_for()
    print('Stored proposal fixture: changed source and Off rejection; actual local Compare/Stop; retry, Dismiss and reload passed',flush=True)
    assert not errors,errors
    browser.close()
  finally:
   proc.terminate();proc.wait(timeout=30)
