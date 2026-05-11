import * as THREE from 'three';

import {
  HOUSE_RENDERING_CONFIG,
  HOUSE_TEXTURES,
} from '../architecturalHouseConfig.ts';
import { runBatched } from '../../../shared/async.ts';
import type {
  PbrTextureSet,
  WallpaperOption,
} from '../types.ts';

type TextureRole = 'color' | 'normal' | 'roughness' | 'ao' | 'height';

type MaterialBuildOptions = {
  readonly name: string;
  readonly textureSet: PbrTextureSet;
  readonly color?: THREE.ColorRepresentation;
  readonly metalness?: number;
  readonly envMapIntensity?: number;
  readonly bumpScale?: number;
};

/** Creates and caches PBR materials used by the architectural house. */
export class HouseMaterialFactory {
  private readonly loader = new THREE.TextureLoader();
  private readonly textureCache = new Map<string, THREE.Texture>();
  private readonly materialTextures = new Set<THREE.Texture>();
  private readonly baseMaterials = new Map<string, THREE.MeshStandardMaterial>();
  private readonly maxAnisotropy: number;

  /**
   * @param renderer - Renderer used to derive a safe anisotropy cap.
   */
  constructor(renderer: THREE.WebGLRenderer) {
    this.maxAnisotropy = Math.min(
      renderer.capabilities.getMaxAnisotropy(),
      HOUSE_RENDERING_CONFIG.TEXTURE_ANISOTROPY,
    );
  }

  /** Preloads every texture needed by static architecture and wallpaper UI. */
  async preload(): Promise<void> {
    const texturePaths = new Set<string>();

    for (const set of Object.values(HOUSE_TEXTURES.wallpapers)) {
      this.collectTexturePaths(set, texturePaths);
    }

    for (const set of Object.values(HOUSE_TEXTURES.surfaces)) {
      this.collectTexturePaths(set, texturePaths);
    }

    await runBatched(
      [...texturePaths],
      HOUSE_RENDERING_CONFIG.PRELOAD_TEXTURE_BATCH_SIZE,
      (path) => this.loadTexture(path, 'color'),
    );
    this.createBaseMaterials();
  }

  /**
   * Creates a new material instance for an individual zone mesh.
   *
   * @param materialId - Material id from config.
   * @param name - Debug name for the cloned material.
   */
  createZoneMaterial(materialId: string, name: string): THREE.MeshStandardMaterial {
    const isWallpaper = materialId in HOUSE_TEXTURES.wallpapers;
    const source = this.getBaseMaterial(isWallpaper ? `wallpaper:${materialId}` : `surface:${materialId}`);
    const material = source.clone();
    material.name = name;
    return material;
  }

  /**
   * Creates a cloned PBR material for a configured architectural surface.
   *
   * @param key - Surface key from the material config.
   * @param name - Debug name for the cloned material.
   */
  createSurfaceMaterial(
    key: keyof typeof HOUSE_TEXTURES.surfaces,
    name: string,
  ): THREE.MeshStandardMaterial {
    const source = this.getBaseMaterial(`surface:${key}`);
    const material = source.clone();
    material.name = name;
    return material;
  }

  /** Creates a warm architectural trim material. */
  createTrimMaterial(): THREE.MeshStandardMaterial {
    return this.createSurfaceMaterial('oak', 'OakBaseboard');
  }

  /** Creates a tinted physical glass material for window panes. */
  createGlassMaterial(name = 'ArchitecturalGlass'): THREE.MeshPhysicalMaterial {
    return new THREE.MeshPhysicalMaterial({
      name,
      color: 0xdcecff,
      roughness: 0.06,
      metalness: 0,
      transmission: 0.42,
      thickness: 0.08,
      transparent: true,
      opacity: 0.46,
      envMapIntensity: 1.35,
      side: THREE.DoubleSide,
    });
  }

