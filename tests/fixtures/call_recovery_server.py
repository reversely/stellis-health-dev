"""Loopback-only disposable server for synthetic call recovery browser checks."""
import os,time
import tempfile
os.environ.setdefault('STELLIS_DATA_DIR', tempfile.mkdtemp(prefix='stellis-call-recovery-'))
os.environ['STELLIS_RUNTIME_PROFILE']='direct'
os.environ['STELLIS_ACCOUNT_ID']='2'
os.environ['STELLIS_SHARED_PROVIDER_KEYS']='1'
from stellis import auth,intake,intake_voice,processing,server,onboarding
import numpy as np
from types import SimpleNamespace
import uvicorn
if not auth.has_account():
    auth.register('recovery-owner','isolated-recovery-owner-password')
    auth.register('recovery-review','isolated-recovery-review-password')
auth.complete_onboarding(2)
onboarding.reopen(2);onboarding.choose(2,[],'call')
os.environ['STELLIS_AUTH_MODE']='required'
class Detector:
    def __init__(self):self.samples=[];self.start=0;self.position=0;self.segments=[]
    def accept_waveform(self,window):
        if np.max(np.abs(window))>.0001:
            if not self.samples:self.start=self.position
            self.samples.extend(window)
        self.position+=len(window)
    def is_speech_detected(self):return bool(self.samples)
    def empty(self):return not self.segments
    @property
    def front(self):return self.segments[0]
    def pop(self):self.segments.pop(0)
    def flush(self):
        if self.samples:self.segments.append(SimpleNamespace(start=self.start,samples=np.array(self.samples)));self.samples=[]
    def reset(self):self.samples=[];self.position=0;self.segments=[]
class Engine:
    def vad(self):return Detector()
    def transcribe(self,samples):
        level=float(np.max(np.abs(samples)))
        if level>.05:time.sleep(.2);raise RuntimeError('Synthetic recognition failure')
        return 'Manage my appointments' if level>.02 else ''
    def speak(self,text):return np.zeros(640,dtype='<i2').tobytes(),16000
async def reply(timings=None):yield 'Which appointments would you like to organize?'
async def notes():return intake.load()
intake.reply=reply;intake.update_notes=notes
intake_voice.acquire=lambda:Engine();intake_voice.release=lambda:None
processing.start_worker=lambda:None;processing.index_missing_voices=lambda:None
uvicorn.run(server.app,host='127.0.0.1',port=8784,access_log=False)
