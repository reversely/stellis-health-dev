import os,tempfile,subprocess,time,urllib.request,json,re
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path.cwd();out=root/'docs/evidence/458';out.mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory(prefix='stellis-onboarding-policy-') as data:
 os.environ.update(STELLIS_DATA_DIR=data,STELLIS_AUTH_DB_DIR=data,STELLIS_AUTH_MODE='required',STELLIS_RUNTIME_PROFILE='local',STELLIS_ACCOUNT_ID='1')
 os.environ.update(NEMOCLAW_GATEWAY_PORT='8990',STELLIS_NEMOCLAW_SANDBOX='stellis-local',STELLIS_NEMOCLAW_COMMAND='/home/springbuilt/.local/bin/nemoclaw')
 from stellis import auth,agents,pages,notebooks,onboarding,storage
 auth.register('setup-policy-proof','disposable-proof-password')
 with open('/tmp/stellis-onboarding-policy-server.log','w') as log:
  proc=subprocess.Popen([str(root/'.venv/bin/python'),'-m','uvicorn','stellis.server:app','--host','127.0.0.1','--port','8824'],stdout=log,stderr=log,stdin=subprocess.DEVNULL)
  try:
   for _ in range(60):
    try:urllib.request.urlopen('http://127.0.0.1:8824/api/health');break
    except Exception:time.sleep(.5)
   with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/home/springbuilt/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome',args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':1440,'height':1100});page=context.new_page();base='http://127.0.0.1:8824';errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    assert context.request.post(base+'/api/v1/auth/login',data={'username':'setup-policy-proof','password':'disposable-proof-password'}).status==200
    page.goto(base+'/onboarding');page.get_by_role('button',name='Get started',exact=True).click()
    page.get_by_role('button',name='Projects',exact=True).click();page.get_by_role('button',name='Learning',exact=True).click()
    page.get_by_role('button',name='Continue',exact=True).click()
    enabled=page.get_by_role('checkbox',name='Suggest tasks for Projects',exact=True)
    disabled=page.get_by_role('checkbox',name='Suggest tasks for Learning',exact=True)
    assert not enabled.is_checked() and not disabled.is_checked()
    enabled.check();page.wait_for_function("!document.querySelector('[aria-label=\"Suggest tasks for Projects\"]').disabled")
    disabled.check();page.wait_for_function("!document.querySelector('[aria-label=\"Suggest tasks for Learning\"]').disabled")
    disabled.uncheck();page.wait_for_function("!document.querySelector('[aria-label=\"Suggest tasks for Learning\"]').disabled")
    page.get_by_role('button',name='Back',exact=True).click();page.get_by_role('button',name='Continue',exact=True).click()
    assert enabled.is_checked();page.reload();assert enabled.is_checked() and not disabled.is_checked()
    audit_text=Path('/tmp/stellis-layout-audit/layout-audit.mjs').read_text();audit=audit_text.split('const PAGE_AUDIT = ',1)[1].split(';\n\nasync function main()',1)[0]
    reports=[]
    for width in [360,390,768,1024,1280,1440,1920]:
     for theme in ['dark','light']:
      page.set_viewport_size({'width':width,'height':844 if width<768 else 1100});page.evaluate('(t)=>document.documentElement.dataset.theme=t',theme)
      reports.append({'width':width,'theme':theme,**page.evaluate(audit,{'centerSelectors':[],'ignoreSelectors':['#rail-shader'],'isNarrow':width<768})})
      if width in [390,1440]:page.screenshot(path=str(out/f'review-{width}-{theme}.png'),full_page=True)
    (out/'review-layout.json').write_text(json.dumps(reports,indent=2))
    page.get_by_role('button',name=re.compile(r'^Set up \d+ notebooks?$')).click();page.wait_for_url(re.compile(r'.*/(?:\?guide=workspace)?$'))
    books={b['name']:b for b in context.request.get(base+'/api/v1/notebooks').json()['notebooks']}
    assert books['Projects']['todo_list']=='on' and books['Learning']['todo_list']=='off'
    print('Fresh onboarding opt-in, opt-out, Back, reload and completion passed',flush=True)
    assert context.request.post(base+'/api/v1/onboarding/reopen').status==200
    page.goto(base+'/onboarding');page.get_by_role('button',name='Get started',exact=True).click();page.get_by_role('button',name='Projects',exact=True).click();page.get_by_role('button',name='Continue',exact=True).click()
    assert enabled.is_checked()
    page.get_by_role('button',name=re.compile(r'^Set up \d+ notebooks?$')).click();page.wait_for_url(base+'/')
    assert next(b for b in context.request.get(base+'/api/v1/notebooks').json()['notebooks'] if b['id']==books['Projects']['id'])['todo_list']=='on'
    print('Reopened setup preserves the existing enabled policy without a new choice',flush=True)
    for name in ['Projects','Learning']:
     book=books[name]['id'];pages.create('Review notes',book,'The review cannot finish until the missing measurement log is obtained from its owner.')
     team=context.request.get(base+'/api/v1/agents').json();agent=next(a for a in team if a.get('template_id')=='steward' and any(n['notebook_id']==book for n in a['notebooks']))
     response=context.request.post(base+f'/api/v1/agents/{agent["id"]}/ask',data={'question':'Draft a short review checklist and propose a concrete next action for the missing measurement log.','notebook_id':book,'target_agent_id':agent['id']},timeout=300000)
     assert response.status==200,response.text()
     artifacts=context.request.get(base+f'/api/v1/agents/{agent["id"]}/artifacts').json();followup=artifacts[-1]['follow_up']
     assert bool(followup)==(name=='Projects'),(name,followup)
     print(name+': actual local draft, follow-up '+('present' if followup else 'absent'),flush=True)
    assert not errors,errors
    browser.close()
  finally:
   proc.terminate();proc.wait(timeout=30)
