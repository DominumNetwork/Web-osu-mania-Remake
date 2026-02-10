import { SettingsState, SkinPreset, GameMode } from './types';

export const OSU_WIDTH = 512;
export const OSU_HEIGHT = 384;

export const SKIN_PRESETS: SkinPreset[] = [
  {
    id: 'classic',
    name: 'Classic Circles',
    hitObjectShape: 'circle',
    standardColor: '#ff66aa',
    maniaColors: ['#60a5fa', '#ffffff', '#60a5fa', '#f472b6', '#60a5fa', '#ffffff', '#60a5fa'],
    judgementColors: { Marvelous: '#ffffff', Perfect: '#fbbf24', Great: '#4ade80', Good: '#60a5fa', Bad: '#a855f7', Miss: '#ef4444' },
    uiTheme: 'glass'
  },
  {
    id: 'bars',
    name: 'Classic Bars',
    hitObjectShape: 'bar',
    standardColor: '#ff66aa',
    maniaColors: ['#ffffff', '#60a5fa', '#ffffff', '#f472b6', '#ffffff', '#60a5fa', '#ffffff'],
    judgementColors: { Marvelous: '#ffffff', Perfect: '#fbbf24', Great: '#4ade80', Good: '#60a5fa', Bad: '#a855f7', Miss: '#ef4444' },
    uiTheme: 'dark'
  },
  {
    id: 'diamond',
    name: 'Neon Diamonds',
    hitObjectShape: 'diamond',
    standardColor: '#00ffff',
    maniaColors: ['#00ffff', '#ff00ff', '#00ffff', '#ff00ff', '#00ffff', '#ff00ff', '#00ffff'],
    judgementColors: { Marvelous: '#ffffff', Perfect: '#00ffff', Great: '#00ff00', Good: '#ffff00', Bad: '#ff00ff', Miss: '#ff0000' },
    uiTheme: 'neon'
  },
  {
    id: 'diamond-soft',
    name: 'Soft Diamonds',
    hitObjectShape: 'diamond-soft',
    standardColor: '#f9a8d4',
    maniaColors: ['#f9a8d4', '#818cf8', '#f9a8d4', '#818cf8', '#f9a8d4', '#818cf8', '#f9a8d4'],
    judgementColors: { Marvelous: '#fff', Perfect: '#fcd34d', Great: '#86efac', Good: '#93c5fd', Bad: '#c4b5fd', Miss: '#fca5a5' },
    uiTheme: 'glass'
  },
  {
    id: 'arrows',
    name: 'Arrows',
    hitObjectShape: 'arrow',
    standardColor: '#ff66aa',
    maniaColors: ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#ef4444', '#3b82f6', '#22c55e'],
    judgementColors: { Marvelous: '#ffffff', Perfect: '#fbbf24', Great: '#4ade80', Good: '#60a5fa', Bad: '#a855f7', Miss: '#ef4444' },
    uiTheme: 'dark'
  }
];

export const DEFAULT_SETTINGS: SettingsState = {
  beatmapProvider: 'Mino',
  customProviderUrl: '',
  scrollSpeed: 22,
  useBeatmapScrollSpeed: false,
  laneWidth: 70,
  backgroundDim: 0.5,
  backgroundBlur: 0,
  showFps: true,
  activeSkinId: 'classic',
  noteStyle: 'circle',
  judgementSet: 'default',
  skinOverrides: {},
  volume: 0.5,
  mobileTouchEnabled: true,
  modifiers: {
      easy: false,
      noFail: false,
      halfTime: false,
      hardRock: false,
      suddenDeath: false,
      perfect: false,
      doubleTime: false,
      autoPlay: false,
      random: false,
      mirror: false,
      constantSpeed: false,
      holdOff: false,
      songSpeed: 1.0,
      accuracyOverride: false,
      hpDrainOverride: false,
      fadeIn: false,
      fadeOut: false
  },
  keybinds: {
    mania: {
      "1K": ['space'],
      "2K": ['f', 'j'],
      "3K": ['f', 'space', 'j'],
      "4K": ['d', 'f', 'j', 'k'],
      "5K": ['d', 'f', 'space', 'j', 'k'],
      "6K": ['s', 'd', 'f', 'j', 'k', 'l'],
      "7K": ['s', 'd', 'f', 'space', 'j', 'k', 'l'],
      "8K": ['a', 's', 'd', 'f', 'j', 'k', 'l', ';'],
      "9K": ['a', 's', 'd', 'f', 'space', 'j', 'k', 'l', ';'],
      "10K": ['a', 's', 'd', 'f', 'v', 'n', 'j', 'k', 'l', ';'],
    },
    global: { pause: 'Escape', restart: '`' },
  },
};

export const DEMO_BEATMAP_OSU = `osu file format v14
[General]
AudioFilename: audio.mp3
Mode: 3
[Metadata]
Title:Neon Nights (Demo)
Artist:OsuWeb
Creator:OsuWeb
Version:4K Standard
[Difficulty]
HPDrainRate:5
CircleSize:4
OverallDifficulty:7
ApproachRate:8
SliderMultiplier:1.4
[HitObjects]
64,192,1000,1,0:0:0:0:
192,192,1500,1,0:0:0:0:
320,192,2000,1,0:0:0:0:
448,192,2500,1,0:0:0:0:
64,192,3000,128,0,3500:0:0:0:0:
320,192,3500,1,0:0:0:0:
448,192,4000,1,0:0:0:0:
`;