export enum GameMode {
  Mania = 3,
}

export type JudgementType = 'Marvelous' | 'Perfect' | 'Great' | 'Good' | 'Bad' | 'Miss';

export type BeatmapProvider = 'Mino' | 'NeriNyan' | 'Sayobot' | 'Custom';

export interface SkinPreset {
  id: string;
  name: string;
  hitObjectShape: 'circle' | 'diamond' | 'bar' | 'arrow' | 'diamond-soft' | 'line';
  standardColor: string;
  maniaColors: string[];
  judgementColors: Record<JudgementType, string>;
  uiTheme: 'dark' | 'neon' | 'glass';
}

export interface CustomSkinData {
    name: string;
    ini: {
        HitPosition: number;
        ScorePosition: number;
        ComboPosition: number;
        ColumnWidth: number;
        Colours: Record<string, string>;
    };
    images: Record<string, Blob>; 
}

export interface HitObject {
  x: number;
  y: number;
  time: number;
  type: number;
  hitSound: number;
  endTime?: number;
  column?: number;
}

export interface BeatmapData {
  id?: number;
  metadata: {
    title: string;
    artist: string;
    creator: string;
    version: string;
    beatmapId: string;
    background?: string;
  };
  difficulty: {
    hpDrainRate: number;
    circleSize: number;
    overallDifficulty: number;
    approachRate: number;
    sliderMultiplier: number;
    sliderTickRate: number;
  };
  hitObjects: HitObject[];
  audioFilename: string;
  backgroundFilename?: string;
  mode: GameMode;
  rawContent: string;
  favorite?: boolean;
  backgroundBlob?: Blob;
  audioBlob?: Blob;
}

export interface Modifiers {
    easy: boolean;
    noFail: boolean;
    halfTime: boolean;
    hardRock: boolean;
    suddenDeath: boolean;
    perfect: boolean;
    doubleTime: boolean;
    autoPlay: boolean;
    random: boolean;
    mirror: boolean;
    constantSpeed: boolean;
    holdOff: boolean;
    songSpeed: number;
    accuracyOverride: boolean;
    hpDrainOverride: boolean;
    fadeIn: boolean;
    fadeOut: boolean;
}

export interface SettingsState {
  beatmapProvider: BeatmapProvider;
  customProviderUrl: string;
  scrollSpeed: number;
  useBeatmapScrollSpeed: boolean;
  laneWidth: number;
  backgroundDim: number;
  backgroundBlur: number;
  showFps: boolean;
  activeSkinId: string;
  noteStyle: 'bar' | 'circle' | 'arrow' | 'diamond' | 'diamond-soft' | 'line'; 
  judgementSet: 'default' | 'flat' | 'neon';
  skinOverrides: {
      standardColor?: string;
      maniaColors?: string[];
      perKeyColors?: Record<string, string[]>;
  };
  modifiers: Modifiers;
  volume: number;
  mobileTouchEnabled: boolean;
  keybinds: {
    mania: Record<string, string[]>;
    global: { pause: string; restart: string };
  };
}

export interface GameScore {
  score: number;
  combo: number;
  maxCombo: number;
  accuracy: number;
  hits: Record<JudgementType, number>;
}

export interface ExportOptions {
    beatmaps: boolean;
    keybinds: boolean;
    skins: boolean;
    settings: boolean;
}