  /** Creates a non-textured utility material for subtle exterior details. */
  createSolidMaterial(
    name: string,
    color: THREE.ColorRepresentation,
    roughness: number,
    metalness = 0,
  ): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      name,
      color,
      roughness,
      metalness,
      envMapIntensity: 0.48,
    });
  }

  /**
   * Returns UI data for the material picker.
   *
   * @param ids - Material ids allowed in a zone.
   */
  getMaterialOptions(ids: readonly string[]): WallpaperOption[] {
    return ids.map((id) => {
      const isWallpaper = id in HOUSE_TEXTURES.wallpapers;
      const definition = isWallpaper 
        ? HOUSE_TEXTURES.wallpapers[id as keyof typeof HOUSE_TEXTURES.wallpapers]
        : HOUSE_TEXTURES.surfaces[id as keyof typeof HOUSE_TEXTURES.surfaces];
      
      if (!definition) throw new Error(`Unknown material: ${id}`);
        
      return {
        id,
        label: definition.label,
        previewUrl: definition.color,
      };
    });
  }

  /** Releases every texture and base material owned by the factory. */
  dispose(): void {
    for (const material of this.baseMaterials.values()) {
      material.dispose();
    }

    for (const texture of this.materialTextures.values()) {
      texture.dispose();
    }

    for (const texture of this.textureCache.values()) {
      texture.dispose();
    }

    this.baseMaterials.clear();
    this.materialTextures.clear();
    this.textureCache.clear();
  }

  private createBaseMaterials(): void {
    for (const [id, textureSet] of Object.entries(HOUSE_TEXTURES.wallpapers)) {
      this.baseMaterials.set(
        `wallpaper:${id}`,
        this.createMaterialFromSet({
          name: `Wallpaper_${id}`,
          textureSet,
          metalness: 0,
          envMapIntensity: 0.34,
          bumpScale: 0.018,
        }),
      );
    }

    for (const [key, textureSet] of Object.entries(HOUSE_TEXTURES.surfaces)) {
      const metalness = key === 'bathTile' || key === 'terrazzo' ? 0.02 : 0;
      this.baseMaterials.set(
        `surface:${key}`,
        this.createMaterialFromSet({
          name: `Surface_${key}`,
          textureSet,
          metalness,
          envMapIntensity: 0.56,
          bumpScale: key.includes('Tile') || key === 'terrazzo' ? 0.012 : 0.02,
        }),
      );
    }
  }

  private createMaterialFromSet(options: MaterialBuildOptions): THREE.MeshStandardMaterial {
    const colorMap = this.getTexture(options.textureSet.color, 'color', options.textureSet.repeat);
    const normalMap = options.textureSet.normal
      ? this.getTexture(options.textureSet.normal, 'normal', options.textureSet.repeat)
      : null;
    const roughnessMap = options.textureSet.roughness
      ? this.getTexture(options.textureSet.roughness, 'roughness', options.textureSet.repeat)
      : null;
    const aoMap = options.textureSet.ao
      ? this.getTexture(options.textureSet.ao, 'ao', options.textureSet.repeat)
      : null;
    const bumpMap = HOUSE_RENDERING_CONFIG.USE_HEIGHT_MAPS && options.textureSet.height
      ? this.getTexture(options.textureSet.height, 'height', options.textureSet.repeat)
      : null;

    return new THREE.MeshStandardMaterial({
      name: options.name,
      map: colorMap,
      normalMap,
      roughnessMap,
      aoMap,
      bumpMap,
      bumpScale: options.bumpScale ?? 0.015,
      color: options.color ?? 0xffffff,
      roughness: options.textureSet.roughnessValue,
      metalness: options.metalness ?? 0,
      envMapIntensity: options.envMapIntensity ?? 0.5,
    });
  }

  private getTexture(
    path: string,
    role: TextureRole,
    repeat: readonly [number, number],
  ): THREE.Texture {
    const texture = this.textureCache.get(path);
    if (!texture) {
      console.warn(`Texture was not preloaded: ${path}, creating fallback texture`);
      return this.createFallbackTexture(role);
    }

    const materialTexture = texture.clone();
    materialTexture.name = `${path}:${repeat[0]}x${repeat[1]}:${role}`;
    materialTexture.colorSpace = role === 'color' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    materialTexture.wrapS = THREE.RepeatWrapping;
    materialTexture.wrapT = THREE.RepeatWrapping;
    materialTexture.repeat.set(repeat[0], repeat[1]);
    materialTexture.anisotropy = this.maxAnisotropy;
    materialTexture.needsUpdate = true;
    this.materialTextures.add(materialTexture);
    return materialTexture;
  }

  private async loadTexture(path: string, role: TextureRole): Promise<void> {
    if (this.textureCache.has(path)) return;

    const texture = await this.loader.loadAsync(path);
    texture.name = path;
    texture.colorSpace = role === 'color' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = this.maxAnisotropy;
    this.textureCache.set(path, texture);
  }

  private collectTexturePaths(textureSet: PbrTextureSet, target: Set<string>): void {
    target.add(textureSet.color);
    if (textureSet.normal) target.add(textureSet.normal);
    if (textureSet.roughness) target.add(textureSet.roughness);
    if (textureSet.ao) target.add(textureSet.ao);
    if (HOUSE_RENDERING_CONFIG.USE_HEIGHT_MAPS && textureSet.height) {
      target.add(textureSet.height);
    }
  }

  private getBaseMaterial(key: string): THREE.MeshStandardMaterial {
    const material = this.baseMaterials.get(key);
    if (!material) {
      throw new Error(`Missing house material: ${key}`);
    }

    return material;
  }

  private createFallbackTexture(role: TextureRole): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext('2d')!;

    switch (role) {
      case 'color':
        context.fillStyle = '#d0d0d0';
        context.fillRect(0, 0, 256, 256);
        break;
      case 'normal':
        context.fillStyle = '#8080ff';
        context.fillRect(0, 0, 256, 256);
        break;
      case 'roughness':
        context.fillStyle = '#808080';
        context.fillRect(0, 0, 256, 256);
        break;
      case 'ao':
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, 256, 256);
        break;
      case 'height':
        context.fillStyle = '#808080';
        context.fillRect(0, 0, 256, 256);
        break;
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.name = `fallback_${role}`;
    return texture;
  }
}
