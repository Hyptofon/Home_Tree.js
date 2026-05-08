import * as THREE from 'three';

/**
 * Visits every material owned by a mesh, regardless of whether the mesh uses a
 * single material or a material array.
 *
 * @param material - Mesh material or material array.
 * @param callback - Function invoked once for each material instance.
 */
export function forEachMaterial(
  material: THREE.Material | THREE.Material[],
  callback: (material: THREE.Material) => void,
): void {
  if (Array.isArray(material)) {
    for (const item of material) callback(item);
    return;
  }

  callback(material);
}

/**
 * Releases unique geometries and materials found under an object tree.
 *
 * GLTF scenes often share geometry and material instances between meshes, so
 * resources are deduplicated before disposal to avoid double-dispose churn.
 *
 * @param root - Object tree that owns renderable resources.
 */
export function disposeObjectTree(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();

  root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      geometries.add(object.geometry);
      forEachMaterial(object.material, (material) => materials.add(material));
    }
  });

  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}
