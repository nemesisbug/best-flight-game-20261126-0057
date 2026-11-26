// SKYPOST — Island Courier. Shared constants: world size, palette, flight
// tuning and the three sorties. Every magic number the game flies by lives
// here so a balance pass touches one file.
export const WORLD = {
  size: 6000,
  seaLevel: 0,
  seed: 7,
  // The plane starts parked on Coral Strip, nose pointing north (-z).
  startX: 0,
  startZ: 900,
  startHeading: 0,
};

export const PALETTE = {
  skyTop: '#2f6fb4',
  skyMid: '#7fb2dd',
  skyHorizon: '#cfe6f2',
  sunCore: '#fff3c4',
  sunGlow: '#ffd97a',
  seaDeep: '#14557e',
  seaShallow: '#2f8fb5',
  sand: '#e8d9a0',
  grass: '#5d9b4a',
  meadow: '#79b264',
  rock: '#8a7f72',
  snow: '#f2f5f7',
  forest: '#3e7d3a',
  runway: '#3a3f46',
  runwayLine: '#f5f2e4',
  ringGold: '#ffc93c',
  ringGlow: '#ffdf7e',
  planeCream: '#f6ead2',
  planeRed: '#c8442c',
  planeTeal: '#1f6f6b',
  hudInk: '#eaf6ff',
  hudDim: '#9fc4dc',
  hudAmber: '#ffc93c',
  hudDanger: '#ff5a4e',
  hudGood: '#7ee2a0',
};

// Arcade flight tuning. Speeds in metres per second, angles in radians.
export const FLIGHT = {
  maxSpeed: 96,
  cruiseSpeed: 62,
  stallSpeed: 30,
  minFlySpeed: 26,
  takeoffSpeed: 34,
  accel: 26,
  drag: 0.055,
  pitchRate: 0.85,
  pitchMax: 0.55,
  bankRate: 1.5,
  bankMax: 1.05,
  turnFactor: 0.62,
  gravity: 9.8,
  sinkOnStall: 14,
  fuelBurnIdle: 0.12,
  fuelBurnFull: 0.62,
  fuelCapacity: 100,
  damageHardLanding: 34,
  damageScrape: 18,
  gearHeight: 1.6,
  propSpin: 42,
};

// Runways are flat pads carved into the terrain. x/z are the centre, w the
// width, len the length, heading the runway direction in radians (0 = north).
export const RUNWAYS = [
  { id: 'coral', name: 'Coral Strip', x: 0, z: 900, w: 26, len: 320, heading: 0, height: 6 },
  { id: 'palm', name: 'Palm Strip', x: -1150, z: -750, w: 24, len: 300, heading: 0.5, height: 8 },
  { id: 'light', name: 'Lighthouse Strip', x: 1250, z: -1050, w: 24, len: 300, heading: -0.4, height: 10 },
];

// Golden rings hang in the sky; flying through one scores and chimes.
// `heading` is the direction a pilot flies when threading the ring, so the
// hoop faces the approach: r1-r3 run north-west out of Coral Strip, r4-r5
// east across the bays, r6 far north.
export const RINGS = [
  { id: 'r1', x: 0, z: 420, y: 95, r: 16, heading: 0 },
  { id: 'r2', x: -260, z: -40, y: 120, r: 16, heading: -0.51 },
  { id: 'r3', x: -720, z: -520, y: 110, r: 16, heading: -0.76 },
  { id: 'r4', x: 420, z: -420, y: 135, r: 16, heading: 0.46 },
  { id: 'r5', x: 900, z: -820, y: 120, r: 16, heading: 0.88 },
  { id: 'r6', x: 150, z: -1250, y: 150, r: 18, heading: 0.09 },
];

// Islands are gaussian hills on the sea floor. r is the radius in metres,
// h the peak height, trees how many palm clusters dot the slopes.
export const ISLANDS = [
  { x: 0, z: 900, r: 620, h: 52, trees: 46 },
  { x: -1150, z: -750, r: 560, h: 64, trees: 52 },
  { x: 1250, z: -1050, r: 600, h: 78, trees: 40 },
  { x: 620, z: 1900, r: 420, h: 34, trees: 30 },
  { x: -1650, z: 1150, r: 380, h: 44, trees: 26 },
  { x: 1900, z: 700, r: 330, h: 30, trees: 18 },
  { x: -400, z: -1750, r: 430, h: 58, trees: 24 },
];

// The three sorties. Each is a list of objectives the mission engine walks
// through in order; landing objectives name the runway to set down on.
export const MISSIONS = [
  {
    id: 'first-light',
    name: 'First Light',
    tagline: 'Ring run at dawn — thread six golden rings, then bring her home.',
    difficulty: 'Easy',
    wind: 0.0,
    fuelStart: 100,
    objectives: [
      { kind: 'takeoff', label: 'Take off from Coral Strip' },
      { kind: 'ring', ring: 'r1', label: 'Fly through Ring 1' },
      { kind: 'ring', ring: 'r2', label: 'Fly through Ring 2' },
      { kind: 'ring', ring: 'r3', label: 'Fly through Ring 3' },
      { kind: 'land', runway: 'coral', label: 'Land back on Coral Strip' },
    ],
  },
  {
    id: 'island-hop',
    name: 'Island Hop',
    tagline: 'The mail run — two island strips, two parcels, one tank of fuel.',
    difficulty: 'Medium',
    wind: 0.25,
    fuelStart: 100,
    objectives: [
      { kind: 'takeoff', label: 'Take off from Coral Strip' },
      { kind: 'ring', ring: 'r4', label: 'Thread Ring 4 on the way out' },
      { kind: 'land', runway: 'palm', label: 'Land on Palm Strip — drop Parcel 1' },
      { kind: 'takeoff', label: 'Take off again from Palm Strip' },
      { kind: 'ring', ring: 'r5', label: 'Thread Ring 5 over the east bay' },
      { kind: 'land', runway: 'light', label: 'Land on Lighthouse Strip — drop Parcel 2' },
    ],
  },
  {
    id: 'storm-mail',
    name: 'Storm Mail',
    tagline: 'A squall is coming in. Six rings, low fuel, and a crosswind landing.',
    difficulty: 'Hard',
    wind: 0.6,
    fuelStart: 62,
    objectives: [
      { kind: 'takeoff', label: 'Take off from Coral Strip' },
      { kind: 'ring', ring: 'r1', label: 'Fly through Ring 1' },
      { kind: 'ring', ring: 'r6', label: 'Fly through Ring 6 — far north' },
      { kind: 'ring', ring: 'r5', label: 'Fly through Ring 5 — east bay' },
      { kind: 'ring', ring: 'r3', label: 'Fly through Ring 3 — west bay' },
      { kind: 'land', runway: 'coral', label: 'Land on Coral Strip in the crosswind' },
    ],
  },
];

export const SCORE = {
  ring: 500,
  landing: 800,
  takeoff: 150,
  timeBonusPerSecond: 12,
  fuelBonusPerUnit: 6,
  damagePenaltyPerPoint: 8,
  medalGold: 4200,
  medalSilver: 3200,
  medalBronze: 2200,
};
