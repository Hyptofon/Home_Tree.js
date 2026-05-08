import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

import { ModelLoader } from '../../loaders/ModelLoader.ts';
import type { Disposable } from '../../types/interfaces.ts';
import { disposeObjectTree, forEachMaterial } from '../../shared/three/dispose.ts';
import { SKYSCRAPER_CONFIG } from './skyscraperConfig.ts';

const GLASS_NAME_PATTERN = /glass|window/i;
const EMISSIVE_NAME_PATTERN = /emissive|emmisive|bulb|light/i;

/**
 * Loads, normalizes, and owns the hero skyscraper model.
 *
 * The GLB keeps its authored mesh/material hierarchy, while this wrapper
 * handles production integration concerns: world placement, material tuning,
 * shadow flags, a cheap physics proxy, and deterministic cleanup.
 */
export class Skyscraper implements Disposable {
  /** Scene node added by the application composition root. */
  readonly root = new THREE.Group();

  /** Distance-based representation selector for the heavy GLB asset. */
  private readonly lod = new THREE.LOD();

  private readonly loader = new ModelLoader();
  private readonly world: RAPIER.World;

  private rigidBody: RAPIER.RigidBody | null = null;
  private loaded = false;

  /**
   * Creates the feature wrapper. Call {@link load} before the loading overlay
   * is dismissed.
   *
   * @param world - Active Rapier world used for the fixed collider proxy.
   */
  constructor(world: RAPIER.World) {
    this.world = world;
    this.root.name = 'HeroSkyscraper';
    this.root.position.set(
      SKYSCRAPER_CONFIG.POSITION.x,
      SKYSCRAPER_CONFIG.POSITION.y,
      SKYSCRAPER_CONFIG.POSITION.z,
    );
  }

  /**
   * Adds the feature root to the scene.
   *
   * @param scene - Scene that should render the skyscraper.
   */
  addTo(scene: THREE.Scene): void {
    scene.add(this.root);
  }

  /**
   * Loads the GLB, prepares it for the renderer, and creates a low-cost fixed
   * cuboid collider from the normalized bounds.
   */
  async load(): Promise<void> {
    if (this.loaded) return;

    const model = await this.loader.loadModel(SKYSCRAPER_CONFIG.MODEL_PATH);
    model.name = 'AtlantaCorporateOfficeBuilding';
    model.scale.setScalar(SKYSCRAPER_CONFIG.SCALE);
    model.rotation.y = SKYSCRAPER_CONFIG.ROTATION_Y;

    this.prepareModel(model);
    const normalizedBounds = this.normalizePivotToGroundCenter(model);
    this.freezeStaticModel(model);

    this.lod.addLevel(model, SKYSCRAPER_CONFIG.LOD.FULL_DETAIL_DISTANCE);
    this.lod.addLevel(
      this.createDistantProxy(normalizedBounds),
      SKYSCRAPER_CONFIG.LOD.PROXY_DISTANCE,
    );
    this.root.add(this.lod);
    this.buildAccentLights();
    this.buildPhysicsProxy(normalizedBounds);
    this.loaded = true;
  }

  /** Removes the scene graph and releases all owned GPU and physics resources. */
  dispose(): void {
    this.root.removeFromParent();

    if (this.rigidBody) {
      this.world.removeRigidBody(this.rigidBody);
      this.rigidBody = null;
    }

    disposeObjectTree(this.root);
    this.lod.clear();
    this.root.clear();
    this.loaded = false;
  }

