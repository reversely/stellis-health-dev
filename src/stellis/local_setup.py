"""Read sanitized progress from an operator-owned local setup receipt."""
import json
import os
from pathlib import Path
from stellis import runtime_profile

STAGES={'prerequisites':'Checking local software','sandbox':'Setting up the local model and agent',
        'inference':'Checking the model route','response':'Testing an AI response',
        'ready':'Local setup finished','failed':'Local setup needs attention','interrupted':'Local setup was interrupted'}


def status():
    location=os.environ.get('STELLIS_LOCAL_SETUP_STATUS')
    if not location or not runtime_profile.local_inference():return None
    try:
        path=Path(location)
        if path.stat().st_size>20000:raise ValueError()
        value=json.loads(path.read_text())
        stage=value['stage'];state=value['state']
        if stage not in STAGES or state not in {'running','ready','failed'}:raise ValueError()
        if state=='running':
            try:os.kill(int(value['pid']),0)
            except (OSError,ValueError,KeyError):stage,state='interrupted','failed'
        message=STAGES[stage]
        if state=='failed':
            message={'prerequisites':'Local agent software is missing or unavailable',
                     'sandbox':'Local model and agent setup did not finish',
                     'inference':'The local model route needs attention',
                     'response':'The local agent did not respond successfully'}.get(stage,message)
        return {'state':state,'stage':stage,'message':message}
    except (OSError,ValueError,TypeError,KeyError):
        return {'state':'failed','stage':'failed','message':'Local setup status is unavailable'}
