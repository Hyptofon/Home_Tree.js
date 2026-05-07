/**
 * @fileoverview CloudSystem renders clustered cumulus clouds using a single
 * instanced billboard mesh. The implementation borrows the strong visual idea
 * from volumetric cloud swarms while staying lightweight enough for this scene.
 */
import * as THREE from 'three';
import { CLOUD_CONFIG } from './config.ts';
import { clamp, lerp } from './utils.ts';
import type { DayPhase } from './types.ts';
import { CLOUD_FRAGMENT_SHADER, CLOUD_VERTEX_SHADER } from './cloudShader.ts';

const _colorA = new THREE.Color();
const _colorB = new THREE.Color();
const _colorC = new THREE.Color();
const _colorD = new THREE.Color();
const _colorE = new THREE.Color();
const _colorF = new THREE.Color();
const TAU = Math.PI * 2;

interface CloudPuff {
  readonly instanceIndex: number;
  readonly localX: number;
  readonly localY: number;
  readonly localZ: number;
  readonly scaleX: number;
  readonly scaleY: number;
}

interface CloudCluster {
  readonly anchor: THREE.Vector3;
  readonly velocityX: number;
  readonly velocityZ: number;
  readonly wrapRadius: number;
  readonly puffs: CloudPuff[];
}

interface CloudAppearance {
  readonly highlightColor: THREE.Color;
  readonly baseColor: THREE.Color;
  readonly shadowColor: THREE.Color;
  readonly opacity: number;
}

/**
 * High-altitude cloud field built from billboard puff clusters.
 *
 * Using one instanced mesh keeps draw calls low while the clustered layout
 * produces a more believable silhouette than a handful of giant sprites.
 */
export class CloudSystem {
  /** Root node added to the scene. */
  readonly group: THREE.Group;

  private readonly camera: THREE.Camera;
  private readonly mesh: THREE.InstancedMesh;
  private readonly material: THREE.ShaderMaterial;
  private readonly clusters: CloudCluster[];
  private readonly dummy: THREE.Object3D;

