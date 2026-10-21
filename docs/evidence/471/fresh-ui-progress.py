import os,tempfile,subprocess,time,urllib.request,json,re,shlex
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path.cwd();out=root/'docs/evidence/471';out.mkdir(parents=True,exist_ok=True)
for line in Path('/tmp/stellis-fresh-proof/local.env').read_text().splitlines():
 key,value=line.split('=',1);os.environ[key]=shlex.split(value)[0]
with tempfile.TemporaryDirectory(prefix='stellis-fresh-account-') as data:
 os.environ.update(STELLIS_DATA_DIR=data,STELLIS_AUTH_DB_DIR=data,STELLIS_AUTH_MODE='required',STELLIS_ACCOUNT_ID='1')
 receipt=Path(data)/'progress.json'
 receipt.write_text(json.dumps({'stage':'sandbox','state':'running','pid':os.getpid()}))
 os.environ['STELLIS_LOCAL_SETUP_STATUS']=str(receipt)
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
    page.get_by_text('Setting up the local model and agent',exact=True).wait_for()
    receipt.write_text(json.dumps({'stage':'sandbox','state':'failed','pid':os.getpid()}))
    page.get_by_text('Local model and agent setup did not finish',exact=True).wait_for(timeout=15000)
    assert page.get_by_role('button',name='Learning',exact=True).get_attribute('aria-pressed')=='true'
    page.set_viewport_size({'width':390,'height':1100})
    page.screenshot(path=str(out/'failed-progress-390.png'),full_page=True)
    receipt.write_text(json.dumps({'stage':'response','state':'running','pid':os.getpid()}))
    page.get_by_text('Testing an AI response',exact=True).wait_for(timeout=15000)
    receipt.write_text(json.dumps({'stage':'ready','state':'ready','pid':os.getpid()}))
    page.get_by_text('Local setup finished',exact=True).wait_for(timeout=15000)
    assert page.get_by_text('Resume setup on the connected computer, then check again.',exact=True).is_hidden()
    assert page.get_by_role('button',name='Learning',exact=True).get_attribute('aria-pressed')=='true'
    assert not errors,errors
    print('PASS: receipt fixture running -> failure -> resumed response -> finished updates without losing choices',flush=True)
    browser.close()
  finally:proc.terminate();proc.wait(timeout=30)
