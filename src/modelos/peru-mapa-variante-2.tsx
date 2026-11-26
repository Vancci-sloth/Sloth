/** Mapa del Perú con textura satelital y zona de cambio marcada. Mide 1,5 m de alto, centrado en el origen. La zona pintada indica dónde aplicar el cambio de textura. */
import React, {useMemo} from 'react';
import {Shape, ExtrudeGeometry, MeshPhysicalMaterial, Color} from 'three';
import {useCurrentFrame} from 'remotion';

// Coordenadas de la zona marcada en el visor 3D (normalizadas)
const zonaMarcada: [number, number][] = [
  [21.4,23.4],[22.7,23],[24.5,22.3],[25.8,21.8],[27,21.3],[28.3,20.6],
  [29.3,19.9],[30.4,19],[31.5,18.2],[32.6,17.3],[33.6,16.4],[34.9,15.4],
  [36.1,14.5],[37.2,13.8],[38.3,13.1],[39.3,12.6],[40.2,12.1],[41.5,11.2],
  [42.7,10.7],[44,10],[45,9.8],[46.3,9.7],[47.7,9.5],[49,9.5],[50,9.5],
  [51.2,9.5],[52.5,9.5],[54,9.5],[55.3,9.7],[56.7,10.2],[58.2,10.7],
  [59.5,11.2],[61,11.9],[62.5,13],[63.6,13.8],[65,14.7],[66.4,15.9],
  [67.7,17.1],[68.9,18],[70.1,18.9],[71,19.6],[72.1,20.8],[73,21.8],
  [73.8,22.7],[74.6,23.7],[75.4,24.6],[76.1,25.5],[76.8,26.5],[77.7,27.7],
  [78.6,29.1],[79.3,30.3],[79.9,31.5],[80.4,32.8],[80.8,33.8],[81.2,35],
  [81.5,36.6],[81.7,38],[81.8,39.4],[82,40.8],[82.1,42.1],[82.3,43.9],
  [82.4,45.6],[82.4,47.5],[82.6,49.4],[82.6,51],[82.7,52.9],[82.8,54.5],
  [83.1,56.2],[83.1,57.8],[83.3,59.5],[83.3,61.1],[83.3,62.6],[83.4,64.4],
  [83.6,65.9],[83.7,67.3],[83.9,68.7],[84,70.5],[84.2,71.9],[84.3,73.2],
  [84.5,74.6],[84.6,75.8],[84.8,77.1],[84.9,78.3],[85,79.5],[85.2,80.5],
  [85.2,82.1],[85.2,83.5],[85.2,84.7],[85.2,85.9],[84.9,87.1],[84.5,88.2],
  [83.7,88.9],[83,89.9],[82.1,90.8],[80.9,91.5],[79.5,92.2],[78.6,92.7],
  [76.7,93.4],[74.9,93.9],[73,94.3],[71.8,94.4],[70.7,94.6],[69.2,94.6],
  [67.7,94.6],[66.4,94.6],[64.8,94.6],[63.2,94.6],[61.7,94.6],[60.3,94.4],
  [58.9,94.3],[57.6,94.1],[56.5,93.6],[55.3,93.4],[54.3,93.1],[53.2,92.7],
  [52.2,92.4],[51.2,92],[49.4,91.3],[47.9,90.6],[46.3,89.6],[44.7,88.4],
  [43.7,87.7],[42.7,87],[41.5,86.3],[40.2,85.4],[39,84.5],[37.7,83.8],
  [36.5,83.1],[35,82.3],[33.7,81.6],[32.7,81.1],[31.7,80.5],[30.8,80],
  [29.9,79.5],[28.6,78.1],[27.3,76.9],[26.1,75.3],[24.9,73.9],[24,72.5],
  [23.2,71],[22.6,69.4],[22,67.5],[21.8,66.5],[21.7,65.3],[21.4,63.3],
  [21.3,62.3],[21.1,60.7],[21.1,59.7],[21,58.3],[21,57.3],[20.8,55.5],
  [20.5,53.4],[20.4,52.2],[20.2,51],[19.9,49.8],[19.6,47.9],[19.4,46.7],
  [19.2,45.4],[18.9,44.4],[18.8,43.4],[18.6,42.3],[18.5,41.3],[18.2,40.1],
  [17.7,39.2],[17.3,38.1],[17,37.1],[16.7,36.1],[16.7,35],[16.6,34],
  [16.3,32.9],[16.1,31.9],[16.1,30.5],[17,29.5],[17.6,28.6],[17.9,27.5],
  [18.3,26.5],[18.9,25.6],[19.5,24.8],[20.1,23.9]
];

