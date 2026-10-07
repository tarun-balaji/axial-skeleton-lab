import {cp,mkdir} from 'node:fs/promises';
await mkdir('public/assets',{recursive:true});
for(const [from,to] of [
 ['node_modules/three/build/three.min.js','three.min.js'],
 ['node_modules/three/examples/js/controls/OrbitControls.js','OrbitControls.js'],
 ['node_modules/three/examples/js/loaders/STLLoader.js','STLLoader.js'],
 ['node_modules/three/examples/js/loaders/GLTFLoader.js','GLTFLoader.js'],
 ['node_modules/jspdf/dist/jspdf.umd.min.js','jspdf.umd.min.js'],
 ['node_modules/three/LICENSE','THREE-LICENSE.txt'],
 ['node_modules/jspdf/LICENSE','JSPDF-LICENSE.txt']
])await cp(from,'public/assets/'+to);
console.log('Copied browser libraries into public/assets.');
