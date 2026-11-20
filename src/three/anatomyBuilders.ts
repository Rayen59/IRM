import * as THREE from 'three';

export interface AnatomicalPartMeta {
  partId: string;
  partName: string;
  clinicalRole: string;
  basePos: THREE.Vector3;
  explodeVec: THREE.Vector3;
  baseColor: number;
  baseOpacity: number;
  baseTransparent: boolean;
  pulseScale?: number;
}

export type AnatomyModelKey =
  | 'Cardiologie'
  | 'Neurologie'
  | 'Pneumologie'
  | 'Orthopédie'
  | 'Gastro-entérologie'
  | 'Ophtalmologie / ORL';

function createGyriBumpTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#909090';
  ctx.fillRect(0, 0, 512, 512);

  // Procedural cortical folds (gyri & sulci)
  for (let i = 0; i < 140; i++) {
    const x = (Math.sin(i * 12.9898) * 0.5 + 0.5) * 512;
    const y = (Math.cos(i * 78.233) * 0.5 + 0.5) * 512;
    const r = 18 + (i % 7) * 6;
    ctx.beginPath();
    ctx.strokeStyle = i % 2 === 0 ? '#3a3a3a' : '#d8d8d8';
    ctx.lineWidth = 4 + (i % 4);
    ctx.lineCap = 'round';
    ctx.arc(x, y, r, (i % 5) * 0.6, (i % 5) * 0.6 + Math.PI * 1.15);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

function createIrisTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const cx = 256;
  const cy = 256;

  const grad = ctx.createRadialGradient(cx, cy, 45, cx, cy, 240);
  grad.addColorStop(0, '#0f172a');
  grad.addColorStop(0.24, '#1e3a5f');
  grad.addColorStop(0.55, '#2563eb');
  grad.addColorStop(0.88, '#1e40af');
  grad.addColorStop(1, '#0f172a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  // Radial stromal fibers
  for (let i = 0; i < 180; i++) {
    const angle = (i / 180) * Math.PI * 2;
    const rInner = 62 + (i % 5) * 4;
    const rOuter = 225 - (i % 4) * 6;
    ctx.beginPath();
    ctx.strokeStyle = i % 3 === 0 ? 'rgba(147, 197, 253, 0.35)' : 'rgba(30, 58, 138, 0.45)';
    ctx.lineWidth = 1.6;
    ctx.moveTo(cx + Math.cos(angle) * rInner, cy + Math.sin(angle) * rInner);
    ctx.lineTo(cx + Math.cos(angle) * rOuter, cy + Math.sin(angle) * rOuter);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function registerPart(
  mesh: THREE.Object3D,
  partId: string,
  partName: string,
  clinicalRole: string,
  explodeVec: THREE.Vector3,
  pulseScale = 0,
) {
  let baseColor = 0xffffff;
  let baseOpacity = 1;
  let baseTransparent = false;

  if (mesh instanceof THREE.Mesh && mesh.material instanceof THREE.MeshStandardMaterial) {
    baseColor = mesh.material.color.getHex();
    baseOpacity = mesh.material.opacity;
    baseTransparent = mesh.material.transparent;
  }

  const meta: AnatomicalPartMeta = {
    partId,
    partName,
    clinicalRole,
    basePos: mesh.position.clone(),
    explodeVec,
    baseColor,
    baseOpacity,
    baseTransparent,
    pulseScale,
  };

  mesh.userData = {...mesh.userData, ...meta};
  mesh.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      if (!child.userData.partId) {
        const mat = child.material as THREE.MeshStandardMaterial;
        child.userData = {
          ...child.userData,
          partId,
          partName,
          clinicalRole,
          basePos: child.position.clone(),
          explodeVec: new THREE.Vector3(0, 0, 0),
          baseColor: mat?.color ? mat.color.getHex() : baseColor,
          baseOpacity: mat ? mat.opacity : 1,
          baseTransparent: mat ? mat.transparent : false,
        };
      }
    }
  });
}

function makeTube(
  points: THREE.Vector3[],
  radius: number,
  color: number,
  roughness = 0.38,
  tubularSegments = 36,
): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(points);
  const geo = new THREE.TubeGeometry(curve, tubularSegments, radius, 18, false);
  const mat = new THREE.MeshPhysicalMaterial({
    color,
    roughness,
    metalness: 0.04,
    clearcoat: 0.25,
    clearcoatRoughness: 0.4,
  });
  return new THREE.Mesh(geo, mat);
}

