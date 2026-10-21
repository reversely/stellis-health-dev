import os,tempfile,subprocess,time,urllib.request,json,re
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path.cwd();out=root/'docs/evidence/465';out.mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory(prefix='stellis-onboarding-policy-') as data:
 os.environ.update(STELLIS_DATA_DIR=data,STELLIS_AUTH_DB_DIR=data,STELLIS_AUTH_MODE='required',STELLIS_RUNTIME_PROFILE='local',STELLIS_ACCOUNT_ID='1')
 os.environ.update(NEMOCLAW_GATEWAY_PORT='8990',STELLIS_NEMOCLAW_SANDBOX='stellis-local',STELLIS_NEMOCLAW_COMMAND='/home/springbuilt/.local/bin/nemoclaw')
 from stellis import auth,agents,pages,notebooks,onboarding,storage
 auth.register('setup-policy-proof','disposable-proof-password')

 account=auth.account_id_for_username('setup-policy-proof');onboarding.choose(account,[],'review')
 state=onboarding._read();state['scan']={'id':'review-fixture','state':'ready','days':14,'processed':1,'total':1,'selected_group_ids':['source-book'],
  'sources':[{'id':'note:1','kind':'Note','title':'Source notes','date':'2026-10-20','excerpt':'A measurement log is needed for the review.','url':''}],
  'groups':[{'id':'source-book','name':'Imported notebook','collection':'Work','source_ids':['note:1']}]};onboarding._save(state)
 with open('/tmp/recording-filing-server.log','w') as log:
  proc=subprocess.Popen([str(root/'.venv/bin/python'),'-m','uvicorn','stellis.server:app','--host','127.0.0.1','--port','8825'],stdout=log,stderr=log,stdin=subprocess.DEVNULL)
  try:
   for _ in range(60):
    try:urllib.request.urlopen('http://127.0.0.1:8825/api/health');break
    except Exception:time.sleep(.5)
   with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/home/springbuilt/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome',args=['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'])
    context=browser.new_context(viewport={'width':1440,'height':1100},permissions=['microphone']);page=context.new_page();base='http://127.0.0.1:8825';errors=[]
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
    book=books[0]['id'];page.goto(base+'/notebook/'+book)
    page.get_by_role('button',name='Record',exact=True).click();page.wait_for_url(base+'/recording')
    page.locator('#stop-recording').wait_for()
    assert page.locator('#recording-notebook-name').inner_text()=='Imported notebook'
    page.locator('#recording-title').fill('Recorded review')
    page.locator('#recording-title').press('Tab')
    sessions=context.request.get(base+'/api/v1/recordings').json();recording_id=sessions[0]['id']
    note=context.request.get(base+f'/api/v1/recordings/{recording_id}/notes').json()
    saved=context.request.put(base+f'/api/v1/recordings/{recording_id}/notes',data={'markdown':'Captured review notes','expected_revision':note['revision']})
    assert saved.status==200,saved.text()
    page.wait_for_timeout(2500)
    page.screenshot(path=str(out/'recording-destination.png'),full_page=True)
    page.locator('#stop-recording').click();page.wait_for_url(re.compile(r'.*/conversation/.*'),timeout=60000)
    meeting=page.url.split('/conversation/')[1].split('?')[0]
    assert context.request.get(base+f'/api/v1/conversations/{meeting}/notes').json()['markdown']=='Captured review notes'
    audio=context.request.get(base+f'/api/v1/conversations/{meeting}/audio').body();assert len(audio)>1000
    page.goto(base+'/notebook/'+book)
    card=page.locator('.notebook-activity').filter(has_text='Filed this meeting here.')
    card.get_by_text('Filed sources',exact=True).click()
    source=card.locator('a[href="/conversation/'+meeting+'"]');source.wait_for()
    source.click();page.wait_for_url(base+'/conversation/'+meeting)
    page.goto(base+'/notebook/'+book)
    card.get_by_role('button',name='Undo',exact=True).wait_for()
    page.locator('.notebook-team-row').first.wait_for()
    audit_text=Path('/tmp/stellis-layout-audit/layout-audit.mjs').read_text()
    audit=audit_text.split('const PAGE_AUDIT = ',1)[1].split(';\n\nasync function main()',1)[0]
    reports=[]
    for width in [360,390,768,1024,1280,1440,1920]:
     for theme in ['dark','light']:
      page.set_viewport_size({'width':width,'height':844 if width<768 else 1100});page.evaluate('(t)=>document.documentElement.dataset.theme=t',theme)
      reports.append({'width':width,'theme':theme,**page.evaluate(audit,{'centerSelectors':[],'ignoreSelectors':['#rail-shader'],'isNarrow':width<768})})
      if width in [390,1440]:page.screenshot(path=str(out/f'filing-{width}-{theme}.png'),full_page=True)
    (out/'layout.json').write_text(json.dumps(reports,indent=2))
    card.get_by_role('button',name='Undo',exact=True).click();card.get_by_text('Filing undone',exact=True).wait_for()
    page.reload();page.get_by_text('Filing undone',exact=True).wait_for()
    from stellis import storage
    assert storage.get_conversation(meeting)['notebook_id'] is None
    assert context.request.get(base+f'/api/v1/conversations/{meeting}/audio').body()==audio
    assert context.request.get(base+f'/api/v1/conversations/{meeting}/notes').json()['markdown']=='Captured review notes'
    print('Browser MediaRecorder with synthetic microphone: notebook destination, Stop, meeting link, Undo/reload, audio and notes retention passed',flush=True)
    assert not errors,errors
    browser.close()
  finally:
   proc.terminate();proc.wait(timeout=30)