export const PeruMapaVariante2: React.FC<{gira?: number; gris?: boolean}> = ({gira = 0, gris = false}) => {
  const frame = useCurrentFrame();
  
  // Geometría base del mapa extruido del Perú
  const geometryBase = useMemo(() => {
    const p = [[-0.0827,0.7519],[-0.0135,0.7404],[0.0250,0.7019],[0.0788,0.6865],[0.1058,0.6404],[0.1481,0.5981],[0.2135,0.5750],[0.2673,0.5904],[0.3327,0.5712],[0.3942,0.5404],[0.3788,0.4673],[0.4212,0.4404],[0.4096,0.3904],[0.3404,0.3865],[0.2596,0.3635],[0.1942,0.3058],[0.1596,0.2404],[0.1327,0.1558],[0.1481,0.0981],[0.1942,0.0519],[0.1788,0.0096],[0.2250,-0.0058],[0.2712,-0.0519],[0.3327,-0.0558],[0.3981,-0.0058],[0.4019,-0.1096],[0.4442,-0.1173],[0.4788,-0.1058],[0.5365,-0.1712],[0.5788,-0.2442],[0.5673,-0.3250],[0.5481,-0.3904],[0.5558,-0.4635],[0.5327,-0.5288],[0.5865,-0.5750],[0.5673,-0.6365],[0.5288,-0.7096],[0.4827,-0.7519],[0.4250,-0.7404],[0.3635,-0.6942],[0.3019,-0.6558],[0.2404,-0.6173],[0.1635,-0.5788],[0.0788,-0.5365],[0.0019,-0.4904],[-0.0519,-0.4442],[-0.0942,-0.3904],[-0.1442,-0.3404],[-0.1904,-0.2750],[-0.2365,-0.2096],[-0.2750,-0.1365],[-0.3212,-0.0558],[-0.3673,0.0212],[-0.4135,0.0904],[-0.4712,0.1481],[-0.5250,0.1827],[-0.5788,0.2212],[-0.5865,0.2827],[-0.5558,0.3596],[-0.5212,0.4327],[-0.4865,0.4673],[-0.4558,0.4365],[-0.4827,0.3904],[-0.4365,0.3635],[-0.4019,0.3212],[-0.3673,0.3442],[-0.3327,0.4173],[-0.3019,0.4750],[-0.2519,0.5096],[-0.1827,0.5365],[-0.1365,0.5673],[-0.0942,0.6288],[-0.1173,0.6442]];
    const shape = new Shape(); shape.moveTo(p[0][0],p[0][1]); p.slice(1).forEach(([x,y])=>shape.lineTo(x,y)); shape.closePath();
    return new ExtrudeGeometry(shape,{depth:0.13,bevelEnabled:true,bevelSize:0.025,bevelThickness:0.025,bevelSegments:3});
  }, []);

  // Geometría de la zona marcada (polygon con las coordenadas dadas)
  // Transformamos las coordenadas normalizadas al sistema Three.js
  const zonaPts = zonaMarcada.map(([x,y]) => [(x-50)/55,(50-y)/55] as [number,number]);
  const zonaGeometry = useMemo(() => {
    const shape = new Shape(); shape.moveTo(...zonaPts[0]); zonaPts.slice(1).forEach(p=>s.lineTo(...p)); shape.closePath();
    return new ShapeGeometry(shape);
  }, []);

  // Material base: textura satelital del Perú (color base con textura)
  const materialBase = useMemo(() => {
    // Usamos un material físico con color base que simula textura satelital
    // La textura real se pasaría por props o se cargaría como archivo estático
    new MeshPhysicalMaterial({ 
      color: 0x8b5a2b,  // tono tierra/madera base
      roughness: 0.8, 
      metalness: 0.1,
      clearcoat: 0.5,
      clearcoatRoughness: 0.3
    });
  }, []);

  // Material para la zona pintada/marcada - un tono diferente que simula el "parche" aplicado
  const materialZona = useMemo(() => {
    new MeshPhysicalMaterial({ 
      color: 0xffd84d,  // tono amarillo/dorado para la zona cambiada
      roughness: 0.6, 
      metalness: 0.1,
      clearcoat: 0.3,
      transparent: true,
      opacity: 0.9
    });
  }, []);

  // Función para calcular si un punto está dentro de la zona marcada
  const puntoDentroZona = (px: number, pz: number): boolean => {
    // Ray casting simple: contar intersecciones con el polígono de la zona
    let dentro = false;
    for (let i = 0, j = zonaMarcada.length - 1; i < zonaMarcada.length; j = i++) {
      const yi = zonaMarcada[i][1], yj = zonaMarcada[j][1];
      const xi = zonaMarcada[i][0], xj = zonaMarcada[j][0];
      const intersect = ((yi > pz) !== (yj > pz)) && (px < (xj - xi) * (pz - yi) / (yj - yi) + xi);
      if (intersect) dentro = !dentro;
    }
    return dentro;
  };

  return (
    <group rotation={[0, Math.sin(frame / 45)*0.3*gira, 0]}>
      <mesh geometry={geometryBase} material={materialBase} castShadow receiveShadow>
        {/* Zona marcada: un polígono que simula el parche de textura aplicado */}
        <mesh geometry={zonaGeometry} material={materialZona} position={[0, 0, 0.071]} scale={[1.05,1.05,1]} />
      </mesh>
      {/* Indicador visual de la zona: borde resaltado */}
      <mesh geometry={zonaGeometry} material={materialZona} position={[0, 0, 0.072]} scale={[1.05,1.05,1]} />
    </group>
  );
};
export const Muestra: React.FC = () => <PeruMapaVariante2 gira={1} />;