/** Cube sticker colours, which double as the app's semantic palette. */

export const FACE_COLORS = ['#eef1f5', '#e0384f', '#17b26a', '#ffcf2e', '#ff7a1a', '#2f7ff2'];
export const FACE_LABELS = ['White', 'Red', 'Green', 'Yellow', 'Orange', 'Blue'];

/** Each solve step carries one cube-face colour, kept the same everywhere. */
export const STEP_COLORS: Record<string, string> = {
  // Roux
  FB: '#2f7ff2',
  SB: '#17b26a',
  CMLL: '#e0384f',
  EO: '#ffcf2e',
  LR: '#ff7a1a',
  L4C: '#eef1f5',
  // CFOP
  CROSS: '#eef1f5',
  F2L1: '#2f7ff2',
  F2L2: '#3f8ff5',
  F2L3: '#5c9ff7',
  F2L4: '#7ab0f9',
  OLL: '#ffcf2e',
  PLL: '#e0384f',
};

export function stepColor(key: string): string {
  return STEP_COLORS[key] ?? '#8697a9';
}

/**
 * The short name for a step, for places where the full label is too long to
 * read at a glance — the row under the ribbon, where what matters is the shape
 * of "FB 1.72  SB 2.65  CMLL 1.98" rather than the words.
 */
const SHORT_STEPS: Record<string, string> = {
  FB: 'FB',
  SB: 'SB',
  CMLL: 'CMLL',
  EO: '4a',
  LR: '4b',
  L4C: '4c',
  CROSS: 'Cross',
  F2L1: 'F2L1',
  F2L2: 'F2L2',
  F2L3: 'F2L3',
  F2L4: 'F2L4',
  OLL: 'OLL',
  PLL: 'PLL',
};

export function shortStep(key: string): string {
  return SHORT_STEPS[key] ?? key;
}