// 1. CARDIOLOGIE — Human Heart & Great Vessels
function buildHeartModel(): THREE.Group {
  const group = new THREE.Group();

  const myocardiumMat = (hex: number, rough = 0.42) =>
    new THREE.MeshPhysicalMaterial({
      color: hex,
      roughness: rough,
      metalness: 0.03,
      clearcoat: 0.3,
      clearcoatRoughness: 0.35,
    });

  // Left Ventricle (muscular apex)
  const lvGeo = new THREE.SphereGeometry(0.95, 36, 32);
  lvGeo.scale(0.86, 1.38, 0.82);
  const leftVentricle = new THREE.Mesh(lvGeo, myocardiumMat(0xb91c1c, 0.38));
  leftVentricle.position.set(0.28, -0.35, 0.05);
  leftVentricle.rotation.z = 0.28;
  registerPart(
    leftVentricle,
    'ventricule_gauche',
    'Ventricule Gauche',
    'Pompe principale propulsant le sang oxygéné vers l’aorte et tout l’organisme.',
    new THREE.Vector3(0.45, -0.4, 0.25),
    0.045,
  );
  group.add(leftVentricle);

  // Right Ventricle
  const rvGeo = new THREE.SphereGeometry(0.82, 32, 28);
  rvGeo.scale(0.82, 1.2, 0.78);
  const rightVentricle = new THREE.Mesh(rvGeo, myocardiumMat(0x991b1b, 0.45));
  rightVentricle.position.set(-0.36, -0.25, 0.16);
  rightVentricle.rotation.z = 0.18;
  registerPart(
    rightVentricle,
    'ventricule_droit',
    'Ventricule Droit',
    'Propulse le sang désoxygéné vers le tronc pulmonaire et les poumons.',
    new THREE.Vector3(-0.45, -0.3, 0.35),
    0.04,
  );
  group.add(rightVentricle);

  // Right Atrium
  const raGeo = new THREE.SphereGeometry(0.56, 28, 24);
  raGeo.scale(0.95, 1.05, 0.9);
  const rightAtrium = new THREE.Mesh(raGeo, myocardiumMat(0x7f1d1d, 0.5));
  rightAtrium.position.set(-0.68, 0.56, 0.05);
  registerPart(
    rightAtrium,
    'oreillette_droite',
    'Oreillette Droite',
    'Reçoit le sang veineux systémique via les veines caves supérieure et inférieure.',
    new THREE.Vector3(-0.65, 0.3, 0.15),
    0.035,
  );
  group.add(rightAtrium);

  // Left Atrium
  const laGeo = new THREE.SphereGeometry(0.52, 28, 24);
  const leftAtrium = new THREE.Mesh(laGeo, myocardiumMat(0xdc2626, 0.4));
  leftAtrium.position.set(0.52, 0.62, -0.22);
  registerPart(
    leftAtrium,
    'oreillette_gauche',
    'Oreillette Gauche',
    'Reçoit le sang oxygéné des veines pulmonaires avant de le transférer au ventricule gauche.',
    new THREE.Vector3(0.55, 0.35, -0.35),
    0.035,
  );
  group.add(leftAtrium);

  // Aortic Arch + Ascending & Descending Aorta
  const aortaGroup = new THREE.Group();
  const aortaMain = makeTube(
    [
      new THREE.Vector3(0.08, 0.45, 0.02),
      new THREE.Vector3(0.18, 1.18, 0.02),
      new THREE.Vector3(-0.08, 1.56, -0.15),
      new THREE.Vector3(-0.36, 1.12, -0.45),
      new THREE.Vector3(-0.32, -0.95, -0.52),
    ],
    0.24,
    0xef4444,
    0.3,
  );
  aortaGroup.add(aortaMain);

  // Three superior aortic branches
  const branch1 = makeTube(
    [new THREE.Vector3(0.1, 1.45, -0.02), new THREE.Vector3(0.24, 1.98, 0.0)],
    0.08,
    0xef4444,
    0.32,
  );
  const branch2 = makeTube(
    [new THREE.Vector3(-0.04, 1.54, -0.1), new THREE.Vector3(0.0, 2.04, -0.1)],
    0.07,
    0xef4444,
    0.32,
  );
  const branch3 = makeTube(
    [new THREE.Vector3(-0.2, 1.48, -0.22), new THREE.Vector3(-0.26, 1.96, -0.24)],
    0.07,
    0xef4444,
    0.32,
  );
  aortaGroup.add(branch1, branch2, branch3);
  registerPart(
    aortaGroup,
    'crosse_aortique',
    'Crosse Aortique & Branches',
    'Artère principale distribuant le sang oxygéné vers le cerveau, les membres et l’abdomen.',
    new THREE.Vector3(0.1, 0.7, 0.0),
    0.025,
  );
  group.add(aortaGroup);

  // Pulmonary Trunk & Bifurcation
  const pulmGroup = new THREE.Group();
  const pulmTrunk = makeTube(
    [
      new THREE.Vector3(-0.24, 0.35, 0.35),
      new THREE.Vector3(-0.06, 0.92, 0.28),
      new THREE.Vector3(0.45, 1.04, 0.05),
    ],
    0.2,
    0x3b82f6,
    0.35,
  );
  const pulmRightBranch = makeTube(
    [new THREE.Vector3(-0.06, 0.92, 0.25), new THREE.Vector3(-0.78, 0.96, -0.05)],
    0.15,
    0x3b82f6,
    0.35,
  );
  pulmGroup.add(pulmTrunk, pulmRightBranch);
  registerPart(
    pulmGroup,
    'tronc_pulmonaire',
    'Artère & Tronc Pulmonaire',
    'Achemine le sang veineux du ventricule droit vers les poumons pour l’oxygénation.',
    new THREE.Vector3(-0.15, 0.45, 0.55),
  );
  group.add(pulmGroup);

  // Superior & Inferior Vena Cava
  const venaCava = makeTube(
    [
      new THREE.Vector3(-0.72, 1.75, -0.05),
      new THREE.Vector3(-0.72, 0.65, -0.02),
      new THREE.Vector3(-0.68, -0.75, -0.1),
    ],
    0.19,
    0x1d4ed8,
    0.42,
  );
  registerPart(
    venaCava,
    'veines_caves',
    'Veines Caves Supérieure & Inférieure',
    'Assurent le retour du sang désoxygéné de l’ensemble du corps vers l’oreillette droite.',
    new THREE.Vector3(-0.7, 0.1, -0.2),
  );
  group.add(venaCava);

  // Coronary Arteries on anterior myocardium
  const coronary = makeTube(
    [
      new THREE.Vector3(0.05, 0.36, 0.55),
      new THREE.Vector3(0.14, -0.05, 0.74),
      new THREE.Vector3(0.28, -0.58, 0.64),
      new THREE.Vector3(0.45, -1.05, 0.35),
    ],
    0.042,
    0xf87171,
    0.25,
  );
  registerPart(
    coronary,
    'arteres_coronaires',
    'Artères Coronaires',
    'Vascularisent le muscle cardiaque lui-même (myocarde). Zone clé dans l’ischémie et l’infarctus.',
    new THREE.Vector3(0.2, 0.0, 0.65),
  );
  group.add(coronary);

  return group;
}

