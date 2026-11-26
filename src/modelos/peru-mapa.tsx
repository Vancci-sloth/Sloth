/** Mapa del Perú extruido, para señalar el país. Mide aproximadamente 1,5 m de alto, centrado en el origen. */
import React, {useMemo} from 'react';
import {Shape, ExtrudeGeometry, MeshPhysicalMaterial} from 'three';
import {useCurrentFrame} from 'remotion';

export const PeruMapa: React.FC<{gira?: number; gris?: boolean}> = ({gira = 0, gris = false}) => {
  const frame = useCurrentFrame();
  const geometry = useMemo(() => {
    const p = [[-0.0827,0.7519],[-0.0135,0.7404],[0.0250,0.7019],[0.0788,0.6865],[0.1058,0.6404],[0.1481,0.5981],[0.2135,0.5750],[0.2673,0.5904],[0.3327,0.5712],[0.3942,0.5404],[0.3788,0.4673],[0.4212,0.4404],[0.4096,0.3904],[0.3404,0.3865],[0.2596,0.3635],[0.1942,0.3058],[0.1596,0.2404],[0.1327,0.1558],[0.1481,0.0981],[0.1942,0.0519],[0.1788,0.0096],[0.2250,-0.0058],[0.2712,-0.0519],[0.3327,-0.0558],[0.3981,-0.0058],[0.4019,-0.1096],[0.4442,-0.1173],[0.4788,-0.1058],[0.5365,-0.1712],[0.5788,-0.2442],[0.5673,-0.3250],[0.5481,-0.3904],[0.5558,-0.4635],[0.5327,-0.5288],[0.5865,-0.5750],[0.5673,-0.6365],[0.5288,-0.7096],[0.4827,-0.7519],[0.4250,-0.7404],[0.3635,-0.6942],[0.3019,-0.6558],[0.2404,-0.6173],[0.1635,-0.5788],[0.0788,-0.5365],[0.0019,-0.4904],[-0.0519,-0.4442],[-0.0942,-0.3904],[-0.1442,-0.3404],[-0.1904,-0.2750],[-0.2365,-0.2096],[-0.2750,-0.1365],[-0.3212,-0.0558],[-0.3673,0.0212],[-0.4135,0.0904],[-0.4712,0.1481],[-0.5250,0.1827],[-0.5788,0.2212],[-0.5865,0.2827],[-0.5558,0.3596],[-0.5212,0.4327],[-0.4865,0.4673],[-0.4558,0.4365],[-0.4827,0.3904],[-0.4365,0.3635],[-0.4019,0.3212],[-0.3673,0.3442],[-0.3327,0.4173],[-0.3019,0.4750],[-0.2519,0.5096],[-0.1827,0.5365],[-0.1365,0.5673],[-0.0942,0.6288],[-0.1173,0.6442]];
    const shape = new Shape(); shape.moveTo(p[0][0],p[0][1]); p.slice(1).forEach(([x,y])=>shape.lineTo(x,y)); shape.closePath();
    return new ExtrudeGeometry(shape,{depth:0.13,bevelEnabled:true,bevelSize:0.025,bevelThickness:0.025,bevelSegments:3});
  }, []);
  const material = useMemo(() => new MeshPhysicalMaterial({color:gris?'#777777':'#c51f32',roughness:0.34,metalness:0.12,clearcoat:0.55}), [gris]);
  return <group rotation={[0, Math.sin(frame / 45)*0.3*gira, 0]}><mesh geometry={geometry} material={material} castShadow receiveShadow /></group>;
};
export const Muestra: React.FC = () => <PeruMapa gira={1}/>;
