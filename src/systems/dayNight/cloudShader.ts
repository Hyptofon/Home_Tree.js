/**
 * @fileoverview GLSL shaders for instanced billboard cloud clusters.
 *
 * Clouds are rendered as camera-facing quads with a shared alpha texture and
 * phase-driven tinting. This keeps the system to a single draw call while
 * allowing softer, more photographic cloud volumes than simple sprites.
 */

export const CLOUD_VERTEX_SHADER = /* glsl */ `
attribute float aRotation;
attribute float aDensity;
attribute float aOpacity;

uniform vec3 uCameraRight;
uniform vec3 uCameraUp;

varying vec2 vUv;
varying float vDensity;
varying float vOpacity;
varying float vNearFade;

void main() {
  vUv = uv;
  vDensity = aDensity;
  vOpacity = aOpacity;

  mat4 worldMatrix = modelMatrix * instanceMatrix;
  vec4 worldCenter = worldMatrix * vec4(0.0, 0.0, 0.0, 1.0);

  float scaleX = length(worldMatrix[0].xyz);
  float scaleY = length(worldMatrix[1].xyz);

  vec2 plane = position.xy;
  float rotationSin = sin(aRotation);
  float rotationCos = cos(aRotation);
  plane = mat2(rotationCos, -rotationSin, rotationSin, rotationCos) * plane;

  vec3 worldPosition = worldCenter.xyz
    + uCameraRight * plane.x * scaleX
    + uCameraUp * plane.y * scaleY;

  vec4 mvPosition = viewMatrix * vec4(worldPosition, 1.0);
  vNearFade = smoothstep(140.0, 320.0, -mvPosition.z);

  gl_Position = projectionMatrix * mvPosition;
}
`;

export const CLOUD_FRAGMENT_SHADER = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uHighlightColor;
uniform vec3 uBaseColor;
uniform vec3 uShadowColor;
uniform float uGlobalOpacity;

varying vec2 vUv;
varying float vDensity;
varying float vOpacity;
varying float vNearFade;

void main() {
  vec4 texel = texture2D(uMap, vUv);
  float alphaMask = texel.a;
  if (alphaMask < 0.01 || vNearFade < 0.01) {
    discard;
  }

  float topLight = smoothstep(0.22, 0.96, vUv.y);
  float edgeLift = smoothstep(0.18, 0.82, texel.r);
  float density = clamp(vDensity, 0.0, 1.0);

  vec3 color = mix(uShadowColor, uBaseColor, topLight);
  color = mix(color, uHighlightColor, edgeLift * 0.42 + topLight * 0.18);
  color = mix(color, uShadowColor, (1.0 - topLight) * (1.0 - density) * 0.48);
  color *= mix(0.86, 1.04, density);

  float alpha = alphaMask * vOpacity * uGlobalOpacity * vNearFade;
  alpha *= mix(0.92, 1.08, density);

  if (alpha < 0.02) {
    discard;
  }

  gl_FragColor = vec4(color, alpha);
}
`;