  constructor(cloudTexture: THREE.Texture, camera: THREE.Camera) {
    this.group = new THREE.Group();
    this.camera = camera;
    this.clusters = [];
    this.dummy = new THREE.Object3D();

    cloudTexture.colorSpace = THREE.SRGBColorSpace;
    cloudTexture.anisotropy = 4;

    const totalInstanceCount = CLOUD_CONFIG.LAYERS.reduce(
      (count, layer) => count + layer.clusterCount * layer.particlesPerCluster,
      0,
    );

    const geometry = new THREE.PlaneGeometry(1, 1, 1, 1);
    const rotationAttribute = new Float32Array(totalInstanceCount);
    const densityAttribute = new Float32Array(totalInstanceCount);
    const opacityAttribute = new Float32Array(totalInstanceCount);

    geometry.setAttribute('aRotation', new THREE.InstancedBufferAttribute(rotationAttribute, 1));
    geometry.setAttribute('aDensity', new THREE.InstancedBufferAttribute(densityAttribute, 1));
    geometry.setAttribute('aOpacity', new THREE.InstancedBufferAttribute(opacityAttribute, 1));

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: cloudTexture },
        uCameraRight: { value: new THREE.Vector3(1, 0, 0) },
        uCameraUp: { value: new THREE.Vector3(0, 1, 0) },
        uHighlightColor: { value: new THREE.Color(CLOUD_CONFIG.COLOR_HIGHLIGHT_DAY) },
        uBaseColor: { value: new THREE.Color(CLOUD_CONFIG.COLOR_BASE_DAY) },
        uShadowColor: { value: new THREE.Color(CLOUD_CONFIG.COLOR_SHADOW_DAY) },
        uGlobalOpacity: { value: CLOUD_CONFIG.OPACITY_DAY },
      },
      vertexShader: CLOUD_VERTEX_SHADER,
      fragmentShader: CLOUD_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide,
    });
    this.material.toneMapped = true;

    this.mesh = new THREE.InstancedMesh(geometry, this.material, totalInstanceCount);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    this.buildCloudClusters(
      rotationAttribute,
      densityAttribute,
      opacityAttribute,
    );

    this.group.add(this.mesh);
    this.updateBillboards();
  }

  /**
   * Updates cluster drift, appearance and billboard basis.
   *
   * @param delta - Frame delta in seconds.
   * @param phase - Current day phase.
   * @param blend - Blend factor into the next phase.
   */
  update(delta: number, phase: DayPhase, blend: number): void {
    this.updateAppearance(phase, blend);
    this.updateClusterPositions(delta);
    this.updateBillboards();
  }

  /** Releases GPU resources. */
  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }

  private buildCloudClusters(
    rotationAttribute: Float32Array,
    densityAttribute: Float32Array,
    opacityAttribute: Float32Array,
  ): void {
    let instanceIndex = 0;

    for (const layer of CLOUD_CONFIG.LAYERS) {
      const centerAnchorCount = 'centerAnchorCount' in layer ? layer.centerAnchorCount : 0;

      for (let clusterIndex = 0; clusterIndex < layer.clusterCount; clusterIndex++) {
        const isCenterAnchor = clusterIndex < centerAnchorCount;
        const orbitRadius = isCenterAnchor
          ? THREE.MathUtils.randFloat(0, layer.orbitRadiusMax * 0.18)
          : THREE.MathUtils.randFloat(layer.orbitRadiusMin, layer.orbitRadiusMax);
        const azimuth = isCenterAnchor
          ? (clusterIndex / Math.max(1, centerAnchorCount)) * TAU + THREE.MathUtils.randFloatSpread(0.22)
          : Math.random() * TAU;
        const anchor = new THREE.Vector3(
          Math.cos(azimuth) * orbitRadius,
          THREE.MathUtils.randFloat(layer.heightMin, layer.heightMax),
          Math.sin(azimuth) * orbitRadius,
        );

        const driftSpeed = THREE.MathUtils.randFloat(layer.driftSpeedMin, layer.driftSpeedMax);
        const driftAngle = CLOUD_CONFIG.WIND_DIRECTION + (Math.random() - 0.5) * layer.windVariance;
        const heading = Math.random() * Math.PI * 2;
        const headingSin = Math.sin(heading);
        const headingCos = Math.cos(heading);
        const clusterLength = THREE.MathUtils.randFloat(layer.clusterLengthMin, layer.clusterLengthMax);
        const clusterDepth = THREE.MathUtils.randFloat(layer.clusterDepthMin, layer.clusterDepthMax);
        const clusterHeight = THREE.MathUtils.randFloat(layer.clusterHeightMin, layer.clusterHeightMax);
        const particleStepDenominator = Math.max(1, layer.particlesPerCluster - 1);

        const puffs: CloudPuff[] = [];
        for (let puffIndex = 0; puffIndex < layer.particlesPerCluster; puffIndex++) {
          const t = puffIndex / particleStepDenominator;
          const strand = (t - 0.5) * clusterLength;
          const radial = THREE.MathUtils.randFloat(0, clusterDepth);
          const lateral = (Math.random() - 0.5) * clusterDepth;
          const lift = Math.sin(t * Math.PI) * clusterHeight;
          const randomAngle = Math.random() * Math.PI * 2;
          const randomX = Math.cos(randomAngle) * radial * 0.38;
          const randomZ = Math.sin(randomAngle) * radial * 0.55;

          const localX = (strand + randomX) * headingCos - (lateral + randomZ) * headingSin;
          const localZ = (strand + randomX) * headingSin + (lateral + randomZ) * headingCos;
          const localY = lift + THREE.MathUtils.randFloatSpread(clusterHeight * 0.45);

          const scale = THREE.MathUtils.randFloat(layer.puffSizeMin, layer.puffSizeMax);
          const stretch = THREE.MathUtils.randFloat(layer.stretchMin, layer.stretchMax);
          const density = clamp(
            0.35 + Math.sin(t * Math.PI) * 0.55 + Math.random() * 0.15,
            0,
            1,
          );

          rotationAttribute[instanceIndex] = THREE.MathUtils.randFloatSpread(0.45);
          densityAttribute[instanceIndex] = density;
          opacityAttribute[instanceIndex] = THREE.MathUtils.randFloat(
            layer.opacityMin,
            layer.opacityMax,
          );

          puffs.push({
            instanceIndex,
            localX,
            localY,
            localZ,
            scaleX: scale,
            scaleY: scale * stretch,
          });

          instanceIndex++;
        }

        this.clusters.push({
          anchor,
          velocityX: Math.cos(driftAngle) * driftSpeed,
          velocityZ: Math.sin(driftAngle) * driftSpeed,
          wrapRadius: layer.wrapRadius,
          puffs,
        });
      }
    }

    const densityAttr = this.mesh.geometry.getAttribute('aDensity');
    const opacityAttr = this.mesh.geometry.getAttribute('aOpacity');
    const rotationAttr = this.mesh.geometry.getAttribute('aRotation');
    densityAttr.needsUpdate = true;
    opacityAttr.needsUpdate = true;
    rotationAttr.needsUpdate = true;
  }

  private updateClusterPositions(delta: number): void {
    for (const cluster of this.clusters) {
      cluster.anchor.x += cluster.velocityX * delta;
      cluster.anchor.z += cluster.velocityZ * delta;

      if (Math.hypot(cluster.anchor.x, cluster.anchor.z) > cluster.wrapRadius) {
        cluster.anchor.x = -cluster.anchor.x * 0.82;
        cluster.anchor.z = -cluster.anchor.z * 0.82;
      }
    }
  }

  private updateBillboards(): void {
    const rightUniform = this.material.uniforms.uCameraRight.value as THREE.Vector3;
    const upUniform = this.material.uniforms.uCameraUp.value as THREE.Vector3;
    const cameraMatrix = this.camera.matrixWorld.elements;

    rightUniform.set(cameraMatrix[0], cameraMatrix[1], cameraMatrix[2]).normalize();
    upUniform.set(cameraMatrix[4], cameraMatrix[5], cameraMatrix[6]).normalize();

    for (const cluster of this.clusters) {
      for (const puff of cluster.puffs) {
        this.dummy.position.set(
          cluster.anchor.x + puff.localX,
          cluster.anchor.y + puff.localY,
          cluster.anchor.z + puff.localZ,
        );
        this.dummy.scale.set(puff.scaleX, puff.scaleY, 1);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(puff.instanceIndex, this.dummy.matrix);
      }
    }

    this.mesh.instanceMatrix.needsUpdate = true;
  }

  private updateAppearance(phase: DayPhase, blend: number): void {
    const appearance = this.resolveAppearance(phase, blend);
    (this.material.uniforms.uHighlightColor.value as THREE.Color).copy(appearance.highlightColor);
    (this.material.uniforms.uBaseColor.value as THREE.Color).copy(appearance.baseColor);
    (this.material.uniforms.uShadowColor.value as THREE.Color).copy(appearance.shadowColor);
    this.material.uniforms.uGlobalOpacity.value = appearance.opacity;
  }

  private resolveAppearance(phase: DayPhase, blend: number): CloudAppearance {
    const {
      COLOR_HIGHLIGHT_DAWN,
      COLOR_HIGHLIGHT_MORNING,
      COLOR_HIGHLIGHT_DAY,
      COLOR_HIGHLIGHT_SUNSET,
      COLOR_HIGHLIGHT_EVENING,
      COLOR_HIGHLIGHT_NIGHT,
      COLOR_BASE_DAWN,
      COLOR_BASE_MORNING,
      COLOR_BASE_DAY,
      COLOR_BASE_SUNSET,
      COLOR_BASE_EVENING,
      COLOR_BASE_NIGHT,
      COLOR_SHADOW_DAWN,
      COLOR_SHADOW_MORNING,
      COLOR_SHADOW_DAY,
      COLOR_SHADOW_SUNSET,
      COLOR_SHADOW_EVENING,
      COLOR_SHADOW_NIGHT,
      OPACITY_DAWN,
      OPACITY_MORNING,
      OPACITY_DAY,
      OPACITY_SUNSET,
      OPACITY_EVENING,
      OPACITY_NIGHT,
    } = CLOUD_CONFIG;

    let highlightA: number = COLOR_HIGHLIGHT_DAY;
    let highlightB: number = COLOR_HIGHLIGHT_DAY;
    let baseA: number = COLOR_BASE_DAY;
    let baseB: number = COLOR_BASE_DAY;
    let shadowA: number = COLOR_SHADOW_DAY;
    let shadowB: number = COLOR_SHADOW_DAY;
    let opacityA: number = OPACITY_DAY;
    let opacityB: number = OPACITY_DAY;

    switch (phase) {
      case 'dawn':
        highlightA = COLOR_HIGHLIGHT_NIGHT;
        highlightB = COLOR_HIGHLIGHT_DAWN;
        baseA = COLOR_BASE_NIGHT;
        baseB = COLOR_BASE_DAWN;
        shadowA = COLOR_SHADOW_NIGHT;
        shadowB = COLOR_SHADOW_DAWN;
        opacityA = OPACITY_NIGHT;
        opacityB = OPACITY_DAWN;
        break;
      case 'morning':
        highlightA = COLOR_HIGHLIGHT_DAWN;
        highlightB = COLOR_HIGHLIGHT_MORNING;
        baseA = COLOR_BASE_DAWN;
        baseB = COLOR_BASE_MORNING;
        shadowA = COLOR_SHADOW_DAWN;
        shadowB = COLOR_SHADOW_MORNING;
        opacityA = OPACITY_DAWN;
        opacityB = OPACITY_MORNING;
        break;
      case 'day':
        highlightA = COLOR_HIGHLIGHT_MORNING;
        highlightB = COLOR_HIGHLIGHT_DAY;
        baseA = COLOR_BASE_MORNING;
        baseB = COLOR_BASE_DAY;
        shadowA = COLOR_SHADOW_MORNING;
        shadowB = COLOR_SHADOW_DAY;
        opacityA = OPACITY_MORNING;
        opacityB = OPACITY_DAY;
        break;
      case 'sunset':
        highlightA = COLOR_HIGHLIGHT_DAY;
        highlightB = COLOR_HIGHLIGHT_SUNSET;
        baseA = COLOR_BASE_DAY;
        baseB = COLOR_BASE_SUNSET;
        shadowA = COLOR_SHADOW_DAY;
        shadowB = COLOR_SHADOW_SUNSET;
        opacityA = OPACITY_DAY;
        opacityB = OPACITY_SUNSET;
        break;
      case 'evening':
        highlightA = COLOR_HIGHLIGHT_SUNSET;
        highlightB = COLOR_HIGHLIGHT_EVENING;
        baseA = COLOR_BASE_SUNSET;
        baseB = COLOR_BASE_EVENING;
        shadowA = COLOR_SHADOW_SUNSET;
        shadowB = COLOR_SHADOW_EVENING;
        opacityA = OPACITY_SUNSET;
        opacityB = OPACITY_EVENING;
        break;
      case 'night':
        highlightA = COLOR_HIGHLIGHT_EVENING;
        highlightB = COLOR_HIGHLIGHT_NIGHT;
        baseA = COLOR_BASE_EVENING;
        baseB = COLOR_BASE_NIGHT;
        shadowA = COLOR_SHADOW_EVENING;
        shadowB = COLOR_SHADOW_NIGHT;
        opacityA = OPACITY_EVENING;
        opacityB = OPACITY_NIGHT;
        break;
      default:
        break;
    }

    _colorA.setHex(highlightA).lerp(_colorD.setHex(highlightB), blend);
    _colorB.setHex(baseA).lerp(_colorE.setHex(baseB), blend);
    _colorC.setHex(shadowA).lerp(_colorF.setHex(shadowB), blend);

    return {
      highlightColor: _colorA,
      baseColor: _colorB,
      shadowColor: _colorC,
      opacity: clamp(lerp(opacityA, opacityB, blend), 0, 1),
    };
  }
}