// 2. NEUROLOGIE — Brain (Cerebral Hemispheres, Cerebellum, Brainstem)
function buildBrainModel(): THREE.Group {
  const group = new THREE.Group();
  const gyriTex = createGyriBumpTexture();

  const cortexMat = (hex: number) =>
    new THREE.MeshPhysicalMaterial({
      color: hex,
      roughness: 0.52,
      metalness: 0.02,
      bumpMap: gyriTex,
      bumpScale: 0.08,
      clearcoat: 0.18,
      clearcoatRoughness: 0.55,
    });

  // Left Cerebral Hemisphere
  const leftGeo = new THREE.SphereGeometry(1.05, 42, 36);
  leftGeo.scale(0.68, 0.96, 1.24);
  const leftHemi = new THREE.Mesh(leftGeo, cortexMat(0xf5b7b1));
  leftHemi.position.set(0.46, 0.34, 0);
  registerPart(
    leftHemi,
    'hemisphere_gauche',
    'Hémisphère Cérébral Gauche',
    'Contrôle la motricité de l’hémicorps droit, le langage (aires de Broca/Wernicke) et le raisonnement analytique.',
    new THREE.Vector3(0.62, 0.3, 0),
  );
  group.add(leftHemi);

  // Right Cerebral Hemisphere
  const rightGeo = new THREE.SphereGeometry(1.05, 42, 36);
  rightGeo.scale(0.68, 0.96, 1.24);
  const rightHemi = new THREE.Mesh(rightGeo, cortexMat(0xf1948a));
  rightHemi.position.set(-0.46, 0.34, 0);
  registerPart(
    rightHemi,
    'hemisphere_droit',
    'Hémisphère Cérébral Droit',
    'Contrôle la motricité de l’hémicorps gauche, la perception spatiale et l’attention.',
    new THREE.Vector3(-0.62, 0.3, 0),
  );
  group.add(rightHemi);

  // Corpus Callosum (central commissure)
  const corpusGeo = new THREE.TorusGeometry(0.42, 0.11, 16, 32, Math.PI);
  const corpus = new THREE.Mesh(
    corpusGeo,
    new THREE.MeshStandardMaterial({color: 0xfef3c7, roughness: 0.45}),
  );
  corpus.rotation.y = Math.PI / 2;
  corpus.position.set(0, 0.25, 0.05);
  registerPart(
    corpus,
    'corps_calleux',
    'Corps Calleux',
    'Faisceau de fibres nerveuses reliant et synchronisant les deux hémisphères cérébraux.',
    new THREE.Vector3(0, 0.55, 0),
  );
  group.add(corpus);

  // Cerebellum (Left & Right Lobes)
  const cerebGroup = new THREE.Group();
  const cerebMat = new THREE.MeshStandardMaterial({
    color: 0xd98880,
    roughness: 0.65,
    bumpMap: gyriTex,
    bumpScale: 0.12,
  });
  const cLeft = new THREE.Mesh(new THREE.SphereGeometry(0.46, 28, 24), cerebMat);
  cLeft.scale.set(0.95, 0.72, 0.88);
  cLeft.position.set(0.32, -0.52, -0.68);
  const cRight = new THREE.Mesh(new THREE.SphereGeometry(0.46, 28, 24), cerebMat);
  cRight.scale.set(0.95, 0.72, 0.88);
  cRight.position.set(-0.32, -0.52, -0.68);
  cerebGroup.add(cLeft, cRight);
  registerPart(
    cerebGroup,
    'cervelet',
    'Cervelet',
    'Coordonne l’équilibre, la posture, le tonus musculaire et la précision des mouvements.',
    new THREE.Vector3(0, -0.35, -0.65),
  );
  group.add(cerebGroup);

  // Brainstem (Pons & Medulla) + Cervical Spinal Cord
  const stemGroup = new THREE.Group();
  const pons = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 24, 20),
    new THREE.MeshStandardMaterial({color: 0xfde68a, roughness: 0.48}),
  );
  pons.scale.set(1.05, 0.9, 0.95);
  pons.position.set(0, -0.44, -0.08);
  const cord = makeTube(
    [
      new THREE.Vector3(0, -0.35, -0.08),
      new THREE.Vector3(0, -0.95, -0.22),
      new THREE.Vector3(0, -1.6, -0.28),
    ],
    0.16,
    0xfef08a,
    0.45,
  );
  stemGroup.add(pons, cord);
  registerPart(
    stemGroup,
    'tronc_cerebral',
    'Tronc Cérébral & Moelle Épinière',
    'Régule les fonctions vitales automatiques (respiration, rythme cardiaque) et transmet les influx nerveux.',
    new THREE.Vector3(0, -0.65, 0),
  );
  group.add(stemGroup);

  return group;
}

