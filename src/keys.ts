// Platform-aware modifier label for shortcut hints ("⌘C" on macOS, "Ctrl+C" elsewhere).
export const isMac = navigator.platform.toUpperCase().includes('MAC');
export const MOD = isMac ? '⌘' : 'Ctrl+';
