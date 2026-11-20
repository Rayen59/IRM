import {
  Activity,
  ChevronDown,
  ChevronUp,
  Eye,
  Layers,
  RotateCcw,
  Scan,
  Stethoscope,
} from 'lucide-react';
import {useEffect, useRef, useState} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {
  buildAnatomyModel,
  disposeObject3D,
  type AnatomicalPartMeta,
  type AnatomyModelKey,
} from '../three/anatomyBuilders';
import type {MedicalCategoryId} from '../types/medical';

interface Anatomy3DViewerProps {
  selectedCategory: MedicalCategoryId;
  onSelectCategory: (category: MedicalCategoryId) => void;
  onSelectZoneForDossier: (category: MedicalCategoryId, zoneName: string) => void;
}

const ANATOMY_MODELS: Array<{
  key: AnatomyModelKey;
  label: string;
  subtitle: string;
}> = [
  {key: 'Cardiologie', label: 'Cardiologie', subtitle: 'Cœur & vaisseaux'},
  {key: 'Neurologie', label: 'Neurologie', subtitle: 'Encéphale & nerfs'},
  {key: 'Pneumologie', label: 'Pneumologie', subtitle: 'Poumons & trachée'},
  {key: 'Orthopédie', label: 'Orthopédie', subtitle: 'Rachis & disques'},
  {key: 'Gastro-entérologie', label: 'Gastro-entérologie', subtitle: 'Système digestif'},
  {key: 'Ophtalmologie / ORL', label: 'Ophtalmologie / ORL', subtitle: 'Globe oculaire'},
];

const _camTargetPos = new THREE.Vector3();
const _targetVec = new THREE.Vector3();

function mapCategoryToModel(cat: MedicalCategoryId): AnatomyModelKey {
  if (
    cat === 'Cardiologie' ||
    cat === 'Neurologie' ||
    cat === 'Pneumologie' ||
    cat === 'Orthopédie' ||
    cat === 'Gastro-entérologie' ||
    cat === 'Ophtalmologie / ORL'
  ) {
    return cat;
  }
  return 'Cardiologie';
}

