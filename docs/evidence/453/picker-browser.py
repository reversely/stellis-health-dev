import os,tempfile,subprocess,time,urllib.request,json
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path.cwd();out=root/'docs/evidence/453';out.mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory(prefix='stellis-mentions-') as data:
 os.environ.update(STELLIS_DATA_DIR=data,STELLIS_AUTH_DB_DIR=data,STELLIS_AUTH_MODE='required',STELLIS_RUNTIME_PROFILE='local',STELLIS_ACCOUNT_ID='1')
 os.environ.update(NEMOCLAW_GATEWAY_PORT='8990',STELLIS_NEMOCLAW_SANDBOX='stellis-local',STELLIS_NEMOCLAW_COMMAND='/home/springbuilt/.local/bin/nemoclaw')
 from stellis import auth,onboarding,agents,pages,notebook_work
 auth.register('mention-proof','local-mention-proof-password');account=auth.account_id_for_username('mention-proof')
 onboarding.choose(account,['learning'],'review');made=onboarding.complete(account);book=made['created'][0]['notebook_id']
 team=agents.list_agents();origin=next(a for a in team if a.get('template_id')=='steward');target=next(a for a in team if a.get('template_id')=='tutor')
 agents.update(target['id'],instructions='Start every reply with Compass.');agents.update(origin['id'],instructions='Start every reply with Lighthouse.')
 notebook_work.save_instructions(book,'Keep replies under 50 words.',0)
 pages.create('Review notes',book,'The next review should compare the recorded inputs and outputs with the saved notes.')
 with open('/tmp/stellis-mentions-server.log','w') as log:
  proc=subprocess.Popen([str(root/'.venv/bin/python'),'-m','uvicorn','stellis.server:app','--host','127.0.0.1','--port','8824'],stdout=log,stderr=log,stdin=subprocess.DEVNULL)
  try:
   for _ in range(60):
    try:urllib.request.urlopen('http://127.0.0.1:8824/api/health');break
    except Exception:time.sleep(.5)
   with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/home/springbuilt/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome',args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':1440,'height':1100});page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));base='http://127.0.0.1:8824'
    assert context.request.post(base+'/api/v1/auth/login',data={'username':'mention-proof','password':'local-mention-proof-password'}).status==200
    page.goto(base+'/chat/'+origin['id']);composer=page.locator('.agent-composer');composer.get_by_label('Notebook context').select_option(book)
    input=composer.locator('textarea');input.fill('@Tut');page.get_by_role('listbox',name='Notebook agents').get_by_role('option',name=target['name'],exact=True).wait_for();input.press('Enter')
    composer.get_by_role('button',name='Remove mention of '+target['name']).wait_for();input.fill('What should I check for the next review?')
    page.reload();composer.get_by_role('button',name='Remove mention of '+target['name']).wait_for();assert input.input_value()=='What should I check for the next review?'
    audit_text=Path('/tmp/stellis-layout-audit/layout-audit.mjs').read_text()
    audit=audit_text.split('const PAGE_AUDIT = ',1)[1].split(';\n\nasync function main()',1)[0]
    reports=[]
    for width,theme in [(width,theme) for width in [360,390,768,1024,1280,1440,1920] for theme in ['dark','light']]:
     page.set_viewport_size({'width':width,'height':844 if width<768 else 1100});page.evaluate('(t)=>document.documentElement.dataset.theme=t',theme)
     composer.get_by_role('button',name='Mention an agent').click();page.get_by_role('listbox',name='Notebook agents').wait_for()
     assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
     reports.append({'state':'open','width':width,'theme':theme,**page.evaluate(audit,{'centerSelectors':[],'ignoreSelectors':['#rail-shader'],'isNarrow':width<768})})
     if width in [390,1440]:page.screenshot(path=str(out/f'picker-{width}-{theme}.png'),full_page=True)
     input.press('Escape')
     reports.append({'state':'closed','width':width,'theme':theme,**page.evaluate(audit,{'centerSelectors':[],'ignoreSelectors':['#rail-shader'],'isNarrow':width<768})})
    (out/'mentions-layout.json').write_text(json.dumps(reports,indent=2)+'\n')
    page.goto(base+'/notebook/'+book);form=page.locator('.notebook-composer');field=form.locator('textarea')
    field.fill('@Tut');page.get_by_role('listbox',name='Notebook agents').get_by_role('option',name=target['name'],exact=True).wait_for();field.press('Enter');field.fill('Keep this notebook question.')
    page.reload();form.get_by_role('button',name='Remove mention of '+target['name']).wait_for();assert field.input_value()=='Keep this notebook question.'
    context.request.patch(base+f'/api/v1/agents/{target["id"]}/notebooks/{book}',data={'enabled':False})
    form.get_by_role('button',name='Send',exact=True).click();page.wait_for_timeout(1000);assert field.input_value()=='Keep this notebook question.'
    assert 'off' in page.locator('.notebook-work-status').inner_text().lower() or 'unavailable' in page.locator('.notebook-work-status').inner_text().lower()
    assert not errors,errors;browser.close()
    print('Mention keyboard selection, persisted draft, layouts and off-recipient rejection passed',flush=True)
  finally:proc.terminate();proc.wait(timeout=30)
