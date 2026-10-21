#!/usr/bin/env python3
"""Provision an isolated local agent deployment from an operator SSH session."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import re
import shlex
import signal
import shutil
import socket
import subprocess
import time
import uuid

IMAGE='ghcr.io/nvidia/nemoclaw/openclaw-sandbox@sha256:d9756531bc346aa956ed127d7dab577f29cc66273408e617081b7bc1a616049e'


def atomic(path, value):
    temporary=path.with_suffix(path.suffix+'.tmp')
    fd=os.open(temporary,os.O_CREAT|os.O_TRUNC|os.O_WRONLY,0o600)
    with os.fdopen(fd,'w') as stream:stream.write(value)
    temporary.replace(path)


def configuration(args):
    root=Path(args.root).expanduser().resolve()
    if not re.fullmatch(r'[a-z][a-z0-9-]{2,40}',args.name):raise ValueError('Use a sandbox name with lowercase letters, digits and hyphens')
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._:/-]{0,150}',args.model):raise ValueError('Choose a valid Ollama model tag')
    if not re.fullmatch(r'[A-Za-z0-9./_-]+@sha256:[a-f0-9]{64}',args.image):raise ValueError('Use a digest-pinned sandbox image')
    ports=[args.gateway_port,args.control_port]
    if len(set(ports))!=2 or any(p<1024 or p>65535 or p in {8080,8765,8821,8990,11434,18890} for p in ports):
        raise ValueError('Choose distinct unused ports, separate from existing Stellis and Ollama services')
    return {'root':str(root),'name':args.name,'model':args.model,'gateway_port':args.gateway_port,'control_port':args.control_port,'image':args.image}


def ensure_free(port):
    with socket.socket() as sock:
        try:sock.bind(('127.0.0.1',port))
        except OSError as exc:raise ValueError(f'Port {port} is already in use; choose another port') from exc


def provision(invocation, environment, log):
    process=subprocess.Popen(invocation,env=environment,stdout=log,stderr=log,start_new_session=True)
    try:
        code=process.wait()
        if code:raise subprocess.CalledProcessError(code,invocation)
    except BaseException:
        if process.poll() is None:
            os.killpg(process.pid,signal.SIGTERM)
            try:process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid,signal.SIGKILL);process.wait()
        raise


def run(args):
    config=configuration(args);root=Path(config['root'])
    if not args.apply:
        print(json.dumps({'configuration':config,'steps':['Check prerequisites','Prepare local model and agent sandbox','Verify local inference','Write deployment configuration']}));return
    if root.exists() and any(root.iterdir()) and not (root/'setup.json').is_file():
        raise ValueError('Choose an empty deployment directory; existing files will not be overwritten')
    root.mkdir(parents=True,exist_ok=True)
    with (root/'setup.lock').open('a') as lock:
        try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError as exc:raise ValueError('Setup is already running in this directory') from exc
        receipt=root/'setup.json'
        if receipt.exists():
            previous=json.loads(receipt.read_text())
            if previous.get('configuration')!=config:raise ValueError('Resume with the original deployment settings')
            if not args.resume:raise ValueError('This deployment already has setup state. Use --resume')
        else:
            for port in (args.gateway_port,args.control_port):ensure_free(port)
            state_root=Path.home()/'.nemoclaw'/'gateways'/str(args.gateway_port)
            if state_root.exists():raise ValueError('This gateway already has state; choose an unused gateway port')
        current_stage='prerequisites'
        def report(stage,state='running'):
            nonlocal current_stage
            current_stage=stage
            atomic(receipt,json.dumps({'configuration':config,'stage':stage,'state':state,'pid':os.getpid(),'updated_at':time.time()}))
            print(json.dumps({'stage':stage,'state':state}),flush=True)
        try:
            report('prerequisites')
            command=shutil.which(args.nemoclaw) or str(Path(args.nemoclaw).expanduser())
            environment={key:value for key,value in os.environ.items() if not key.startswith('NEMOCLAW_')}
            environment.update(NEMOCLAW_GATEWAY_PORT=str(args.gateway_port),NEMOCLAW_PROVIDER='ollama',NEMOCLAW_MODEL=args.model)
            settings={'STELLIS_RUNTIME_PROFILE':'local','STELLIS_ACCOUNT_ID':'1','STELLIS_DATA_DIR':str(root/'data'),
                      'STELLIS_LOCAL_SETUP_STATUS':str(receipt),'NEMOCLAW_GATEWAY_PORT':str(args.gateway_port),
                      'STELLIS_NEMOCLAW_COMMAND':command,'STELLIS_NEMOCLAW_SANDBOX':args.name,
                      'STELLIS_LOCAL_INFERENCE_URL':'http://127.0.0.1:11434/v1','STELLIS_LOCAL_INFERENCE_MODEL':args.model}
            atomic(root/'local.env','\n'.join(key+'='+shlex.quote(value) for key,value in settings.items())+'\n')
            if not os.access(command,os.X_OK):raise ValueError('Install NemoClaw on this host, then resume setup')
            report('sandbox')
            provision_needed=True;flags=['--fresh']
            if args.resume:
                listed=subprocess.run([command,'list','--json'],env=environment,capture_output=True,text=True,timeout=30)
                if listed.returncode:
                    if (Path.home()/'.nemoclaw'/'gateways'/str(args.gateway_port)).exists():
                        raise ValueError('Cannot verify ownership of the existing gateway. Inspect it before resuming.')
                    inventory={}
                else:inventory=json.loads(listed.stdout)
                names={item['name'] for item in inventory.get('sandboxes',[])}
                if names-{args.name}:raise ValueError('This gateway contains another sandbox; it will not be changed')
                unfinished=bool(inventory.get('incompleteOnboarding'))
                provision_needed=args.name not in names or unfinished
                flags=['--resume'] if unfinished else ['--fresh']
            invocation=[command,'onboard','--agent','openclaw','--name',args.name,'--non-interactive','--yes',
                        '--yes-i-accept-third-party-software','--no-gpu','--from-image',args.image,
                        '--control-ui-port',str(args.control_port),'--events=jsonl',*flags]
            fd=os.open(root/'setup.log',os.O_CREAT|os.O_APPEND|os.O_WRONLY,0o600)
            with os.fdopen(fd,'w') as log:
                if provision_needed:provision(invocation,environment,log)
            report('inference')
            result=subprocess.run([command,'inference','get','--json'],env=environment,capture_output=True,text=True,check=True,timeout=60)
            route=json.loads(result.stdout)
            if route.get('provider')!='ollama-local' or route.get('model')!=args.model:
                raise ValueError('The installed agent route does not match the requested local model')
            report('response')
            nonce='setup-'+uuid.uuid4().hex
            reply=subprocess.run([command,args.name,'agent','--agent','main','--session-id',str(uuid.uuid4()),
                                  '-m','Reply with exactly this text and nothing else: '+nonce,'--json','--timeout','90'],
                                 env=environment,capture_output=True,text=True,check=True,timeout=150)
            envelope=json.loads(reply.stdout);envelope=envelope.get('result',envelope)
            answer='\n'.join(item.get('text','') for item in envelope.get('payloads',[])).strip()
            if envelope.get('meta',{}).get('error') or answer!=nonce:raise ValueError('The local agent did not pass its live response check')
            report('ready','ready')
        except BaseException as exc:
            report('interrupted' if isinstance(exc,KeyboardInterrupt) else current_stage,'failed')
            raise


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root',required=True);parser.add_argument('--name',required=True)
    parser.add_argument('--model',required=True);parser.add_argument('--gateway-port',type=int,required=True)
    parser.add_argument('--control-port',type=int,required=True);parser.add_argument('--image',default=IMAGE)
    parser.add_argument('--nemoclaw',default=str(Path.home()/'.local/bin/nemoclaw'))
    parser.add_argument('--apply',action='store_true');parser.add_argument('--resume',action='store_true')
    signal.signal(signal.SIGINT,signal.default_int_handler)
    signal.signal(signal.SIGTERM,lambda *_:signal.default_int_handler(signal.SIGINT,None))
    try:run(parser.parse_args())
    except (ValueError,OSError,subprocess.SubprocessError) as exc:parser.exit(1,str(exc)+'\n')
