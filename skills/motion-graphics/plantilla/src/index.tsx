import React from 'react';
import {AbsoluteFill, Audio, Composition, interpolate, registerRoot, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Flujo} from './Flujo';
import {Anuncio} from './Anuncio';
import {ProductoIA, type DatosIA} from './ProductoIA';
import {Compartida} from './Compartida';

type Momento = { segundo: number; palabra: string; titulo: string; detalle: string; estado: 'idea' | 'guion' | 'linea' | 'final' | 'invitacion' | 'participantes' | 'cola' | 'onda'; tarjetas?: string[] };
export type Datos = { formato: 'vertical' | 'horizontal'; duracion: number; voz: string; marca?: string; clip?: string; clipInicio?: number; estilo?: 'flujo' | 'anuncio' | 'producto-ia'; momentos: Momento[] };
const ejemplo: Datos = {formato:'vertical', duracion:24, voz:'voz.mp3', momentos:[{segundo:0,palabra:'idea',titulo:'Una idea',detalle:'se convierte en video',estado:'idea'}]};
const clamp = {extrapolateLeft:'clamp', extrapolateRight:'clamp'} as const;
function Video(d: Datos) {
  const f=useCurrentFrame(), {fps,width,height}=useVideoConfig(), t=f/fps, horizontal=width>height;
  const i=Math.max(0,d.momentos.findIndex((m,j)=>t>=m.segundo && (j===d.momentos.length-1 || t<d.momentos[j+1].segundo)));
  const m=d.momentos[i], local=t-m.segundo, entrada=interpolate(local+(i===0?.4:0),[0,.4],[0,1],clamp);
  const panelWidth=horizontal?850:820, panelHeight=horizontal?690:800;
  const accent='#b4f26f', dark='#111914', muted='#a9bbb0';
  const words=m.detalle.split(' '), n=Math.min(words.length,Math.floor(local*3)+1);
  return <AbsoluteFill style={{background:'radial-gradient(circle at 75% 32%, #294337 0%, #101812 48%, #080d09 100%)',color:'#f4f7ef',fontFamily:'Arial, sans-serif',overflow:'hidden'}}>
    <div style={{position:'absolute',inset:0,opacity:.13,backgroundImage:'radial-gradient(#a4d7b0 1px, transparent 1px)',backgroundSize:'34px 34px'}}/>
    <div style={{position:'absolute',left:horizontal?120:120,top:horizontal?170:340,width:horizontal?720:800,transform:`translateY(${(1-entrada)*28}px)`,opacity:entrada}}>
      <div style={{fontSize:30,letterSpacing:5,fontWeight:700,color:accent,marginBottom:26}}>PULSO VISUAL</div>
      <div style={{fontSize:horizontal?94:100,lineHeight:1.03,fontWeight:800,letterSpacing:-4}}>{m.titulo}</div>
      <div style={{fontSize:horizontal?43:44,lineHeight:1.25,color:muted,marginTop:24}}>{m.detalle}</div>
    </div>
    <div style={{position:'absolute',left:horizontal?960:120,top:horizontal?190:860,width:panelWidth,height:panelHeight,borderRadius:36,background:'linear-gradient(145deg,rgba(55,80,64,.92),rgba(21,34,26,.96))',border:'2px solid rgba(202,255,206,.21)',boxShadow:'0 35px 90px #0009',padding:50,boxSizing:'border-box'}}>
      <div style={{display:'flex',gap:12,alignItems:'center',fontSize:27,color:muted,marginBottom:50}}><span style={{width:14,height:14,borderRadius:20,background:accent}}/> {d.marca || 'Estudio'} <span style={{marginLeft:'auto'}}>● ● ●</span></div>
      <SesionCompartida momento={m} local={local} />
      {m.estado==='idea' && <><div style={{fontSize:30,color:muted,marginBottom:32}}>TU IDEA</div><div style={{fontSize:horizontal?51:55,lineHeight:1.2,fontWeight:700}}>{words.slice(0,n).join(' ')}<span style={{color:accent}}>▍</span></div><div style={{position:'absolute',bottom:50,right:50,borderRadius:30,background:accent,color:dark,padding:'18px 30px',fontSize:28,fontWeight:700}}>Crear →</div></>}
      {m.estado==='guion' && <><div style={{fontSize:30,color:muted,marginBottom:30}}>GUION</div>{(m.tarjetas || []).map((s,j)=><div key={s} style={{marginTop:20,padding:'24px 26px',borderRadius:18,background:'#d5f8d514',border:'1px solid #d5f8d52b',fontSize:horizontal?34:38,fontWeight:700,opacity:interpolate(local,[0,.3],[.4,1],clamp),transformOrigin:'left center',transform:`translateY(${interpolate(local,[0,.65],[-j*95,0],clamp)}px) scaleX(${interpolate(local,[0,.65],[.65,1],clamp)})`}}>{s}</div>)}</>}
      {m.estado==='linea' && <><div style={{fontSize:30,color:muted,marginBottom:38}}>LÍNEA DE TIEMPO</div><div style={{height:horizontal?230:270,borderRadius:20,background:'linear-gradient(135deg,#b4f26f,#367b60)',display:'grid',placeItems:'center',color:dark,fontSize:80,fontWeight:800,opacity:interpolate(local,[.15,.7],[0,1],clamp)}}>▶</div><div style={{display:'flex',gap:12,marginTop:40}}>{[1,2,3].map((v,j)=><div key={v} style={{height:82,flex:j===1?1.4:1,borderRadius:12,background:j===1?'#b4f26f':'#72ad85',transform:`translate(${interpolate(local,[0,.7],[-j*180,0],clamp)}px, ${interpolate(local,[0,.7],[-250+j*95,0],clamp)}px)`}}/>)}</div></>}
      {m.estado==='final' && <><div style={{height:'80%',borderRadius:22,background:'linear-gradient(145deg,#a4ee88,#1c6b55)',display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',color:dark,textAlign:'center',padding:20}}><div style={{fontWeight:800,fontSize:horizontal?60:68}}>{m.titulo}</div><div style={{marginTop:25,fontSize:60}}>▶</div></div><div style={{fontSize:29,color:muted,marginTop:25}}>VIDEO LISTO</div></>}
    </div>
    {d.voz && <Audio src={staticFile(d.voz)}/>}
  </AbsoluteFill>;
}
function SesionCompartida({momento, local}: {momento: Momento; local: number}) {
  const {estado, tarjetas = []} = momento;
  const verde = '#b4f26f';
  if (estado === 'invitacion') {
    const pulso = interpolate(local, [.2, 1.25], [0, 1], clamp);
    return <div style={{height: 390, display: 'grid', placeItems: 'center', position: 'relative'}}>
      <div style={{position: 'absolute', width: 250, height: 250, borderRadius: '50%', border: `3px solid ${verde}`, opacity: 1-pulso, transform: `scale(${.5+pulso*1.5})`}} />
      <div style={{position: 'relative', background: verde, color: '#111914', padding: '24px 42px', borderRadius: 50, fontSize: 42, fontWeight: 800}}>{tarjetas[0] || 'Invitar'}</div>
    </div>;
  }
  if (estado === 'participantes' || estado === 'cola') {
    return <div style={{display: 'grid', gap: 16}}>
      {tarjetas.map((texto, j) => {
        const entrada = interpolate(local, [j*.3, j*.3+.45], [0, 1], clamp);
        return <div key={j} style={{display: 'flex', alignItems: 'center', gap: 20, padding: '12px 20px', borderRadius: 20, background: '#111914', opacity: entrada, transform: `translateX(${(1-entrada)*(j%2 ? 90 : -90)}px)`}}>
          <span style={{flex: '0 0 54px', height: 54, display: 'grid', placeItems: 'center', borderRadius: estado === 'cola' ? 12 : '50%', background: verde, color: '#111914', fontSize: 26, fontWeight: 800}}>{estado === 'cola' ? j+1 : texto.slice(0, 1).toUpperCase()}</span>
          <span style={{fontSize: 32, fontWeight: 700, overflowWrap: 'anywhere'}}>{texto}</span>
        </div>;
      })}
    </div>;
  }
  if (estado === 'onda') {
    const transicion = interpolate(local, [0, .8], [0, 1], clamp);
    return <div style={{height: 390, display: 'grid', placeItems: 'center', position: 'relative'}}>
      {Array.from({length: 19}, (_, j) => {
        const x = interpolate(transicion, [0, 1], [0, (j-9)*30]);
        const y = interpolate(transicion, [0, 1], [(j%3-1)*96, 0]);
        const alto = 35 + 160 * Math.abs(Math.sin(j*.6+local*6));
        return <div key={j} style={{position: 'absolute', width: interpolate(transicion, [0, 1], [400, 14]), height: interpolate(transicion, [0, 1], [64, alto]), borderRadius: 12, background: verde, transform: `translate(${x}px, ${y}px)`}} />;
      })}
    </div>;
  }
  return null;
}
const Elegir=(d:Datos)=>d.estilo==='producto-ia'?<ProductoIA {...(d as unknown as DatosIA)}/>:d.estilo==='anuncio'?<Anuncio {...d}/>:d.estilo==='flujo'?<Flujo {...d}/>:d.momentos.every((m)=>['invitacion','participantes','cola','onda'].includes(m.estado))?<Compartida {...d}/>:<Video {...d}/>;
const Root=()=> <Composition id="Pulso" component={Elegir} width={1080} height={1920} fps={30} durationInFrames={720} defaultProps={ejemplo} calculateMetadata={({props})=>({width:props.formato==='horizontal'?1920:1080,height:props.formato==='horizontal'?1080:1920,durationInFrames:Math.ceil(props.duracion*30)})}/>;
registerRoot(Root);