export function Anatomy3DViewer({
  selectedCategory,
  onSelectCategory,
  onSelectZoneForDossier,
}: Anatomy3DViewerProps) {
  const activeModelKey = mapCategoryToModel(selectedCategory);
  const mountRef = useRef<HTMLDivElement | null>(null);

  const [explodeFactor, setExplodeFactor] = useState(0);
  const [xrayMode, setXrayMode] = useState(false);
  const [animatePhysio, setAnimatePhysio] = useState(true);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [selectedPart, setSelectedPart] = useState<{
    partName: string;
    clinicalRole: string;
  } | null>(null);
  const [hoveredName, setHoveredName] = useState<string | null>(null);

  // Mutable refs for smooth animation without recreating WebGL context
  const explodeTargetRef = useRef(0);
  const explodeCurrentRef = useRef(0);
  const xrayRef = useRef(false);
  const animateRef = useRef(true);
  const cameraPresetRef = useRef<THREE.Vector3 | null>(null);
  const selectedPartIdRef = useRef<string | null>(null);
  const modelGroupRef = useRef<THREE.Group | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const requestRenderRef = useRef<() => void>(() => {});

  useEffect(() => {
    explodeTargetRef.current = explodeFactor;
    requestRenderRef.current();
  }, [explodeFactor]);

  useEffect(() => {
    xrayRef.current = xrayMode;
    const group = modelGroupRef.current;
    if (group) {
      group.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshStandardMaterial) {
          const meta = obj.userData as Partial<AnatomicalPartMeta>;
          if (xrayMode) {
            obj.material.transparent = true;
            obj.material.opacity = 0.34;
            obj.material.wireframe = false;
            obj.material.depthWrite = false;
          } else {
            obj.material.transparent = Boolean(meta.baseTransparent);
            obj.material.opacity = meta.baseOpacity ?? 1;
            obj.material.depthWrite = !meta.baseTransparent;
          }
          obj.material.needsUpdate = true;
        }
      });
    }
    requestRenderRef.current();
  }, [xrayMode]);

  useEffect(() => {
    animateRef.current = animatePhysio;
  }, [animatePhysio]);

  // Swap 3D anatomical model cleanly when category changes
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (modelGroupRef.current) {
      scene.remove(modelGroupRef.current);
      disposeObject3D(modelGroupRef.current);
      modelGroupRef.current = null;
    }

    const nextModel = buildAnatomyModel(activeModelKey);
    scene.add(nextModel);
    modelGroupRef.current = nextModel;
    selectedPartIdRef.current = null;
    setSelectedPart(null);
    setHoveredName(null);
    explodeCurrentRef.current = 0;
    setExplodeFactor(0);
    setXrayMode(false);
    cameraPresetRef.current = new THREE.Vector3(0, 0.25, 4.9);
    requestRenderRef.current();
  }, [activeModelKey]);

  // Initialize Three.js WebGL scene once
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = (() => {
      const probe = document.createElement('canvas').getContext('webgl2');
      if (!probe) return true;
      const ext = probe.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
      const gpu = String(probe.getParameter(param));
      probe.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
      alpha: false,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf1f5f9);
    scene.fog = new THREE.FogExp2(0xf1f5f9, 0.035);
    sceneRef.current = scene;

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(
      42,
      container.clientWidth / Math.max(container.clientHeight, 1),
      0.1,
      100,
    );
    camera.position.set(0, 0.25, 4.9);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.minDistance = 2.4;
    controls.maxDistance = 10;
    controls.target.set(0, 0, 0);

    controls.addEventListener('start', () => {
      cameraPresetRef.current = null;
    });

    // Three-Point Studio Medical Lighting
    const hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0xcbd5e1, 0.85);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff7ed, 1.8);
    keyLight.position.set(4.5, 6.5, 5.0);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -3;
    keyLight.shadow.camera.right = 3;
    keyLight.shadow.camera.top = 3;
    keyLight.shadow.camera.bottom = -3;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x93c5fd, 1.0);
    rimLight.position.set(-4.5, 2.5, -4.0);
    scene.add(rimLight);

    // Ground Contact Shadow Disc & Subtle Medical Reference Grid
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 256;
    shadowCanvas.height = 256;
    const sCtx = shadowCanvas.getContext('2d')!;
    const sGrad = sCtx.createRadialGradient(128, 128, 12, 128, 128, 124);
    sGrad.addColorStop(0, 'rgba(15, 23, 42, 0.22)');
    sGrad.addColorStop(0.55, 'rgba(15, 23, 42, 0.08)');
    sGrad.addColorStop(1, 'rgba(15, 23, 42, 0)');
    sCtx.fillStyle = sGrad;
    sCtx.fillRect(0, 0, 256, 256);
    const shadowTex = new THREE.CanvasTexture(shadowCanvas);

    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(4.6, 4.6),
      new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        depthWrite: false,
      }),
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -2.05;
    scene.add(shadowPlane);

    const grid = new THREE.GridHelper(10, 20, 0xcbd5e1, 0xe2e8f0);
    grid.position.y = -2.07;
    scene.add(grid);

    // Initial anatomical model
    const initialModel = buildAnatomyModel(activeModelKey);
    scene.add(initialModel);
    modelGroupRef.current = initialModel;

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Raycasting for interactive anatomical structure selection
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerDownPos = {x: 0, y: 0};
    let lastHoverCheck = 0;

    const updateSelectionHighlight = () => {
      const group = modelGroupRef.current;
      if (!group) return;
      group.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshStandardMaterial) {
          const meta = obj.userData as Partial<AnatomicalPartMeta>;
          const isSelected = Boolean(meta.partId && meta.partId === selectedPartIdRef.current);
          if (isSelected) {
            obj.material.emissive.setHex(0x1d4ed8);
            obj.material.emissiveIntensity = 0.35;
          } else {
            obj.material.emissive.setHex(0x000000);
            obj.material.emissiveIntensity = 0;
          }
        }
      });
    };

    const getIntersections = (clientX: number, clientY: number) => {
      const group = modelGroupRef.current;
      if (!group) return [];
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      return raycaster.intersectObjects(group.children, true);
    };

    const onPointerDown = (e: PointerEvent) => {
      pointerDownPos = {x: e.clientX, y: e.clientY};
    };

    const onPointerUp = (e: PointerEvent) => {
      const dist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      if (dist > 6) return; // Dragged camera, not a click
      const hits = getIntersections(e.clientX, e.clientY);
      if (hits.length > 0) {
        const hitObj = hits[0].object;
        const meta = hitObj.userData as Partial<AnatomicalPartMeta>;
        if (meta.partId && meta.partName) {
          selectedPartIdRef.current = meta.partId;
          setSelectedPart({
            partName: meta.partName,
            clinicalRole: meta.clinicalRole || '',
          });
          updateSelectionHighlight();
          requestRenderRef.current();
          return;
        }
      }
      selectedPartIdRef.current = null;
      setSelectedPart(null);
      updateSelectionHighlight();
      requestRenderRef.current();
    };

    const onPointerMove = (e: PointerEvent) => {
      const now = performance.now();
      if (now - lastHoverCheck < 50) return;
      lastHoverCheck = now;
      const hits = getIntersections(e.clientX, e.clientY);
      if (hits.length > 0) {
        const meta = hits[0].object.userData as Partial<AnatomicalPartMeta>;
        renderer.domElement.style.cursor = 'pointer';
        setHoveredName(meta.partName || null);
      } else {
        renderer.domElement.style.cursor = 'grab';
        setHoveredName(null);
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointermove', onPointerMove);

    // Resize observer
    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = Math.max(container.clientHeight, 1);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRenderRef.current();
    };
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(container);

    // Animation & pacing loop
    let frameId = 0;
    let disposed = false;
    const clock = new THREE.Clock();

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    const tick = () => {
      if (disposed) return;
      const delta = Math.min(clock.getDelta(), 0.1);
      const elapsed = clock.getElapsedTime();
      const group = modelGroupRef.current;

      // Smoothly damp exploded view
      explodeCurrentRef.current = THREE.MathUtils.damp(
        explodeCurrentRef.current,
        explodeTargetRef.current,
        7,
        delta,
      );

      if (group) {
        if (animateRef.current) {
          group.rotation.y += delta * 0.22;
        }

        const pulseBeat = animateRef.current
          ? Math.pow(Math.max(0, Math.sin(elapsed * 3.8)), 4)
          : 0;

        for (const child of group.children) {
          const meta = child.userData as Partial<AnatomicalPartMeta>;
          if (meta.basePos && meta.explodeVec) {
            _targetVec
              .copy(meta.basePos)
              .addScaledVector(meta.explodeVec, explodeCurrentRef.current);
            child.position.copy(_targetVec);
          }
          if (meta.pulseScale) {
            const s = 1 + pulseBeat * meta.pulseScale;
            child.scale.setScalar(s);
          }
        }
      }

      // Smooth camera preset transition
      if (cameraPresetRef.current) {
        _camTargetPos.copy(cameraPresetRef.current);
        camera.position.lerp(_camTargetPos, 1 - Math.exp(-6 * delta));
        if (camera.position.distanceTo(_camTargetPos) < 0.03) {
          camera.position.copy(_camTargetPos);
          cameraPresetRef.current = null;
        }
      }

      controls.update();
      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    requestRenderRef.current = () => {
      // Loop handles continuous smooth updates; trigger immediate render if needed
    };

    frameId = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      controls.dispose();
      if (modelGroupRef.current) {
        disposeObject3D(modelGroupRef.current);
      }
      shadowTex.dispose();
      envTex.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  const setPreset = (x: number, y: number, z: number) => {
    cameraPresetRef.current = new THREE.Vector3(x, y, z);
  };

  return (
    <div className="space-y-4">
      {/* Category Selector Bar — styled cleanly like screenshot theme buttons */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Atlas Anatomique 3D Interactif
            </h2>
            <p className="text-xs text-slate-500">
              Explorez chaque organe en 3D et cliquez sur une structure pour localiser vos symptômes.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              onSelectZoneForDossier(
                selectedCategory,
                selectedPart ? selectedPart.partName : '',
              )
            }
            className="px-4 py-2 bg-[#059669] hover:bg-[#047857] text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-2"
          >
            <Stethoscope className="w-4 h-4" />
            Soumettre un Dossier Médical
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mr-1">
            Modèle :
          </span>
          {ANATOMY_MODELS.map((item) => {
            const active = activeModelKey === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onSelectCategory(item.key)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-[#0B57D0] text-white shadow-sm'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Unobstructed 3D Viewport Container */}
      <div className="relative w-full h-[540px] md:h-[600px] bg-[#f1f5f9] rounded-2xl border border-slate-200/80 overflow-hidden shadow-sm">
        {/* Dedicated Three.js Canvas Mount */}
        <div ref={mountRef} className="w-full h-full" />

        {/* Subtle Top-Left Identification Label (no backdrop-blur over WebGL) */}
        <div className="pointer-events-none absolute top-4 left-4 bg-white/95 border border-slate-200 rounded-xl px-3.5 py-2 shadow-sm max-w-[280px]">
          <p className="text-xs font-bold text-[#0B57D0]">{activeModelKey}</p>
          <p className="text-[11px] text-slate-600 mt-0.5">
            {hoveredName
              ? `Structure : ${hoveredName}`
              : 'Glisser pour pivoter · Molette pour zoomer · Cliquer sur une zone'}
          </p>
        </div>

        {/* Selected Anatomical Structure Callout */}
        {selectedPart && (
          <div className="absolute top-4 right-4 bg-white/95 border border-slate-200 rounded-xl p-4 shadow-md max-w-[300px] z-10">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-bold text-slate-900">{selectedPart.partName}</p>
              <button
                type="button"
                onClick={() => {
                  selectedPartIdRef.current = null;
                  setSelectedPart(null);
                }}
                className="text-xs text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                Fermer
              </button>
            </div>
            <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
              {selectedPart.clinicalRole}
            </p>
            <button
              type="button"
              onClick={() =>
                onSelectZoneForDossier(activeModelKey, selectedPart.partName)
              }
              className="mt-3 w-full py-2 px-3 bg-[#059669] hover:bg-[#047857] text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            >
              Signaler un symptôme sur cette zone
            </button>
          </div>
        )}

        {/* Collapsible Bottom Control Dock (Zero Viewport Occlusion) */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[min(900px,94%)] z-10 flex flex-col items-center">
          <button
            type="button"
            onClick={() => setDockCollapsed((v) => !v)}
            className="mb-1.5 px-3 py-1 bg-white/95 border border-slate-200 rounded-t-lg text-[11px] font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1 shadow-sm cursor-pointer"
          >
            {dockCollapsed ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" /> Afficher les contrôles 3D
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" /> Masquer les contrôles
              </>
            )}
          </button>

          {!dockCollapsed && (
            <div className="w-full bg-white/95 border border-slate-200 rounded-2xl px-4 py-3 shadow-md flex flex-wrap items-center justify-between gap-4">
              {/* Exploded View Slider */}
              <div className="flex items-center gap-2.5 min-w-[190px] flex-1">
                <Layers className="w-4 h-4 text-[#0B57D0] shrink-0" />
                <span className="text-xs font-semibold text-slate-700 whitespace-nowrap">
                  Vue éclatée
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={explodeFactor}
                  onChange={(e) => setExplodeFactor(Number(e.target.value))}
                  className="w-full accent-[#0B57D0] cursor-pointer"
                />
                <span className="font-mono-tabular text-xs text-slate-500 w-9 text-right">
                  {Math.round(explodeFactor * 100)}%
                </span>
              </div>

              {/* Mode Toggles */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setXrayMode((v) => !v)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
                    xrayMode
                      ? 'bg-[#0B57D0] text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <Scan className="w-3.5 h-3.5" />
                  Transparence
                </button>

                <button
                  type="button"
                  onClick={() => setAnimatePhysio((v) => !v)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
                    animatePhysio
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <Activity className="w-3.5 h-3.5" />
                  Animation
                </button>
              </div>

              {/* Camera Presets */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setPreset(0, 0.25, 4.9)}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 flex items-center gap-1 cursor-pointer whitespace-nowrap"
                >
                  <Eye className="w-3.5 h-3.5" /> Face
                </button>
                <button
                  type="button"
                  onClick={() => setPreset(4.9, 0.3, 0)}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer whitespace-nowrap"
                >
                  Profil
                </button>
                <button
                  type="button"
                  onClick={() => setPreset(0, 4.9, 0.5)}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer whitespace-nowrap"
                >
                  Dessus
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setExplodeFactor(0);
                    setXrayMode(false);
                    setPreset(0, 0.25, 4.9);
                  }}
                  title="Réinitialiser la vue"
                  className="p-1.5 rounded-lg text-slate-600 bg-slate-100 hover:bg-slate-200 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
