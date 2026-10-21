import subprocess,time,json,signal
from pathlib import Path
command=['python3','scripts/setup_local_agents.py','--root','/tmp/stellis-fresh-proof','--name','stellis-fresh-proof','--model','nemotron-3-nano:latest','--gateway-port','8991','--control-port','18891','--apply','--resume']
with open('/tmp/fresh-interrupted.log','w') as log:
 process=subprocess.Popen(command,stdout=log,stderr=log)
 for _ in range(100):
  state=json.loads(Path('/tmp/stellis-fresh-proof/setup.json').read_text())
  if state['pid']==process.pid and state['stage']=='sandbox':break
  if process.poll() is not None:raise RuntimeError('Setup exited before interruption check')
  time.sleep(.05)
 else:raise RuntimeError('Setup did not reach sandbox check')
 process.send_signal(signal.SIGTERM);process.wait(timeout=20)
 state=json.loads(Path('/tmp/stellis-fresh-proof/setup.json').read_text())
 assert state['stage']=='interrupted' and state['state']=='failed',state
 print('PASS: SIGTERM ends operator setup and persists interrupted state',flush=True)
with open('/tmp/fresh-after-interruption.log','w') as log:
 result=subprocess.run(command,stdout=log,stderr=log,timeout=240)
 assert result.returncode==0,result.returncode
state=json.loads(Path('/tmp/stellis-fresh-proof/setup.json').read_text())
assert state['state']=='ready',state
print('PASS: same deployment resumes and passes a new live response check',flush=True)
