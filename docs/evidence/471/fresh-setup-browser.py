import os,tempfile,subprocess,time,urllib.request,json,re,shlex
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path.cwd();out=root/'docs/evidence/471';out.mkdir(parents=True,exist_ok=True)
for line in Path('/tmp/stellis-fresh-proof/local.env').read_text().splitlines():
 key,value=line.split('=',1);os.environ[key]=shlex.split(value)[0]
with tempfile.TemporaryDirectory(prefix='stellis-fresh-account-') as data:
 os.environ.update(STELLIS_DATA_DIR=data,STELLIS_AUTH_DB_DIR=data,STELLIS_AUTH_MODE='required',STELLIS_ACCOUNT_ID='1')
 from stellis import auth,onboarding,runtime_trace,notebooks
 auth.register('fresh-proof','disposable-proof-password')
 with open('/tmp/fresh-browser-server.log','w') as log:
  proc=subprocess.Popen([str(root/'.venv/bin/python'),'-m','uvicorn','stellis.server:app','--host','127.0.0.1','--port','8825'],stdout=log,stderr=log,stdin=subprocess.DEVNULL)
  try:
   for _ in range(60):
    try:urllib.request.urlopen('http://127.0.0.1:8825/api/health');break
    except Exception:time.sleep(.5)
   with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/home/springbuilt/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome',args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':1440,'height':1100});page=context.new_page();base='http://127.0.0.1:8825';errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    assert context.request.post(base+'/api/v1/auth/login',data={'username':'fresh-proof','password':'disposable-proof-password'}).status==200
    page.goto(base+'/onboarding');page.get_by_role('button',name='Get started',exact=True).click()
    page.get_by_role('button',name='Learning',exact=True).click()
    page.get_by_text('Local setup finished',exact=True).wait_for()
    print('Fresh account sees operator setup readiness from the newly created sandbox',flush=True)
    page.get_by_role('button',name='Check setup',exact=True).click()
    page.get_by_text('AI is ready.',exact=True).wait_for(timeout=240000)
    audit=Path('/tmp/stellis-layout-audit/layout-audit.mjs').read_text().split('const PAGE_AUDIT = ',1)[1].split(';\n\nasync function main()',1)[0]
    geometry=[]
    for width in (390,1440):
     for theme in ('dark','light'):
      page.set_viewport_size({'width':width,'height':1100});page.evaluate('(theme)=>document.documentElement.dataset.theme=theme',theme)
      geometry.append({'width':width,'theme':theme,**page.evaluate(audit,{'centerSelectors':[],'ignoreSelectors':['#rail-shader'],'isNarrow':width<768})})
      page.screenshot(path=str(out/f'ready-{width}-{theme}.png'),full_page=True)
    page.reload();page.get_by_text('AI is ready.',exact=True).wait_for()
    assert page.get_by_role('button',name='Learning',exact=True).get_attribute('aria-pressed')=='true'
    page.get_by_role('button',name='Continue',exact=True).click()
    page.get_by_role('button',name='Set up 1 notebook',exact=True).click()
    page.wait_for_url(re.compile(r'.*/(?:\?guide=workspace)?$'))
    assert len(notebooks.list_notebooks())==1
    (out/'layout.json').write_text(json.dumps(geometry,indent=2))
    (out/'runtime-traces.json').write_text(json.dumps(runtime_trace.recent(),indent=2))
    (out/'operator-progress.json').write_text(Path('/tmp/stellis-fresh-proof/setup.json').read_text())
    assert not errors,errors
    print('PASS: newly provisioned sandbox, real in-app local response, reload, selections, notebook creation and guide handoff',flush=True)
    browser.close()
  finally:proc.terminate();proc.wait(timeout=30)
