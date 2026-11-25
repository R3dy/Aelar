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
    id: 'ambush', name: 'Ambush at the Bridge', obj: 'bandits', xp: 120, potions: 2,
    intro: ['Master Ryn', 'Smoke by the bridge! Bandits have slipped into the valley. Drive them out!'],
    steps: [{ ev: 'bandit', label: 'Defeat the straw bandits', need: 3 }],
    outro: ['Master Ryn', 'They fled, but they dropped the archway charms as they ran. Find all four.'],
  },
  {
    id: 'charms', name: 'Scattered Charms', obj: 'charm', xp: 100,
    steps: [{ ev: 'charm', label: "Find Ryn's spirit charms", need: 4 }],
    outro: ['Master Ryn', 'All four! Wait... do you feel that? The ground is shaking.'],
  },
  {
    id: 'sentinel', name: 'The Sentinel Wakes', obj: 'sentinel', xp: 200,
    intro: ['Master Ryn', 'The charms woke the archway\'s guardian, and it no longer knows you! Strike after it slams!'],
    steps: [
      { ev: 'sentinel', label: 'Defeat the Stone Sentinel' },
      { ev: 'blade', label: "Claim the Sentinel's blade" },
    ],
    outro: ['Master Ryn', 'You are ready, Aelar. Walk through the archway.'],
  },
  {
    id: 'ascend', name: 'Ascension', obj: 'arch', xp: 0,
    steps: [{ ev: 'arch', label: 'Walk through the archway' }],
  },
];

export function createQuests({ onStep, onQuestDone, onQuestStart, onChange }) {
  const st = { i: 0, done: QUESTS.map((q) => q.steps.map(() => false)), count: QUESTS.map((q) => q.steps.map(() => 0)), over: false };
  const cur = () => QUESTS[st.i];
  function event(ev) {
    if (st.over) return false;
    const q = cur();
    const k = q.steps.findIndex((s, j) => s.ev === ev && !st.done[st.i][j]);
    if (k < 0) return false;
    st.count[st.i][k]++;
    if (st.count[st.i][k] < (q.steps[k].need || 1)) { onChange?.(); return true; }
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
    count: (j) => st.count[st.i][j],
    isActive: (id) => !st.over && cur().id === id,
    reached: (id) => QUESTS.findIndex((q) => q.id === id) <= st.i,
  };
}
