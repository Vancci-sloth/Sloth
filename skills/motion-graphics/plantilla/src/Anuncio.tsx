import React from 'react';
import {AbsoluteFill,Audio,Video,Sequence,staticFile,useCurrentFrame,useVideoConfig,interpolate,Easing} from 'remotion';

type Momento={segundo:number;titulo:string;detalle:string;estado:string;tarjetas?:string[]};
type Datos={formato:'vertical'|'horizontal';duracion:number;voz:string;marca?:string;clip?:string;clipInicio?:number;momentos:Momento[]};
const ease=Easing.bezier(.22,1,.36,1);
const tramo=(t:number,a:number,b:number)=>interpolate(t,[a,b],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp',easing:ease});
const mix=(a:number,b:number,p:number)=>a+(b-a)*p;
const C={bg:'#10121d',ink:'#f6f5ff',soft:'#a8a7c0',accent:'#c4b5ff',blue:'#899bff',pink:'#ffc3e0'};

export function Anuncio(d:Datos){
 const frame=useCurrentFrame(),{fps,width,height}=useVideoConfig(),t=frame/fps,h=width>height;
 const idea=d.momentos.find(m=>m.estado==='idea')!,guion=d.momentos.find(m=>m.estado==='guion')!,linea=d.momentos.find(m=>m.estado==='linea')!,final=d.momentos.find(m=>m.estado==='final')!;
 const a=guion.segundo,b=linea.segundo,c=final.segundo;
 const items=(guion.tarjetas||['Idea','Historia','Resultado']).slice(0,3);
 const sx=width/1080,sy=height/1920;
 const s=h?height/1080:Math.min(sx,sy), W=h?1920:1080,H=h?1080:1920;
 const x=h?750:125,y=h?260:810,pw=h?1020:830,ph=h?600:730;
 const p=tramo(t,a,a+.95),q=tramo(t,b,b+1.15),end=tramo(t,c,c+.8);
 const texto=t<a?idea:t<b?guion:t<c?linea:final;
 const entrada=tramo(t,texto.segundo,texto.segundo+.55);
 return <AbsoluteFill style={{background:C.bg,overflow:'hidden',fontFamily:'Arial, sans-serif',color:C.ink}}>
 <div style={{position:'absolute',width:W,height:H,left:(width-W*s)/2,top:(height-H*s)/2,transform:`scale(${s})`,transformOrigin:'top left',overflow:'hidden',background:`radial-gradient(ellipse at 78% 32%, #494268 0%, transparent 42%), radial-gradient(ellipse at 5% 88%, #253e67 0%, transparent 44%), ${C.bg}`}}>
  <div style={{position:'absolute',left:h?100:125,top:h?90:275,fontSize:26,fontWeight:700,letterSpacing:5,color:C.accent}}>{d.marca||'PULSO VISUAL'}</div>
  <div style={{position:'absolute',left:h?100:125,top:h?150:350,width:h?620:830,overflow:'hidden'}}>
   <div style={{fontWeight:800,fontSize:h?83:99,letterSpacing:-4,lineHeight:1.03,transform:`translateY(${(entrada-1)*35}px)`,opacity:entrada,whiteSpace:'pre-line'}}>{texto.titulo}</div>
   <div style={{fontSize:h?32:38,lineHeight:1.3,color:C.soft,marginTop:24,opacity:entrada}}>{texto.detalle}</div>
  </div>
  <div style={{position:'absolute',left:x,top:y,width:pw,height:ph,borderRadius:38,background:'linear-gradient(145deg,rgba(255,255,255,.14),rgba(255,255,255,.035))',border:'1px solid rgba(255,255,255,.24)',boxShadow:'0 40px 110px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.17)',overflow:'hidden',transform:`translateY(${mix(mix(0,-60,p),mix(-60,0,end),q)}px) scale(${mix(mix(.92,1.08,p),mix(1,1.02,end),q)*mix(.96,1,tramo(t,.1,.9))})`}}>
   <div style={{position:'absolute',left:42,right:42,top:38,display:'flex',justifyContent:'space-between',color:'#d7d4e9',fontSize:24,letterSpacing:1}}><b>{d.marca||'Estudio'}</b><span>● &nbsp; ● &nbsp; ●</span></div>
   <div style={{position:'absolute',left:45,top:100,fontSize:24,fontWeight:700,letterSpacing:3,color:C.accent}}>{t<a?'TU IDEA':t<b?'GUION':t<c?'MONTAJE':'VISTA PREVIA'}</div>
   <div style={{position:'absolute',left:45,top:155,width:pw-90,height:mix(0,h?220:270,q),borderRadius:22,overflow:'hidden',opacity:q,background:'linear-gradient(130deg,#b3a3ff,#6273b3)'}}>
    {d.clip&&<Sequence from={Math.round(c*fps)}><Video src={staticFile(d.clip)} startFrom={Math.round((d.clipInicio||0)*fps)} muted style={{width:'100%',height:'100%',objectFit:'contain',background:'#10121d'}}/></Sequence>}
    {t<c&&<div style={{height:'100%',display:'grid',placeItems:'center',fontSize:70,color:'#fff'}}>▶</div>}
   </div>
   {items.map((label,j)=>{
     const startX=65,startY=190+j*90;
     const stackY=190+j*100;
     const trackY=h?465:525, trackW=(pw-160)/3;
     const left=mix(startX,mix(65,55+j*(trackW+20),q),p);
     const top=mix(startY,mix(stackY,trackY,q),p);
     const w=mix(pw-130,mix(pw-130,trackW,q),p);
     const heightBlock=mix(65,mix(76,90,q),p);
     const typed=tramo(t,.5+j*.55,1.9+j*.55);
     return <div key={j} style={{position:'absolute',left,top,width:w,height:heightBlock,borderRadius:mix(9,16,p),background:`rgba(${j===0?'196,181,255':j===1?'150,171,255':'255,195,224'},${mix(.08,.94,p)})`,border:'1px solid rgba(255,255,255,.22)',display:'flex',alignItems:'center',boxSizing:'border-box',padding:'0 18px',color:p>.5?'#211d3d':C.ink,fontSize:mix(32,25,q),fontWeight:700,overflow:'hidden',boxShadow:p>.4?'0 14px 32px #0003':'none'}}><div style={{whiteSpace:'nowrap',overflow:'hidden',width:`${mix(typed,1,p)*100}%`}}>{label}</div></div>;
   })}
   <div style={{position:'absolute',left:45,bottom:35,right:45,display:'flex',justifyContent:'space-between',fontSize:24,color:C.soft}}><span>{t<c?'●  CREANDO':'▶  REPRODUCIENDO'}</span><span>{t<c?'•••':'LISTO'}</span></div>
  </div>
  <div style={{position:'absolute',left:h?110:120,top:h?820:1640,width:h?550:800,height:3,background:'#ffffff22'}}><div style={{width:`${Math.min(100,t/d.duracion*100)}%`,height:'100%',background:C.accent}}/></div>
 </div>
 {d.voz&&<Audio src={staticFile(d.voz)}/>}
 </AbsoluteFill>;
}
