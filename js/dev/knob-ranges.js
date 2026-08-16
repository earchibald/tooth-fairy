// Slider ranges for the Workshop and Hoard tabs. DOM-free on purpose: the
// agent-pack generator imports these to publish min/max alongside each knob.

export const WORKSHOP_KNOBS = [
  { title: 'tap pop', preview: 'tap', rows: [
    { path: ['juice', 'tapPop', 'scale'], min: 0.9, max: 1.8, step: 0.01 },
    { path: ['juice', 'tapPop', 'ms'], min: 40, max: 500, step: 5 },
  ] },
  { title: 'tap glow', preview: 'tap', rows: [
    { path: ['juice', 'tapGlow', 'size'], min: 0, max: 60, step: 1 },
    { path: ['juice', 'tapGlow', 'alpha'], min: 0, max: 1, step: 0.01 },
    { path: ['juice', 'tapGlow', 'ms'], min: 60, max: 1200, step: 10 },
  ] },
  { title: 'tap sparks', preview: 'tap', rows: [
    { path: ['juice', 'tapSparks', 'count'], min: 0, max: 40, step: 1 },
    { path: ['juice', 'tapSparks', 'size'], min: 0.5, max: 8, step: 0.1 },
    { path: ['juice', 'tapSparks', 'spreadPx'], min: 6, max: 120, step: 2 },
    { path: ['juice', 'tapSparks', 'lifeMs'], min: 100, max: 2000, step: 20 },
  ] },
  { title: 'incoming teeth', preview: 'flowShort', rows: [
    { path: ['juice', 'inbound', 'glowSize'], min: 0, max: 40, step: 1 },
    { path: ['juice', 'inbound', 'glowAlpha'], min: 0, max: 1, step: 0.01 },
    { path: ['juice', 'inbound', 'trailPerS'], min: 0, max: 60, step: 1 },
    { path: ['juice', 'inbound', 'trailLife'], min: 100, max: 2000, step: 20 },
  ] },
  { title: 'landing', preview: 'flowShort', rows: [
    { path: ['juice', 'landSparks', 'count'], min: 0, max: 40, step: 1 },
    { path: ['juice', 'landSparks', 'size'], min: 0.5, max: 8, step: 0.1 },
    { path: ['juice', 'landSparks', 'lifeMs'], min: 100, max: 2000, step: 20 },
  ] },
  { title: 'powerup sweep', preview: 'buy', rows: [
    { path: ['juice', 'buySweep', 'alpha'], min: 0, max: 1, step: 0.01 },
    { path: ['juice', 'buySweep', 'ms'], min: 200, max: 2500, step: 50 },
  ] },
  { title: 'scale ramp', preview: 'flowShort', rows: [
    { path: ['juice', 'ramp', 'rateLo'], min: 1, max: 10000, step: 1 },
    { path: ['juice', 'ramp', 'rateHi'], min: 1e6, max: 1e12, step: 1e6 },
    { path: ['juice', 'ramp', 'sizeHi'], min: 1, max: 4, step: 0.05 },
    { path: ['juice', 'ramp', 'glowHi'], min: 1, max: 6, step: 0.05 },
    { path: ['juice', 'ramp', 'trailHi'], min: 1, max: 8, step: 0.05 },
    { path: ['juice', 'ramp', 'scrollHi'], min: 1, max: 10, step: 0.1 },
  ] },
];

export const HOARD_SHARED_KNOBS = [
  { path: ['hoard', 'alpha'], min: 0, max: 1, step: 0.01 },
  { path: ['hoard', 'glintPerS'], min: 0, max: 10, step: 0.1 },
  { path: ['hoard', 'centerGapPx'], min: 40, max: 160, step: 2 },
  { path: ['hoard', 'stageScale'], min: 0.5, max: 5, step: 0.1 },
  { path: ['hoard', 'stageAlpha'], min: 0, max: 1, step: 0.01 },
];
