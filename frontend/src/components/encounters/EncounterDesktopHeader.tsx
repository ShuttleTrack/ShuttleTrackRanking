import { ENCOUNTER_DESKTOP_GRID } from './encounterGrid';

const EncounterDesktopHeader = () => (
  <div
    className={`hidden md:grid ${ENCOUNTER_DESKTOP_GRID} px-4 pb-2 font-label text-xs font-bold uppercase tracking-widest text-on-surface-variant opacity-60`}
  >
    <span>Team 1</span>
    <span className="text-center">Score</span>
    <span>Team 2</span>
    <span className="text-center">Result</span>
    <span className="text-right">Points</span>
  </div>
);

export default EncounterDesktopHeader;
