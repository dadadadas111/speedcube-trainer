/**
 * EOLR, drilled the same way CMLL is: on the virtual cube, one case after
 * another, with the cube in your hands only supplying turns.
 *
 * EOLR is 4a and 4b taken together — orient the six edges and place UL and UR
 * — so "done" is both stage tests passing at once rather than a solved cube.
 * The last slice is 4c and is somebody else's drill.
 *
 * Unlike CMLL this step IS the M slice, so the centres move while you work and
 * the cube you are shown will not keep the colour you started on top. That is
 * not a display fault to be corrected; reading EO against a drifted centre is
 * the skill.
 */

import { ROTATIONS_WITH_AUF, ROUX_STAGES } from './method';
import { applyMoves, cloneState, SOLVED_STATE, type CubeState } from '../cube/cube';
import { randomLseCase, solveLse } from './solver/lse';

const EO_TEST = ROUX_STAGES.find((s) => s.key === 'EO')!.test;
const LR_TEST = ROUX_STAGES.find((s) => s.key === 'LR')!.test;

/**
 * The six edges oriented and UL/UR placed, in any frame and at any AUF.
 *
 * Both tests have to agree in the SAME frame: orientation read one way round
 * and placement read another would pass pairs of states that are finished in
 * neither sense.
 */
export function eolrDone(state: CubeState): boolean {
  return ROTATIONS_WITH_AUF.some((rot) => EO_TEST(state, rot) && LR_TEST(state, rot));
}

/**
 * The six edges LSE is read from, by sticker.
 *
 * From the cube's own geometry: UF is U7/F19, UB U1/B46, UL U3/L37, UR U5/R10,
 * DF F25/D28 and DB D34/B52. The corners are absent because EOLR does not look
 * at them, and the centres are present because with the slice moving they are
 * what orientation is judged against.
 */
export const LSE_EDGE_FACELETS = [7, 19, 1, 46, 3, 37, 5, 10, 25, 28, 34, 52, 4, 31];

export interface DealtEolr {
  state: CubeState;
  /** Fewest M/U turns to finish it, for scoring against your own solution */
  best: number;
}

/** A case between the solver's usual bands, placed on a solved cube. */
export function dealEolr(): DealtEolr | null {
  for (let i = 0; i < 8; i++) {
    const c = randomLseCase('eolr');
    if (!c?.setup?.length) continue;
    const state = applyMoves(cloneState(SOLVED_STATE), c.setup);
    if (eolrDone(state)) continue; // nothing to practise
    if (!solveLse(c.setup, 'eolr')) continue;
    return { state, best: c.best };
  }
  return null;
}
