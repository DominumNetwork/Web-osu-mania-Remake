import { BeatmapData, GameMode, HitObject } from '../types';

export const parseOsuFile = (content: string): BeatmapData => {
  const lines = content.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('//'));
  
  let section = '';
  const data: BeatmapData = {
    metadata: { title: 'Unknown', artist: 'Unknown', creator: 'Unknown', version: 'Normal', beatmapId: '0' },
    difficulty: { hpDrainRate: 5, circleSize: 5, overallDifficulty: 5, approachRate: 5, sliderMultiplier: 1.4, sliderTickRate: 1 },
    hitObjects: [],
    audioFilename: '',
    backgroundFilename: '',
    mode: GameMode.Mania,
    rawContent: content
  };

  for (const line of lines) {
    if (line.startsWith('[') && line.endsWith(']')) {
      section = line.slice(1, -1);
      continue;
    }

    if (section === 'General') {
      const [key, value] = line.split(':').map(s => s.trim());
      if (key === 'AudioFilename') data.audioFilename = value;
    } 
    else if (section === 'Metadata') {
      const [key, value] = line.split(':').map(s => s.trim());
      if (key === 'Title') data.metadata.title = value;
      if (key === 'Artist') data.metadata.artist = value;
      if (key === 'Creator') data.metadata.creator = value;
      if (key === 'Version') data.metadata.version = value;
    }
    else if (section === 'Difficulty') {
      const [key, value] = line.split(':').map(s => s.trim());
      if (key === 'HPDrainRate') data.difficulty.hpDrainRate = parseFloat(value);
      if (key === 'CircleSize') data.difficulty.circleSize = parseFloat(value);
      if (key === 'OverallDifficulty') data.difficulty.overallDifficulty = parseFloat(value);
      if (key === 'ApproachRate') data.difficulty.approachRate = parseFloat(value);
      if (key === 'SliderMultiplier') data.difficulty.sliderMultiplier = parseFloat(value);
    }
    else if (section === 'Events') {
      if (line.startsWith('0,0,') || line.startsWith('3,100,')) {
         const parts = line.split(',');
         if (parts.length >= 3) {
             let filename = parts[2].trim();
             if (filename.startsWith('"') && filename.endsWith('"')) {
                 filename = filename.slice(1, -1);
             }
             const ext = filename.split('.').pop()?.toLowerCase();
             if (['jpg', 'jpeg', 'png'].includes(ext || '')) {
                 data.backgroundFilename = filename;
             }
         }
      }
    }
    else if (section === 'HitObjects') {
      const parts = line.split(',');
      const x = parseInt(parts[0]);
      const y = parseInt(parts[1]);
      const time = parseInt(parts[2]);
      const type = parseInt(parts[3]);
      const hitSound = parseInt(parts[4]);
      let endTime = time;
      
      if ((type & 128)) { 
        const extras = parts[5].split(':');
        endTime = parseInt(extras[0]);
      } else if (type & 2) { 
        endTime = time + 500; 
      }

      const hitObj: HitObject = { x, y, time, type, hitSound, endTime };
      
      const columnCount = Math.round(data.difficulty.circleSize) || 4;
      hitObj.column = Math.min(Math.max(Math.floor(x * columnCount / 512), 0), columnCount - 1);
      
      data.hitObjects.push(hitObj);
    }
  }

  return data;
};