  /**
   * Applies render-facing settings to all meshes and their PBR materials.
   *
   * @param model - Loaded GLTF scene root.
   */
  private prepareModel(model: THREE.Group): void {
    model.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
        object.frustumCulled = true;

        forEachMaterial(object.material, (material) => {
          this.prepareMaterial(material, `${object.name} ${material.name}`);
        });
      }
    });
  }

  /**
   * Keeps authored textures while tuning material response for the cinematic
   * outdoor lighting pipeline.
   *
   * @param material - Material instance from the loaded GLTF.
   * @param semanticName - Mesh/material names used to classify glass and lights.
   */
  private prepareMaterial(material: THREE.Material, semanticName: string): void {
    if (!(material instanceof THREE.MeshStandardMaterial)) return;

    const isGlass = GLASS_NAME_PATTERN.test(semanticName) || material.transparent;
    const isEmissive = EMISSIVE_NAME_PATTERN.test(semanticName);
    const materialConfig = SKYSCRAPER_CONFIG.MATERIALS;

    material.envMapIntensity = isGlass
      ? materialConfig.GLASS_ENV_MAP_INTENSITY
      : materialConfig.DEFAULT_ENV_MAP_INTENSITY;

    if (isGlass) {
      material.roughness = Math.min(material.roughness, materialConfig.GLASS_ROUGHNESS_MAX);
      material.metalness = Math.max(material.metalness, materialConfig.GLASS_METALNESS_MIN);
    } else {
      material.roughness = Math.max(material.roughness, materialConfig.OPAQUE_ROUGHNESS_MIN);
    }

    if (isEmissive) {
      material.emissiveIntensity = Math.max(
        material.emissiveIntensity,
        materialConfig.EMISSIVE_INTENSITY_MIN,
      );
    }

    material.needsUpdate = true;
  }

  /**
   * Repositions the asset so the feature root sits at the centre of the ground
   * footprint, with the model base exactly on y=0.
   *
   * @param model - Loaded and scaled model root.
   * @returns Bounds after normalization in local feature space.
   */
  private normalizePivotToGroundCenter(model: THREE.Group): THREE.Box3 {
    const bounds = new THREE.Box3().setFromObject(model);
    const center = new THREE.Vector3();
    bounds.getCenter(center);

    model.position.x -= center.x;
    model.position.y -= bounds.min.y;
    model.position.z -= center.z;
    model.updateWorldMatrix(true, true);

    return new THREE.Box3().setFromObject(model);
  }

  /**
   * Disables local transform updates for the static GLB hierarchy after all
   * normalization is complete. Parent transforms and LOD visibility still work.
   *
   * @param model - Loaded and normalized static building root.
   */
  private freezeStaticModel(model: THREE.Group): void {
    model.traverse((object) => {
      object.updateMatrix();
      object.matrixAutoUpdate = false;
    });
    model.updateMatrixWorld(true);
  }

  /**
   * Creates a one-mesh distant representation for the LOD system.
   *
   * @param bounds - Normalized full-detail bounds in feature-local space.
   */
  private createDistantProxy(bounds: THREE.Box3): THREE.Mesh {
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    bounds.getSize(size);
    bounds.getCenter(center);

    const material = new THREE.MeshStandardMaterial({
      color: SKYSCRAPER_CONFIG.LOD.PROXY_COLOR,
      emissive: SKYSCRAPER_CONFIG.LOD.PROXY_EMISSIVE,
      emissiveIntensity: SKYSCRAPER_CONFIG.LOD.PROXY_EMISSIVE_INTENSITY,
      roughness: 0.32,
      metalness: 0.12,
      envMapIntensity: SKYSCRAPER_CONFIG.MATERIALS.GLASS_ENV_MAP_INTENSITY,
    });
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vSkyscraperProxyPosition;',
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vSkyscraperProxyPosition;',
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvSkyscraperProxyPosition = position.xyz;',
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `
        float proxyRows = 1.0 - smoothstep(0.05, 0.1, abs(fract(vSkyscraperProxyPosition.y * 0.52) - 0.5));
        float proxyColumns = 1.0 - smoothstep(0.04, 0.09, abs(fract((vSkyscraperProxyPosition.x + vSkyscraperProxyPosition.z) * 0.42) - 0.5));
        outgoingLight += vec3(1.0, 0.68, 0.38) * proxyRows * proxyColumns * 0.16;
        #include <dithering_fragment>`,
      );
    };

    const proxy = new THREE.Mesh(
      new THREE.BoxGeometry(size.x, size.y, size.z, 1, 12, 1),
      material,
    );
    proxy.name = 'SkyscraperDistantProxy';
    proxy.position.copy(center);
    proxy.castShadow = true;
    proxy.receiveShadow = true;
    return proxy;
  }

  /** Adds subtle non-shadow-casting lobby lights for night-time readability. */
  private buildAccentLights(): void {
    const cfg = SKYSCRAPER_CONFIG.ACCENT_LIGHTS;
    const left = this.createAccentLight();
    const right = this.createAccentLight();

    left.position.set(-cfg.ENTRANCE_OFFSET_X, cfg.ENTRANCE_HEIGHT, cfg.ENTRANCE_OFFSET_Z);
    right.position.set(cfg.ENTRANCE_OFFSET_X, cfg.ENTRANCE_HEIGHT, cfg.ENTRANCE_OFFSET_Z);

    this.root.add(left, right);
  }

  /** Creates one warm facade accent light. */
  private createAccentLight(): THREE.PointLight {
    const cfg = SKYSCRAPER_CONFIG.ACCENT_LIGHTS;
    const light = new THREE.PointLight(
      cfg.COLOR,
      cfg.INTENSITY,
      cfg.DISTANCE,
      cfg.DECAY,
    );
    light.castShadow = false;
    return light;
  }

  /**
   * Registers a single fixed cuboid collider for the building footprint.
   *
   * A coarse proxy keeps movement collision predictable without loading a
   * 60k-vertex visual mesh into the physics broadphase.
   *
   * @param bounds - Normalized local-space bounds of the loaded building.
   */
  private buildPhysicsProxy(bounds: THREE.Box3): void {
    const size = new THREE.Vector3();
    bounds.getSize(size);

    const colliderConfig = SKYSCRAPER_CONFIG.COLLIDER;
    const halfX = (size.x * colliderConfig.FOOTPRINT_SCALE_X) / 2;
    const halfY = (size.y * colliderConfig.HEIGHT_SCALE) / 2;
    const halfZ = (size.z * colliderConfig.FOOTPRINT_SCALE_Z) / 2;

    this.rigidBody = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(
        this.root.position.x,
        this.root.position.y + halfY,
        this.root.position.z,
      ),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(halfX, halfY, halfZ),
      this.rigidBody,
    );
  }
}
