// Follower stamps for the cash-in panel: a character's `young` mesh rendered
// once from the side into a tiny offscreen canvas and handed back as a data
// URL. One renderer, made on first use; results cached by key.
import * as THREE from 'three';

const SIZE = 64;
const cache = new Map();
let rig = null;

function setup() {
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(SIZE, SIZE, false);
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(3, 4, -2);
  scene.add(sun);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);
  return { renderer, scene, camera };
}

// Returns a data URL, or null where WebGL is unavailable. `make` builds the
// mesh only on a cache miss.
export function stampOf(key, make) {
  if (cache.has(key)) return cache.get(key);
  let url = null;
  let mesh = null;
  try {
    rig ??= setup();
    const { renderer, scene, camera } = rig;
    mesh = make();
    scene.add(mesh);
    const bounds = new THREE.Box3().setFromObject(mesh);
    const centre = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const half = Math.max(size.x, size.y, size.z) * 0.58;
    camera.left = -half; camera.right = half; camera.top = half; camera.bottom = -half;
    camera.updateProjectionMatrix();
    camera.position.set(centre.x + 10, centre.y + half * 0.5, centre.z);
    camera.lookAt(centre);
    renderer.render(scene, camera);
    url = renderer.domElement.toDataURL();
  } catch { url = null; } finally { if (mesh) rig?.scene.remove(mesh); }
  cache.set(key, url);
  return url;
}
