// Quest chain: an ordered list of quests, each with steps that are advanced by game events.
// Only the current quest listens; finishing it pays its reward and starts the next one.

export const QUESTS = [
  {
    id: 'face', name: 'A Familiar Face', obj: 'ryn', xp: 20,
    steps: [{ ev: 'talk', label: 'Talk to Master Ryn' }],
  },
  {
    id: 'drill', name: 'The Drill', obj: 'dummies', xp: 60, unlockSlot: 5,
    intro: ['Master Ryn', 'Show me your blade first. Then your gifts. Then your feet.'],
    steps: [
      { ev: 'combo', label: 'Land a 3-hit combo' },
      { ev: 'ability', label: 'Hit a dummy with an ability' },
      { ev: 'dodge', label: 'Dodge the live dummy' },
    ],
    outro: ['Master Ryn', 'Well done. You have earned a new technique: Whirlwind.'],
  },
  {
    id: 'ascend', name: 'Ascension', obj: 'arch', xp: 0,
    intro: ['Master Ryn', 'Go now. The archway is waiting for you.'],
    steps: [{ ev: 'arch', label: 'Walk through the archway' }],
  },
];

export function createQuests({ onStep, onQuestDone, onQuestStart, onChange }) {
  const st = { i: 0, done: QUESTS.map((q) => q.steps.map(() => false)), over: false };
  const cur = () => QUESTS[st.i];
  function event(ev) {
    if (st.over) return false;
    const q = cur();
    const k = q.steps.findIndex((s, j) => s.ev === ev && !st.done[st.i][j]);
    if (k < 0) return false;
    st.done[st.i][k] = true;
    onStep?.(q, q.steps[k]);
    if (st.done[st.i].every(Boolean)) {
      const fin = q;
      onQuestDone?.(fin);
      if (st.i < QUESTS.length - 1) { st.i++; onQuestStart?.(cur()); } else st.over = true;
    }
    onChange?.();
    return true;
  }
  return {
    event,
    get current() { return cur(); },
    get index() { return st.i; },
    get over() { return st.over; },
    stepDone: (j) => st.done[st.i][j],
    isActive: (id) => !st.over && cur().id === id,
    reached: (id) => QUESTS.findIndex((q) => q.id === id) <= st.i,
  };
}
