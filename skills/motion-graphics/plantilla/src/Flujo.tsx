import React from 'react';
import {AbsoluteFill, Audio, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';

type Momento = {segundo:number; titulo:string; detalle:string; estado:string; tarjetas?:string[]};
type Datos = {formato:'vertical'|'horizontal'; duracion:number; voz:string; marca?:string; clip?:string; clipInicio?:number; momentos:Momento[]};
const limitar = {extrapolateLeft:'clamp',extrapolateRight:'clamp'} as const;
const mover = (t:number, tiempos:number[], valores:number[]) => interpolate(t, tiempos, valores, limitar);

export function Flujo(d:Datos) {
  const frame=useCurrentFrame(), {fps,width}=useVideoConfig(), t=frame/fps, h=width>1080;
  const m=d.momentos, idea=m.find(x=>x.estado==='idea')!, guion=m.find(x=>x.estado==='guion')!, linea=m.find(x=>x.estado==='linea')!, final=m.find(x=>x.estado==='final')!;
  const a=guion.segundo, b=linea.segundo, c=final.segundo;
  const tarjetas=guion.tarjetas || ['Primera idea','La historia','El resultado'];
  const cabecera=t<a ? idea : t<b ? guion : t<c ? linea : final;
  const desplazamiento=mover(t,[a-.35,a+.55,b-.35,b+.65,c-.3,c+.4],[0,0,-35,-35,0,0]);
  const faseFinal=mover(t,[c,c+.5],[0,1]);
  const tx=h?130:120, ty=h?120:295;
  const panelX=h?950:105, panelY=h?155:760, panelW=h?840:870, panelH=h?750:890;
  const ui=t>=a;
  return <AbsoluteFill style={{background:'#0b1411',color:'#f4f9f1',fontFamily:'Arial, sans-serif',overflow:'hidden'}}>
    <AbsoluteFill style={{background:'radial-gradient(circle at 75% 28%, #315346 0%, transparent 46%), radial-gradient(circle at 15% 85%, #193d30 0%, transparent 50%)'}}/>
    <div style={{position:'absolute',left:tx,top:ty,width:h?710:840}}>
      <div style={{fontSize:28,letterSpacing:6,color:'#b9f383',fontWeight:700,marginBottom:28}}>{d.marca || 'PULSO VISUAL'}</div>
      <div style={{fontWeight:800,fontSize:h?92:102,lineHeight:1.04,letterSpacing:-4,transform:`translateY(${desplazamiento}px)`}}>{cabecera.titulo}</div>
      <div style={{fontSize:40,color:'#c0d4c7',marginTop:24,lineHeight:1.25}}>{cabecera.detalle}</div>
    </div>
    <div style={{position:'absolute',left:panelX,top:panelY,width:panelW,height:panelH,borderRadius:36,border:'2px solid #c2e8cb44',boxShadow:'0 42px 110px #0009',background:'linear-gradient(145deg,#304f40,#13251d)',overflow:'hidden',transform:`scale(${mover(t,[0,a,a+.8,b,b+.8,c,c+.8],[1,1,1.03,1.03,.96,.96,1])})`}}>
      <div style={{position:'absolute',top:35,left:44,right:44,display:'flex',justifyContent:'space-between',fontSize:27,color:'#d5eadb'}}><span>● &nbsp;{d.marca || 'Estudio'}</span><span>•••</span></div>
      <div style={{position:'absolute',left:44,top:100,fontSize:25,letterSpacing:3,color:'#b9f383',fontWeight:700}}>{t<a?'ESCRIBE TU IDEA':t<b?'GUION':t<c?'LÍNEA DE TIEMPO':'VISTA PREVIA'}</div>
      <div style={{position:'absolute',left:40,right:40,top:155,height:mover(t,[c,c+.6],[h?290:345,h?390:510]),borderRadius:24,background:'#09140fb8',border:'1px solid #def7dc29',overflow:'hidden',opacity:mover(t,[b,b+.6,c,c+.4],[0,1,1,1])}}>
        {d.clip && <Sequence from={Math.round((c+2)*fps)}><OffthreadVideo src={staticFile(d.clip)} startFrom={Math.round((d.clipInicio || 0)*fps)} muted style={{width:'100%',height:'100%',objectFit:'contain'}}/></Sequence>}
        {t<c+2 && <div style={{position:'absolute',inset:0,display:'grid',placeItems:'center',color:'#d8fbe0',fontSize:68}}>▶</div>}
      </div>
      {[0,1,2].map((j)=>{
        const valoresX=[65,65,65,65,65+j*(h?205:215),65+j*(h?205:215)];
        const valoresY=[205+j*100,205+j*100,200+j*110,200+j*110,(h?510:550),(h?600:690)];
        const tiempos=[0,a,a+.8,b,b+.8,c+.8];
        const x=mover(t,tiempos,valoresX), y=mover(t,tiempos,valoresY);
        const ancho=mover(t,[0,a,a+.8,b,b+.8],[panelW-130,panelW-130,panelW-130,panelW-130,h?180:190]);
        const alto=mover(t,[0,a,a+.8,b,b+.8],[76,76,86,86,105]);
        const aparicion=mover(t,[.3+j*.45,.8+j*.45],[0,1]);
        const progreso=mover(t,[1+j*.45,2.2+j*.45],[0,100]);
        return <div key={j} style={{position:'absolute',left:x,top:y,width:ancho,height:alto,borderRadius:16,boxSizing:'border-box',overflow:'hidden',background:ui?['#d2f99b','#a8dfb4','#7fbea0'][j]:'transparent',border:ui?'none':'1px solid #b5d6bd45',color:ui?'#11251b':'#effaf0',opacity:aparicion,boxShadow:ui?'0 12px 25px #0004':'none',display:'flex',alignItems:'center',padding:`0 ${mover(t,[b,b+.8],[22,7])}px`,fontSize:mover(t,[b,b+.8],[32,21]),fontWeight:700}}>
          <div style={{whiteSpace:'nowrap',overflow:'hidden',width:t<a?`${progreso}%`:'100%'}}>{tarjetas[j]}</div>
        </div>;
      })}
      <div style={{position:'absolute',bottom:38,left:50,right:50,display:'flex',justifyContent:'space-between',color:'#c2d6c9',fontSize:25}}><span>{t<c+2?'CREANDO':'REPRODUCIENDO'}</span><span style={{color:'#b9f383'}}>{t<c+2?'● ● ●':'▶'}</span></div>
      <div style={{position:'absolute',left:40,top:155,width:7,height:h?290:345,background:'#b9f383',opacity:t>=c+2?faseFinal:0,transform:`translateX(${mover(t,[c+2,c+5],[0,panelW-90])}px)`}}/>
    </div>
    {d.voz && <Audio src={staticFile(d.voz)}/>}
  </AbsoluteFill>;
}
