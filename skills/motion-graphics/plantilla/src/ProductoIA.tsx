import React from 'react';
import {AbsoluteFill,Audio,Easing,interpolate,Sequence,staticFile,useCurrentFrame,useVideoConfig,Video} from 'remotion';

export type MomentoIA = {segundo:number; palabra:string; estado:'titular'|'consulta'|'respuesta'|'opciones'|'cierre'; titulo:string; detalle:string; tarjetas?:string[]};
export type DatosIA = {formato:'vertical'|'horizontal'; duracion:number; voz:string; marca?:string; clip?:string; clipInicio?:number; momentos:MomentoIA[]};
const curva=Easing.bezier(.22,1,.36,1);
const progreso=(n:number,a:number,b:number)=>interpolate(n,[a,b],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp',easing:curva});

function Escena({m,d,indice}: {m:MomentoIA;d:DatosIA;indice:number}) {
 const f=useCurrentFrame(),{fps,width,height}=useVideoConfig(),t=f/fps,h=width>height;
 const e=.25+.75*progreso(t,0,.55), zoom=1+(1-e)*.09;
 const acento='#6d61ec', texto='#161929', tenue='#5e6274';
 const caja:React.CSSProperties={background:'#fff',border:'1px solid #dedfeb',boxShadow:'0 30px 90px #292d5818',borderRadius:32,boxSizing:'border-box'};
 const titulo:React.CSSProperties={fontWeight:750,fontSize:h?84:93,letterSpacing:-3,lineHeight:1.06,whiteSpace:'pre-line'};
 const W=h?1920:1080,H=h?1080:1920, escala=h?height/1080:height/1920;
 const panelW=h?900:840, panelX=h?900:120, panelY=h?260:800;
 return <div style={{position:'absolute',left:(width-W*escala)/2,top:(height-H*escala)/2,width:W,height:H,transform:`scale(${escala})`,transformOrigin:'top left',overflow:'hidden',fontFamily:'Arial, sans-serif',color:texto,background:'radial-gradient(ellipse at 75% 85%, #e0def9 0%, transparent 43%), #f7f7fa'}}>
  <div style={{position:'absolute',left:h?110:120,top:h?95:285,fontWeight:700,fontSize:25,letterSpacing:4,color:acento}}>{d.marca||'PULSO VISUAL'}</div>
  {(m.estado==='titular'||m.estado==='cierre') ? <div style={{position:'absolute',left:h?160:125,top:h?360:620,width:h?1450:820,overflow:'hidden'}}><div style={{...titulo,fontSize:h?108:116,transform:`translateY(${(1-e)*95}px)`,opacity:e}}>{m.titulo}</div><div style={{fontSize:38,color:tenue,marginTop:35,opacity:progreso(t,.35,.9)}}>{m.detalle}</div></div> : <>
   <div style={{position:'absolute',left:h?110:120,top:h?195:380,width:h?700:835,transform:`translateY(${(1-e)*30}px)`,opacity:e}}><div style={titulo}>{m.titulo}</div><div style={{fontSize:36,lineHeight:1.3,color:tenue,marginTop:24}}>{m.detalle}</div></div>
   <div style={{...caja,position:'absolute',left:panelX,top:panelY,width:panelW,height:h?590:690,overflow:'hidden',transform:`translateY(${(1-e)*65}px) scale(${zoom})`,opacity:e}}>
    <div style={{position:'absolute',top:42,left:48,right:48,display:'flex',justifyContent:'space-between',fontSize:26,color:tenue}}><b style={{color:texto}}>{d.marca||'Tu producto'}</b><span>•••</span></div>
    {m.estado==='consulta' && <><div style={{position:'absolute',left:45,right:45,top:175,fontSize:26,letterSpacing:2,color:tenue}}>TU IDEA</div><div style={{position:'absolute',left:45,right:45,top:230,border:'2px solid #c8c5f4',borderRadius:23,padding:'28px 30px',fontSize:42,color:texto,overflow:'hidden',whiteSpace:'nowrap',boxShadow:'0 8px 35px #8277e42b'}}><div style={{width:`${progreso(t,.3,2.2)*100}%`,overflow:'hidden'}}>{m.detalle}</div></div><div style={{position:'absolute',right:65,bottom:65,borderRadius:50,background:acento,color:'#fff',padding:'18px 28px',fontWeight:700,fontSize:28}}>Crear →</div></>}
    {m.estado==='respuesta' && <><div style={{position:'absolute',left:48,top:145,color:acento,fontWeight:700,fontSize:27}}>RESULTADO</div>{(m.tarjetas||[]).map((s,j)=><div key={j} style={{position:'absolute',left:48,right:48,top:205+j*105,background:'#f2f1ff',borderRadius:20,padding:'20px 24px',fontSize:34,fontWeight:650,opacity:progreso(t,.15+j*.23,.65+j*.23),transform:`translateY(${(1-progreso(t,.15+j*.23,.65+j*.23))*35}px)`}}>{s}</div>)}</>}
    {m.estado==='opciones' && <div style={{position:'absolute',inset:'135px 45px 65px',display:'flex',gap:16,alignItems:'center'}}>{(m.tarjetas||[]).map((s,j)=><div key={j} style={{flex:1,height:'70%',borderRadius:22,padding:20,boxSizing:'border-box',background:['#edeaff','#e4f2ff','#fbeaf2'][j%3],display:'flex',alignItems:'flex-end',fontSize:30,fontWeight:700,opacity:progreso(t,.15+j*.2,.65+j*.2),transform:`translateY(${(1-progreso(t,.15+j*.2,.65+j*.2))*65}px)`}}>{s}</div>)}</div>}
    {d.clip&&m.estado==='respuesta'&&<Sequence from={Math.round(.8*fps)}><Video src={staticFile(d.clip)} startFrom={Math.round((d.clipInicio||0)*fps)} muted style={{position:'absolute',bottom:30,right:40,width:panelW*.27,height:150,borderRadius:18,objectFit:'cover'}}/></Sequence>}
   </div>
  </>}
  <div style={{position:'absolute',bottom:h?55:250,left:h?110:120,fontSize:24,color:tenue}}>{String(indice+1).padStart(2,'0')}</div>
 </div>;
}

export function ProductoIA(d:DatosIA){
 const {fps}=useVideoConfig();
 return <AbsoluteFill style={{background:'#f7f7fa'}}>{d.momentos.map((m,i)=>{const from=Math.round(m.segundo*fps),next=i+1<d.momentos.length?Math.round(d.momentos[i+1].segundo*fps):Math.ceil(d.duracion*fps);return <Sequence key={i} from={from} durationInFrames={Math.max(1,next-from)}><Escena m={m} d={d} indice={i}/></Sequence>})}{d.voz&&<Audio src={staticFile(d.voz)}/>}</AbsoluteFill>;
}
