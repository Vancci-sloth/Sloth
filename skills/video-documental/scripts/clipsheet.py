import sys,subprocess,glob,os,json
from PIL import Image,ImageDraw
fs=sys.argv[2:]; out=sys.argv[1]; rows=[]
for f in fs:
    d=float(subprocess.run(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',f],capture_output=True,text=True).stdout.strip() or 0)
    n=8; ts=[d*(k+0.5)/n for k in range(n)]; ims=[]
    for t in ts:
        r=subprocess.run(['ffmpeg','-nostdin','-v','error','-ss',str(t),'-i',f,'-vframes','1','-vf','scale=240:-2','-f','image2pipe','-vcodec','png','-'],capture_output=True)
        try:
            from io import BytesIO; ims.append((t,Image.open(BytesIO(r.stdout)).convert('RGB')))
        except Exception: ims.append((t,Image.new('RGB',(240,135))))
    rows.append((os.path.basename(f),d,ims))
H=135+16; S=Image.new('RGB',(240*8,len(rows)*(H+14)),(20,20,20)); dr=ImageDraw.Draw(S)
for i,(name,d,ims) in enumerate(rows):
    y=i*(H+14); dr.text((4,y),f'{name}  {d:.1f}s',fill=(255,220,0))
    for k,(t,im) in enumerate(ims):
        im=im.resize((240,135)); S.paste(im,(k*240,y+14)); dr.text((k*240+3,y+16),f'{t:.1f}',fill=(120,255,120))
S.save(out,quality=80); print(out,S.size)
