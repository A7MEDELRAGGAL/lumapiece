export const readJson = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
};

export const writeJson = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};

export const favorites = new Set(readJson('lumapiece-favorites', []));
export const customPuzzles = readJson('lumapiece-custom', []);
export const savedGames = () => readJson('lumapiece-progress', {});

const defaultSettings = { sound: true, volume: 0.7, guide: true, boardScale: 0.58, confetti: true, debug: false, reducedMotion: false };
export const appSettings = { ...defaultSettings, ...readJson('lumapiece-settings', {}) };
export const saveSettings = () => writeJson('lumapiece-settings', appSettings);
