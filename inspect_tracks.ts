import fs from 'fs';
import * as THREE from 'three';

// A naive hack to read GLB tracks without loading into full Three.js scene (which requires DOM)
// Actually we can just run node without DOM using a minimal GLTFLoader if we fake it.
// Or we can just read the JSON part of the GLB.
function parseGLBTracks(buffer: Buffer) {
  const magic = buffer.readUInt32LE(0);
  if (magic !== 0x46546C67) { throw new Error('Not a GLB'); }
  const length = buffer.readUInt32LE(8);
  
  const chunkLength = buffer.readUInt32LE(12);
  const chunkType = buffer.readUInt32LE(16);
  if (chunkType !== 0x4E4F534A) { throw new Error('First chunk not JSON'); }
  
  const jsonStr = buffer.toString('utf-8', 20, 20 + chunkLength);
  const json = JSON.parse(jsonStr);
  
  if (json.animations) {
    for (const anim of json.animations) {
      console.log('Animation:', anim.name);
      for (const channel of anim.channels) {
        const targetNode = json.nodes[channel.target.node];
        const path = channel.target.path;
        console.log(`  Target node: ${targetNode?.name || channel.target.node}, path: ${path}`);
      }
    }
  }
}

const file = fs.readFileSync('./public/animations/character/walking.glb');
parseGLBTracks(file);
