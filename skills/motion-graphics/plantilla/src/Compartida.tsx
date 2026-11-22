import React from 'react';
import {AbsoluteFill, Audio, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Datos} from './index';

const verde = '#aef65c';
const tintas = ['#ff8766', '#83b8ff', '#d7a0fb'];
const limitar = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const entre = (a: number, b: number, p: number) => a + (b-a)*p;
const suave = (p: number) => p*p*(3-2*p);

/** Una sola escena con objetos persistentes: invitación, participantes, canciones y onda. */
export function Compartida({momentos, duracion, marca, voz}: Datos) {
  const {fps, width, height} = useVideoConfig();
  const tiempo = useCurrentFrame()/fps;
  const horizontal = width > height;
  const indice = Math.max(0, momentos.findIndex((m, i) => tiempo >= m.segundo && (i === momentos.length-1 || tiempo < momentos[i+1].segundo)));
  const actual = momentos[indice];
  const siguiente = momentos[indice+1]?.segundo ?? duracion;
  const local = Math.max(0, tiempo-actual.segundo);
  const tramo = Math.max(.05, siguiente-actual.segundo);
  const p = Math.min(1, local/tramo);
  const fase = actual.estado;
  const participantes = momentos.find((m) => m.estado === 'participantes')?.tarjetas ?? [];
  const canciones = momentos.find((m) => m.estado === 'cola')?.tarjetas ?? [];
  const cantidad = Math.max(participantes.length, canciones.length);
  const cx = horizontal ? 600 : 0;
  const cy = horizontal ? 48 : 745;
  const zoom = fase === 'invitacion' ? entre(1.28, .95, suave(p)) : entre(.95, 1.07, suave(p));

  return <AbsoluteFill style={{background: '#101411', color: '#f5f7f2', fontFamily: 'Arial, sans-serif', overflow: 'hidden'}}>
    <AbsoluteFill style={{background: `radial-gradient(ellipse at ${50+22*Math.sin(tiempo*.42)}% ${60+16*Math.cos(tiempo*.4)}%, #34573a 0%, #151e17 42%, #0a0d0b 83%)`}}/>
    <div style={{position: 'absolute', top: horizontal ? 190 : 220, left: horizontal ? 110 : 100, width: horizontal ? 660 : 880}}>
      <div style={{fontSize: 28, textTransform: 'uppercase', letterSpacing: 5, fontWeight: 800, color: verde}}>{marca}</div>
      <div style={{marginTop: 25, fontSize: horizontal ? 88 : 103, lineHeight: .98, fontWeight: 900, letterSpacing: -5, transform: `translateY(${24*(1-suave(Math.min(1, local/.45)))}px)`}}>{actual.titulo}</div>
      <div style={{marginTop: 22, fontSize: 36, color: '#c9d3c8'}}>{actual.detalle}</div>
    </div>
    <div style={{position: 'absolute', left: cx, top: cy, width: 1080, height: 900, transform: `scale(${zoom})`}}>
      {fase === 'invitacion' && <>
        {[0, 1, 2].map((i) => {
          const onda = Math.max(0, Math.min(1, (local-.18-i*.15)/Math.max(.35,tramo-.35)));
          return <div key={i} style={{position: 'absolute', left: 540, top: 405, width: 500, height: 150, border: `3px solid ${verde}`, borderRadius: 150, opacity: (1-onda)*.6, transform: `translate(-50%,-50%) scale(${1+onda*2.6})`}}/>;
        })}
        <div style={{position: 'absolute', left: 540, top: 405, transform: `translate(-50%,-50%) scale(${1-.11*Math.sin(Math.PI*Math.min(1, local/.42))})`, background: verde, color: '#111914', borderRadius: 100, padding: '28px 58px', fontWeight: 900, fontSize: 56, whiteSpace: 'nowrap', boxShadow: '0 0 76px #aef65c55'}}>{actual.tarjetas?.[0] ?? 'Invitar'}</div>
      </>}
      {fase !== 'invitacion' && Array.from({length: cantidad}, (_, i) => {
        const orbitaX = 540 + (i-(cantidad-1)/2)*212;
        const orbitaY = 370 + Math.sin(tiempo*2+i)*19 + (i%2)*68;
        const filaY = 260+i*146;
        const llegada = suave(Math.max(0, Math.min(1, (local-i*.22)/.85)));
        const insertar = suave(Math.max(0, Math.min(1, (local-i*tramo*.19)/.9)));
        const giro = interpolate(p, [.5,.82], [0,1], limitar);
        const turno = cantidad > 1 ? (i+1)%cantidad : i;
        const colaY = entre(filaY, 260+turno*146, suave(giro));
        const cerrar = suave(Math.min(1,local/.85));
        const esCola = fase === 'cola', esOnda = fase === 'onda';
        const x = esOnda ? entre(540, 540+(i-(cantidad-1)/2)*126, cerrar) : esCola ? entre(orbitaX,540,insertar) : entre(540,orbitaX,llegada);
        const y = esOnda ? entre(260+turno*146,390,cerrar) : esCola ? entre(orbitaY,colaY,insertar) : entre(405,orbitaY,llegada);
        const ancho = esOnda ? entre(680,22,cerrar) : esCola ? entre(132,680,insertar) : entre(55,132,llegada);
        const alto = esOnda ? entre(112,115+115*Math.abs(Math.sin(tiempo*5+i)),cerrar) : esCola ? entre(132,112,insertar) : ancho;
        const tinta = tintas[i%tintas.length];
        return <div key={i} style={{position: 'absolute', left:x, top:y, width:ancho, height:alto, transform:'translate(-50%,-50%)', borderRadius: esOnda ? 24 : esCola ? entre(66,28,insertar) : '50%', background: esOnda ? verde : esCola ? '#263b2c' : tinta, border: `2px solid ${tinta}`, boxShadow:'0 18px 55px #0007', overflow:'hidden', display:'flex', alignItems:'center', justifyContent:esCola ? 'flex-start' : 'center', gap:24}}>
          {!esOnda && <div style={{flex:'none', marginLeft:esCola ? 14 : 0, width: esCola ? 80 : 110, height:esCola ? 80 : 110, display:'grid', placeItems:'center', borderRadius:esCola ? 18 : '50%', background:`repeating-radial-gradient(circle at 70% 30%, ${tinta}, ${tinta} 8px, #28372d 10px, ${tinta} 16px)`, color:'#101411', fontSize:46, fontWeight:900}}>{!esCola && (participantes[i]?.[0] ?? '♪')}</div>}
          {esCola && <span style={{color:'#fff', fontSize:35, fontWeight:800, opacity:insertar, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', paddingRight:16}}>{canciones[i]}</span>}
        </div>;
      })}
      {fase === 'onda' && Array.from({length: 15}, (_, i) => {
        const alto = (30+180*Math.abs(Math.sin(tiempo*5-i*.65)))*(1-Math.abs(i-7)/10);
        return <div key={i} style={{position:'absolute', left:540+(i-7)*38, top:390, width:13, height:alto, transform:'translate(-50%,-50%)', background:verde, borderRadius:10, opacity:suave(Math.min(1,local/.95))}}/>;
      })}
    </div>
    {voz && <Audio src={staticFile(voz)}/>}
  </AbsoluteFill>;
}