// 3. PNEUMOLOGIE — Trachea, Bronchi, Multi-lobed Lungs & Diaphragm
function buildLungsModel(): THREE.Group {
  const group = new THREE.Group();

  // Trachea + Cartilaginous Rings
  const tracheaGroup = new THREE.Group();
  const tracheaTube = new THREE.Mesh(
    new THREE.CylinderGeometry(0.17, 0.17, 1.35, 24),
    new THREE.MeshStandardMaterial({color: 0xfca5a5, roughness: 0.45}),
  );
  tracheaTube.position.set(0, 1.05, 0);
  tracheaGroup.add(tracheaTube);

  const ringMat = new THREE.MeshStandardMaterial({color: 0xf1f5f9, roughness: 0.3});
  for (let i = 0; i < 9; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.185, 0.025, 10, 28), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, 0.55 + i * 0.13, 0);
    tracheaGroup.add(ring);
  }
  registerPart(
    tracheaGroup,
    'trachee',
    'Trachée & Anneaux Cartilagineux',
    'Conduit aérien principal reliant le larynx aux bronches souches.',
    new THREE.Vector3(0, 0.65, 0),
  );
  group.add(tracheaGroup);

  // Main Bronchi
  const bronchiGroup = new THREE.Group();
  const leftBronchus = makeTube(
    [new THREE.Vector3(0, 0.42, 0), new THREE.Vector3(0.62, 0.08, 0)],
    0.12,
    0xfda4af,
    0.45,
  );
  const rightBronchus = makeTube(
    [new THREE.Vector3(0, 0.42, 0), new THREE.Vector3(-0.62, 0.12, 0)],
    0.12,
    0xfda4af,
    0.45,
  );
  bronchiGroup.add(leftBronchus, rightBronchus);
  registerPart(
    bronchiGroup,
    'bronches',
    'Carène & Bronches Souches',
    'Bifurcation assurant la distribution de l’air inspiré vers les poumons droit et gauche.',
    new THREE.Vector3(0, 0.25, 0.3),
  );
  group.add(bronchiGroup);

  const lungMat = (hex: number) =>
    new THREE.MeshPhysicalMaterial({
      color: hex,
      roughness: 0.55,
      metalness: 0.02,
      clearcoat: 0.2,
      clearcoatRoughness: 0.6,
    });

  // Right Lung (anatomically viewer's left: -X, 3 lobes)
  const rightLungGroup = new THREE.Group();
  const rSup = new THREE.Mesh(new THREE.SphereGeometry(0.58, 30, 24), lungMat(0xf472b6));
  rSup.scale.set(0.88, 1.15, 0.85);
  rSup.position.set(-0.76, 0.38, 0);
  const rMid = new THREE.Mesh(new THREE.SphereGeometry(0.58, 30, 24), lungMat(0xec4899));
  rMid.scale.set(0.95, 0.85, 0.88);
  rMid.position.set(-0.82, -0.22, 0.06);
  const rInf = new THREE.Mesh(new THREE.SphereGeometry(0.62, 30, 24), lungMat(0xdb2777));
  rInf.scale.set(1.0, 0.92, 0.92);
  rInf.position.set(-0.84, -0.78, -0.04);
  rightLungGroup.add(rSup, rMid, rInf);
  registerPart(
    rightLungGroup,
    'poumon_droit',
    'Poumon Droit (3 Lobes)',
    'Assure les échanges gazeux (O₂ / CO₂) à travers ses lobes supérieur, moyen et inférieur.',
    new THREE.Vector3(-0.75, 0, 0),
    0.035,
  );
  group.add(rightLungGroup);

  // Left Lung (viewer's right: +X, 2 lobes + cardiac notch)
  const leftLungGroup = new THREE.Group();
  const lSup = new THREE.Mesh(new THREE.SphereGeometry(0.56, 30, 24), lungMat(0xf472b6));
  lSup.scale.set(0.84, 1.25, 0.86);
  lSup.position.set(0.76, 0.34, 0);
  const lInf = new THREE.Mesh(new THREE.SphereGeometry(0.6, 30, 24), lungMat(0xdb2777));
  lInf.scale.set(0.92, 1.12, 0.9);
  lInf.position.set(0.82, -0.58, -0.02);
  leftLungGroup.add(lSup, lInf);
  registerPart(
    leftLungGroup,
    'poumon_gauche',
    'Poumon Gauche (2 Lobes)',
    'Présente l’incisure cardiaque logeant le cœur et assure l’hématose pulmonaire.',
    new THREE.Vector3(0.75, 0, 0),
    0.035,
  );
  group.add(leftLungGroup);

  // Diaphragm Dome
  const diaGeo = new THREE.SphereGeometry(1.55, 36, 20, 0, Math.PI * 2, 0, Math.PI * 0.36);
  diaGeo.scale(1.1, 0.45, 0.72);
  const diaphragm = new THREE.Mesh(
    diaGeo,
    new THREE.MeshStandardMaterial({color: 0xb91c1c, roughness: 0.65, side: THREE.DoubleSide}),
  );
  diaphragm.position.set(0, -1.55, 0);
  registerPart(
    diaphragm,
    'diaphragme',
    'Diaphragme',
    'Muscle inspiratoire principal séparant le thorax de l’abdomen.',
    new THREE.Vector3(0, -0.6, 0),
    0.025,
  );
  group.add(diaphragm);

  return group;
}

