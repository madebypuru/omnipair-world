// The page's start: the coast at sunset (src/scenes.js).
import { SCENE } from './scenes.js';

document.documentElement.dataset.scene = SCENE;
await import('./coast/main.js');
