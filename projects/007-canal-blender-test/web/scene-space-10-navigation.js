import { createNavigation as createGroundNavigation } from './scene-space-08-navigation.js';

// Reuse the verified collision/union algorithm, but require this build's actual
// generated ground metadata. Never silently fall back to the old house layout.
export function createNavigation(options={}) {
  if(!options.ground?.zones||!options.ground?.obstacles)
    throw new Error('SPACE10 navigation needs the generated neighbourhood.ground.navigation metadata.');
  return createGroundNavigation(options);
}