// 4. ORTHOPÉDIE — Articulated Vertebral Column & Intervertebral Discs
function buildSpineModel(): THREE.Group {
  const group = new THREE.Group();
  const boneMat = new THREE.MeshStandardMaterial({
    color: 0xf1ece1,
    roughness: 0.42,
    metalness: 0.04,
  });
  const discMat = new THREE.MeshPhysicalMaterial({
    color: 0x38bdf8,
    roughness: 0.22,
    metalness: 0.05,
    transparent: true,
    opacity: 0.82,
    clearcoat: 0.6,
  });

  const vertebraCount = 7;
  for (let i = 0; i < vertebraCount; i++) {
    const y = -1.35 + i * 0.45;
    const zCurve = Math.sin((i / (vertebraCount - 1)) * Math.PI) * 0.18;
    const scaleFactor = 1.15 - i * 0.05;

    const vGroup = new THREE.Group();
    vGroup.position.set(0, y, zCurve);

    // Vertebral Body
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42 * scaleFactor, 0.44 * scaleFactor, 0.28, 28),
      boneMat,
    );
    vGroup.add(body);

    // Spinous Process (posterior)
    const spinous = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.18, 0.65 * scaleFactor),
      boneMat,
    );
    spinous.position.set(0, -0.05, -0.48 * scaleFactor);
    spinous.rotation.x = 0.25;
    vGroup.add(spinous);

    // Transverse Processes (left & right)
    const transL = new THREE.Mesh(
      new THREE.BoxGeometry(0.55 * scaleFactor, 0.12, 0.14),
      boneMat,
    );
    transL.position.set(0.46 * scaleFactor, 0.02, -0.24 * scaleFactor);
    const transR = transL.clone();
    transR.position.x = -0.46 * scaleFactor;
    vGroup.add(transL, transR);

    const levelLabel =
      i < 2 ? `Vertèbre Lombaire L${5 - i}` : `Vertèbre Thoracique T${14 - i}`;
    registerPart(
      vGroup,
      `vertebre_${i}`,
      levelLabel,
      'Supporte la charge axiale du tronc et protège la moelle épinière dans le canal rachidien.',
      new THREE.Vector3((i % 2 === 0 ? 1 : -1) * 0.35, (i - 3) * 0.18, 0.1),
    );
    group.add(vGroup);

    // Intervertebral Disc
    if (i < vertebraCount - 1) {
      const disc = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4 * scaleFactor, 0.4 * scaleFactor, 0.11, 28),
        discMat,
      );
      disc.position.set(0, y + 0.225, zCurve);
      registerPart(
        disc,
        `disque_${i}`,
        `Disque Intervertébral D${i + 1}`,
        'Amortisseur fibro-cartilagineux absorbant les chocs. Zone fréquente de hernie discale ou pincement.',
        new THREE.Vector3(0, (i - 2.5) * 0.18, 0.45),
      );
      group.add(disc);
    }
  }

  // Spinal Cord passing through vertebral foramen
  const cord = makeTube(
    [
      new THREE.Vector3(0, -1.5, -0.36),
      new THREE.Vector3(0, 0.0, -0.22),
      new THREE.Vector3(0, 1.55, -0.36),
    ],
    0.1,
    0xfacc15,
    0.35,
  );
  registerPart(
    cord,
    'moelle_rachidienne',
    'Moelle Épinière & Racines Nerveuses',
    'Axe nerveux central acheminant les commandes motrices et les sensations douloureuses.',
    new THREE.Vector3(0, 0, -0.7),
  );
  group.add(cord);

  return group;
}

