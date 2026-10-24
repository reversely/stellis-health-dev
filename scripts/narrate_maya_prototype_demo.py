"""Local synthetic Maya narration from the authored scene script; no voice cloning."""
from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
import subprocess
import numpy as np
import sherpa_onnx
import soundfile as sf

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--model-dir',type=Path,required=True)
parser.add_argument('--output',type=Path,default=Path('docs/evidence/183'))
parser.add_argument('--clips',type=Path,default=Path('/tmp/stellis-maya-narration-clips'))
parser.add_argument('--prepare-only',action='store_true')
args=parser.parse_args();args.clips.mkdir(parents=True,exist_ok=True)
folder=args.model_dir
engine=sherpa_onnx.OfflineTts(sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(kitten=sherpa_onnx.OfflineTtsKittenModelConfig(model=str(folder/'model.fp16.onnx'),voices=str(folder/'voices.bin'),tokens=str(folder/'tokens.txt'),data_dir=str(folder/'espeak-ng-data')),num_threads=2)))
scenes=json.loads(Path('scripts/maya-demo-scenes.json').read_text());manifest=[]
for scene in scenes:
 path=args.clips/(scene['id']+'.wav')
 text=scene['caption'].replace('2024–25','twenty twenty-four to twenty twenty-five').replace('2022','twenty twenty-two').replace('2026','twenty twenty-six').replace('IVF','I V F')
 text_path=path.with_suffix('.txt')
 if not path.exists() or not text_path.exists() or text_path.read_text()!=text:
  result=engine.generate(text,sid=1,speed=1.0);rate=int(result.sample_rate);samples=np.asarray(result.samples,dtype=np.float32)
  # Keep each complete sentence inside its authored scene; never cut off a word.
  allowed=scene['seconds']-1.2
  if len(samples)/rate>allowed:
   result=engine.generate(text,sid=1,speed=len(samples)/rate/allowed*1.02);rate=int(result.sample_rate);samples=np.asarray(result.samples,dtype=np.float32)
  sf.write(path,samples,rate);text_path.write_text(text)
 duration=sf.info(path).duration;assert duration<scene['seconds']-.5,(scene['id'],duration)
 manifest.append({'scene':scene['id'],'seconds':duration,'text':text});print('VOICE',scene['id'],round(duration,2),flush=True)
if args.prepare_only:raise SystemExit(0)
recording=json.loads((args.output/'recording.json').read_text())
script={s['id']:s for s in scenes}
for scene in recording['timings']:scene['caption']=script[scene['id']]['caption']
timings={s['id']:s for s in recording['timings']}
def stamp(value):
 milliseconds=round(value*1000);return f'{milliseconds//3600000:02}:{milliseconds//60000%60:02}:{milliseconds//1000%60:02}.{milliseconds%1000:03}'
vtt='WEBVTT\n\n'+'\n'.join(f"{i+1}\n{stamp(s['start'])} --> {stamp(s['end'])}\n{s['caption']}\n" for i,s in enumerate(recording['timings']))
(args.output/'maya-prototype-demo.vtt').write_text(vtt)
(args.output/'transcript.md').write_text('# Maya grows with Stellis\n\n'+'\n'.join(f"{stamp(s['start'])} — **{s['id']}**\n\n{s['caption']}\n" for s in recording['timings']))
rate=24000;track=np.zeros(round((recording['duration']+.3)*rate),dtype=np.float32)
for scene in manifest:
 samples,sr=sf.read(args.clips/(scene['scene']+'.wav'),dtype='float32');assert sr==rate
 start=round((timings[scene['scene']]['start']+.5)*rate);stop=start+len(samples);assert stop<=round(timings[scene['scene']]['end']*rate)
 track[start:stop]+=samples
wave=args.clips/'narration.wav';sf.write(wave,track,rate)
subprocess.run(['ffmpeg','-y','-v','error','-i',str(wave),'-c:a','libmp3lame','-b:a','64k',str(args.output/'maya-prototype-narration.mp3')],check=True)
video=args.output/'maya-prototype-demo.mp4';temporary=args.output/'maya-prototype-demo-narrated.mp4'
subprocess.run(['ffmpeg','-y','-v','error','-ss',str(recording['trimmedLoadingSeconds']),'-i',recording['source'],'-i',str(wave),'-map','0:v:0','-map','1:a:0','-vf',f"pad=iw:ih+144:0:0:color=0x302638,subtitles={args.output}/maya-prototype-demo.vtt:force_style='FontName=DejaVu Sans,FontSize=9,PrimaryColour=&H00FFFFFF,OutlineColour=&H00382630,BorderStyle=3,Outline=5,Shadow=0,MarginV=6'",'-c:v','libx264','-preset','fast','-crf','21','-pix_fmt','yuv420p','-c:a','aac','-b:a','96k','-shortest','-movflags','+faststart',str(temporary)],check=True)
os.replace(temporary,video)
recording['caption_layout']='Dedicated 144px purple footer; full 1920x1080 application frame is preserved above it'
recording['audio']='Local synthetic narration of the authored script, Kitten TTS sid 1; no cloned person, live recognition or cloud service'
recording['narration_model_license']='Apache-2.0 (installed Kitten model LICENSE)'
recording['narration']=manifest
(args.output/'recording.json').write_text(json.dumps(recording,indent=2)+'\n')
print('NARRATED',video,flush=True)