// 5. GASTRO-ENTÉROLOGIE — Esophagus, Stomach, Liver, Gallbladder, Intestines
function buildDigestiveModel(): THREE.Group {
  const group = new THREE.Group();

  // Esophagus
  const esophagus = makeTube(
    [
      new THREE.Vector3(0.05, 1.75, -0.05),
      new THREE.Vector3(0.08, 1.15, -0.02),
      new THREE.Vector3(0.24, 0.65, 0.05),
    ],
    0.11,
    0xfb7185,
    0.45,
  );
  registerPart(
    esophagus,
    'oesophage',
    'Œsophage',
    'Conduit musculaire transportant le bol alimentaire du pharynx vers l’estomac (zone du reflux).',
    new THREE.Vector3(0, 0.55, 0),
  );
  group.add(esophagus);

  // Stomach (J-shaped organ)
  const stomach = makeTube(
    [
      new THREE.Vector3(0.24, 0.68, 0.05),
      new THREE.Vector3(0.58, 0.56, 0.15),
      new THREE.Vector3(0.64, 0.1, 0.22),
      new THREE.Vector3(0.32, -0.14, 0.18),
      new THREE.Vector3(0.02, 0.05, 0.08),
    ],
    0.32,
    0xf43f5e,
    0.38,
  );
  registerPart(
    stomach,
    'estomac',
    'Estomac (Fundus, Corps & Pylore)',
    'Assure le brassage mécanique et la digestion acide des aliments.',
    new THREE.Vector3(0.55, 0.2, 0.3),
  );
  group.add(stomach);

  // Liver (Bi-lobed)
  const liverGroup = new THREE.Group();
  const liverMat = new THREE.MeshPhysicalMaterial({
    color: 0x7c2d12,
    roughness: 0.32,
    clearcoat: 0.35,
    clearcoatRoughness: 0.3,
  });
  const rightLobe = new THREE.Mesh(new THREE.SphereGeometry(0.68, 30, 24), liverMat);
  rightLobe.scale.set(1.15, 0.78, 0.85);
  rightLobe.position.set(-0.55, 0.52, 0.12);
  const leftLobe = new THREE.Mesh(new THREE.SphereGeometry(0.45, 28, 22), liverMat);
  leftLobe.scale.set(1.25, 0.65, 0.75);
  leftLobe.position.set(-0.08, 0.56, 0.16);
  liverGroup.add(rightLobe, leftLobe);
  registerPart(
    liverGroup,
    'foie',
    'Foie',
    'Glande métabolique majeure : détoxification, synthèse protéique et production de la bile.',
    new THREE.Vector3(-0.65, 0.45, 0.2),
  );
  group.add(liverGroup);

  // Gallbladder
  const gbGeo = new THREE.SphereGeometry(0.17, 22, 18);
  gbGeo.scale(0.85, 1.4, 0.85);
  const gallbladder = new THREE.Mesh(
    gbGeo,
    new THREE.MeshPhysicalMaterial({color: 0x059669, roughness: 0.25, clearcoat: 0.5}),
  );
  gallbladder.position.set(-0.38, 0.12, 0.36);
  gallbladder.rotation.z = -0.4;
  registerPart(
    gallbladder,
    'vesicule_biliaire',
    'Vésicule Biliaire',
    'Stocke et concentre la bile hépatique avant son évacuation lors de la digestion des graisses.',
    new THREE.Vector3(-0.45, 0.05, 0.65),
  );
  group.add(gallbladder);

  // Large & Small Intestine Loops
  const colon = makeTube(
    [
      new THREE.Vector3(-0.66, -1.12, 0.05),
      new THREE.Vector3(-0.68, -0.35, 0.08),
      new THREE.Vector3(0.0, -0.3, 0.22),
      new THREE.Vector3(0.68, -0.36, 0.08),
      new THREE.Vector3(0.64, -1.14, 0.04),
      new THREE.Vector3(0.12, -1.32, -0.08),
      new THREE.Vector3(0.0, -1.68, -0.1),
    ],
    0.17,
    0xfda4af,
    0.48,
    56,
  );
  registerPart(
    colon,
    'colon',
    'Côlon (Gros Intestin)',
    'Réabsorbe l’eau et les électrolytes et assure le transit intestinal terminal.',
    new THREE.Vector3(0, -0.45, 0.35),
  );
  group.add(colon);

  const smallInt = makeTube(
    [
      new THREE.Vector3(-0.32, -0.55, 0.16),
      new THREE.Vector3(0.32, -0.62, 0.22),
      new THREE.Vector3(-0.34, -0.78, 0.25),
      new THREE.Vector3(0.34, -0.92, 0.2),
      new THREE.Vector3(-0.28, -1.08, 0.15),
    ],
    0.12,
    0xfecdd3,
    0.45,
    60,
  );
  registerPart(
    smallInt,
    'intestin_grele',
    'Intestin Grêle',
    'Assure l’absorption des nutriments, vitamines et minéraux dans la circulation sanguine.',
    new THREE.Vector3(0, -0.45, 0.65),
  );
  group.add(smallInt);

  return group;
}

// 6. OPHTALMOLOGIE / ORL — Eyeball Cross-Section & Optic Nerve
function buildEyeModel(): THREE.Group {
  const group = new THREE.Group();
  const irisTex = createIrisTexture();

  // Sclera Outer Shell
  const sclera = new THREE.Mesh(
    new THREE.SphereGeometry(1.12, 42, 36),
    new THREE.MeshPhysicalMaterial({
      color: 0xf8fafc,
      roughness: 0.28,
      clearcoat: 0.65,
      clearcoatRoughness: 0.2,
      transparent: true,
      opacity: 0.92,
    }),
  );
  registerPart(
    sclera,
    'sclere',
    'Sclère (Enveloppe Oculaire)',
    'Tunique fibreuse protectrice externe maintenant la forme et la pression intraoculaire.',
    new THREE.Vector3(0, 0.55, -0.2),
  );
  group.add(sclera);

  // Transparent Cornea Dome
  const corneaGeo = new THREE.SphereGeometry(0.62, 32, 24, 0, Math.PI * 2, 0, Math.PI * 0.45);
  const cornea = new THREE.Mesh(
    corneaGeo,
    new THREE.MeshPhysicalMaterial({
      color: 0xe0f2fe,
      roughness: 0.05,
      metalness: 0.0,
      transparent: true,
      opacity: 0.48,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
    }),
  );
  cornea.rotation.x = Math.PI / 2;
  cornea.position.set(0, 0, 0.92);
  registerPart(
    cornea,
    'cornee',
    'Cornée',
    'Lentille antérieure transparente assurant les deux tiers du pouvoir réfractif de l’œil.',
    new THREE.Vector3(0, 0, 0.78),
  );
  group.add(cornea);

  // Iris Ring
  const iris = new THREE.Mesh(
    new THREE.RingGeometry(0.18, 0.48, 48),
    new THREE.MeshStandardMaterial({
      map: irisTex,
      roughness: 0.4,
      side: THREE.DoubleSide,
    }),
  );
  iris.position.set(0, 0, 1.03);
  registerPart(
    iris,
    'iris',
    'Iris & Pupille',
    'Diaphragme pigmenté régulant la quantité de lumière entrant vers la rétine.',
    new THREE.Vector3(0, 0, 0.48),
  );
  group.add(iris);

  // Crystalline Lens
  const lensGeo = new THREE.SphereGeometry(0.32, 28, 22);
  lensGeo.scale(1.0, 1.0, 0.48);
  const lens = new THREE.Mesh(
    lensGeo,
    new THREE.MeshPhysicalMaterial({
      color: 0xbae6fd,
      roughness: 0.08,
      transparent: true,
      opacity: 0.72,
      clearcoat: 0.9,
    }),
  );
  lens.position.set(0, 0, 0.72);
  registerPart(
    lens,
    'cristallin',
    'Cristallin',
    'Lentille biconvexe modulable pour l’accommodation. Son opacification provoque la cataracte.',
    new THREE.Vector3(0, 0, 0.25),
  );
  group.add(lens);

  // Optic Nerve
  const opticNerve = makeTube(
    [
      new THREE.Vector3(0, 0, -1.05),
      new THREE.Vector3(0.08, -0.05, -1.55),
      new THREE.Vector3(0.28, -0.15, -2.1),
    ],
    0.2,
    0xfef08a,
    0.42,
  );
  registerPart(
    opticNerve,
    'nerf_optique',
    'Nerf Optique',
    'Transmet les signaux visuels de la rétine jusqu’au cortex visuel occipital.',
    new THREE.Vector3(0, 0, -0.72),
  );
  group.add(opticNerve);

  // Extraocular Muscles (4 rectus bands)
  const muscleGroup = new THREE.Group();
  const muscleMat = new THREE.MeshStandardMaterial({color: 0xdc2626, roughness: 0.55});
  const offsets: Array<[number, number, number]> = [
    [0, 0.95, 0],
    [0, -0.95, 0],
    [0.95, 0, 0],
    [-0.95, 0, 0],
  ];
  for (const [mx, my, mz] of offsets) {
    const band = makeTube(
      [
        new THREE.Vector3(mx * 0.85, my * 0.85, 0.42),
        new THREE.Vector3(mx * 1.12, my * 1.12, -0.35),
        new THREE.Vector3(mx * 0.35, my * 0.35, -1.75 + mz),
      ],
      0.08,
      0xdc2626,
      0.55,
    );
    band.material = muscleMat;
    muscleGroup.add(band);
  }
  registerPart(
    muscleGroup,
    'muscles_oculaires',
    'Muscles Oculomoteurs',
    'Assurent la mobilité précise du globe oculaire dans toutes les directions du regard.',
    new THREE.Vector3(0, -0.45, -0.25),
  );
  group.add(muscleGroup);

  return group;
}

export function buildAnatomyModel(modelKey: AnatomyModelKey): THREE.Group {
  switch (modelKey) {
    case 'Cardiologie':
      return buildHeartModel();
    case 'Neurologie':
      return buildBrainModel();
    case 'Pneumologie':
      return buildLungsModel();
    case 'Orthopédie':
      return buildSpineModel();
    case 'Gastro-entérologie':
      return buildDigestiveModel();
    case 'Ophtalmologie / ORL':
      return buildEyeModel();
  }
}

export function disposeObject3D(root: THREE.Object3D) {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        if (!m) continue;
        const std = m as THREE.MeshStandardMaterial;
        std.map?.dispose();
        std.bumpMap?.dispose();
        std.normalMap?.dispose();
        m.dispose();
      }
    }
  });
}
