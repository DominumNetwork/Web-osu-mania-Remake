import React, { useEffect, useRef, useState } from 'react';
import { BeatmapData, GameMode, HitObject, SettingsState, GameScore, JudgementType, SkinPreset, CustomSkinData } from '../types';
import { audioManager } from '../utils/audio';
import { OSU_WIDTH, OSU_HEIGHT, SKIN_PRESETS } from '../constants';
import { getSkin } from '../utils/db';

interface GameRendererProps {
  beatmap: BeatmapData;
  settings: SettingsState;
  onExit: (score: GameScore) => void;
  onRestart: () => void;
}

interface PopupJudgement {
  id: number;
  type: JudgementType;
  x: number;
  y: number;
  startTime: number;
}

const GameRenderer: React.FC<GameRendererProps> = ({ beatmap, settings, onExit, onRestart }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPaused, setIsPaused] = useState(false);
  const isPausedRef = useRef(false); 
  const [combo, setCombo] = useState(0);
  const [score, setScore] = useState(0);
  const [accuracy, setAccuracy] = useState(100);
  const [health, setHealth] = useState(100);
  const [isFailed, setIsFailed] = useState(false);
  const [restartProgress, setRestartProgress] = useState(0);
  
  const [showSkip, setShowSkip] = useState(false);
  const [firstNoteTime, setFirstNoteTime] = useState(0);
  const [songDuration, setSongDuration] = useState(0);

  const requestRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const settingsRef = useRef(settings);
  
  const skinImages = useRef<Record<string, HTMLImageElement>>({});
  const skinData = useRef<CustomSkinData | null>(null);

  useEffect(() => {
    settingsRef.current = settings;
    audioManager.setVolume(settings.volume);
    
    let speed = settings.modifiers.songSpeed;
    if (settings.modifiers.doubleTime) speed = 1.5;
    else if (settings.modifiers.halfTime) speed = 0.75;
    audioManager.playbackRate = speed;
  }, [settings]);

  useEffect(() => {
      const loadSkin = async () => {
          if (settings.activeSkinId.startsWith('custom_')) {
              const skinName = settings.activeSkinId.replace('custom_', '');
              const data = await getSkin(skinName);
              if (data) {
                  skinData.current = data;
                  const promises = Object.entries(data.images).map(([key, blob]) => {
                      return new Promise<void>((resolve) => {
                          const img = new Image();
                          img.src = URL.createObjectURL(blob);
                          img.onload = () => resolve();
                          skinImages.current[key] = img;
                      });
                  });
                  await Promise.all(promises);
              }
          } else {
              skinData.current = null;
              skinImages.current = {};
          }
      };
      loadSkin();
  }, [settings.activeSkinId]);

  const gameState = useRef<{
    hits: Record<JudgementType, number>;
    combo: number;
    score: number;
    maxCombo: number;
    health: number;
    processedObjects: Set<number>;
    activeKeys: Set<string>;
    startTime: number;
    lastTime: number;
    popups: PopupJudgement[];
    restartHoldTime: number;
    touching: boolean;
    columnMap: number[];
    failed: boolean;
    missedObjects: Set<number>;
  }>({
    hits: { Marvelous: 0, Perfect: 0, Great: 0, Good: 0, Bad: 0, Miss: 0 },
    combo: 0,
    score: 0,
    maxCombo: 0,
    health: 100,
    processedObjects: new Set<number>(),
    missedObjects: new Set<number>(),
    activeKeys: new Set<string>(),
    startTime: 0,
    lastTime: -3000, 
    popups: [],
    restartHoldTime: 0,
    touching: false,
    columnMap: [],
    failed: false
  });

  useEffect(() => {
    isPausedRef.current = false;
    setIsFailed(false);

    const lanes = Math.round(beatmap.difficulty.circleSize);
    let colMap = Array.from({length: lanes}, (_, i) => i);
    
    if (settings.modifiers.mirror) {
        colMap.reverse();
    } else if (settings.modifiers.random && beatmap.mode === GameMode.Mania) {
        for (let i = colMap.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [colMap[i], colMap[j]] = [colMap[j], colMap[i]];
        }
    }
    gameState.current.columnMap = colMap;
    
    let startOffset = -2; 
    
    if (beatmap.hitObjects.length > 0) {
        setFirstNoteTime(beatmap.hitObjects[0].time);
        const last = beatmap.hitObjects[beatmap.hitObjects.length-1];
        setSongDuration(last.endTime || last.time);
    }
    
    gameState.current.lastTime = startOffset * 1000;
    
    audioManager.play(startOffset); 

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (e.key === settingsRef.current.keybinds.global.pause) {
        togglePause();
        return;
      }
      
      if (key === ' ' && showSkip) {
          skipIntro();
          return;
      }

      gameState.current.activeKeys.add(key);

      if (isPausedRef.current || gameState.current.failed) return;
      handleInput(key, audioManager.getCurrentTime());
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      gameState.current.activeKeys.delete(e.key.toLowerCase());
    };
    
    const handleTouchStart = (e: TouchEvent) => {
      if (isPausedRef.current || gameState.current.failed) return;
      gameState.current.touching = true;
      const time = audioManager.getCurrentTime();
      Array.from(e.changedTouches).forEach(touch => {
        const xPercent = touch.clientX / window.innerWidth;
        if (beatmap.mode === GameMode.Mania) {
          const lanes = Math.round(beatmap.difficulty.circleSize);
          const laneIndex = Math.floor(xPercent * lanes);
          handleManiaInput(laneIndex, time);
        }
      });
    };
    const handleTouchEnd = () => { gameState.current.touching = false; };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('touchstart', handleTouchStart, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);

    const loop = (timestamp: number) => {
      const dt = timestamp - lastTimeRef.current;
      lastTimeRef.current = timestamp;

      if (!isPausedRef.current && !gameState.current.failed) {
        const currentTime = audioManager.getCurrentTime();
        gameState.current.lastTime = currentTime;

        if (beatmap.hitObjects.length > 0) {
            const firstT = beatmap.hitObjects[0].time;
            if (firstT > 5000 && currentTime < firstT - 3000) {
                setShowSkip(true);
            } else {
                setShowSkip(false);
            }
        }
        
        if (currentTime >= firstNoteTime && currentTime < songDuration) {
             const mods = settingsRef.current.modifiers;
             let drainRate = beatmap.difficulty.hpDrainRate;
             if (mods.hpDrainOverride) drainRate = 5; 
             
             const drainPerSecond = 0.5 + (drainRate / 10); 
             const drainFrame = (drainPerSecond * (dt / 1000)) * 5; 

             if (gameState.current.health > 0) {
                 gameState.current.health = Math.max(0, gameState.current.health - drainFrame);
                 setHealth(gameState.current.health);
             }

             if (gameState.current.health <= 0 && !mods.noFail) {
                 failGame();
             }
        }
        
        if (settingsRef.current.modifiers.autoPlay) {
            autoPlayLogic(currentTime);
        }

        checkMisses(currentTime);
        
        const lastObj = beatmap.hitObjects[beatmap.hitObjects.length - 1];
        const endTime = lastObj.endTime ? Math.max(lastObj.time, lastObj.endTime) : lastObj.time;

        if (currentTime > endTime + 2000) {
          endGame();
          return;
        }
      }
      
      updateRestartLogic();
      render(gameState.current.lastTime);
      
      requestRef.current = requestAnimationFrame(loop);
    };

    requestRef.current = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
      cancelAnimationFrame(requestRef.current);
      audioManager.stop();
    };
  }, [beatmap]); 

  const skipIntro = () => {
      if (beatmap.hitObjects.length > 0) {
          const target = beatmap.hitObjects[0].time - 3000;
          audioManager.play(target / 1000); 
          gameState.current.lastTime = target;
          setShowSkip(false);
      }
  };

  const autoPlayLogic = (time: number) => {
      beatmap.hitObjects.forEach((obj, idx) => {
          if (gameState.current.processedObjects.has(idx)) return;
          if (Math.abs(obj.time - time) < 10) {
              const lane = obj.column !== undefined ? obj.column : 0;
              if (beatmap.mode === GameMode.Mania) {
                   registerHit('Marvelous', idx, lane, 0);
              }
          }
      });
  };

  const togglePause = () => {
    if (gameState.current.failed) return;
    if (isPausedRef.current) {
      audioManager.resumeContext();
      audioManager.play(gameState.current.lastTime / 1000); 
      isPausedRef.current = false;
      setIsPaused(false);
    } else {
      audioManager.pause();
      isPausedRef.current = true;
      setIsPaused(true);
    }
  };

  const updateRestartLogic = () => {
    const isRestarting = gameState.current.activeKeys.has(settingsRef.current.keybinds.global.restart.toLowerCase());
    if (isRestarting) {
      gameState.current.restartHoldTime += 16;
      setRestartProgress(Math.min(100, (gameState.current.restartHoldTime / 1000) * 100));
      if (gameState.current.restartHoldTime >= 1000) {
        onRestart();
      }
    } else {
      gameState.current.restartHoldTime = 0;
      setRestartProgress(0);
    }
  };

  const handleInput = (key: string, time: number) => {
    if (settingsRef.current.modifiers.autoPlay) return; 

    if (beatmap.mode === GameMode.Mania) {
      const columns = Math.round(beatmap.difficulty.circleSize);
      const keyModeStr = `${columns}K`;
      const binds = settingsRef.current.keybinds.mania[keyModeStr] || [];
      const keyIndex = binds.indexOf(key);
      
      if (keyIndex !== -1 && keyIndex !== undefined) {
          const logicalCol = gameState.current.columnMap[keyIndex];
          handleManiaInput(logicalCol, time);
      }
    }
  };

  const handleManiaInput = (col: number, time: number) => {
    const objIndex = beatmap.hitObjects.findIndex((obj, idx) => 
      !gameState.current.processedObjects.has(idx) && obj.column === col && Math.abs(obj.time - time) < 200
    );

    if (objIndex !== -1) {
      const diff = Math.abs(beatmap.hitObjects[objIndex].time - time);
      let j: JudgementType = diff < 20 ? 'Marvelous' : diff < 45 ? 'Perfect' : diff < 80 ? 'Great' : diff < 120 ? 'Good' : 'Bad';
      registerHit(j, objIndex, col, 0); 
    }
  };

  const checkMisses = (time: number) => {
    beatmap.hitObjects.forEach((obj, idx) => {
      if (!gameState.current.processedObjects.has(idx) && time > obj.time + 150) {
        registerHit('Miss', idx, obj.x, obj.y);
      }
    });
  };

  const registerHit = (val: JudgementType, idx: number, x: number, y: number) => {
    const mods = settingsRef.current.modifiers;
    gameState.current.processedObjects.add(idx);
    
    if (val === 'Miss') {
        gameState.current.missedObjects.add(idx); 
        let hpChange = -15; 
        hpChange -= beatmap.difficulty.hpDrainRate; 
        
        if (mods.easy) hpChange *= 0.5;
        if (mods.hardRock) hpChange *= 1.5;
        
        gameState.current.hits[val]++;
        gameState.current.combo = 0;
        if (mods.suddenDeath || mods.perfect) {
            failGame();
        }
        gameState.current.health = Math.min(100, Math.max(0, gameState.current.health + hpChange));
        if (!mods.noFail && gameState.current.health <= 0) failGame();

    } else {
        gameState.current.hits[val]++;
        gameState.current.combo++;
        gameState.current.maxCombo = Math.max(gameState.current.maxCombo, gameState.current.combo);
        
        const mult = val === 'Marvelous' ? 320 : val === 'Perfect' ? 300 : val === 'Great' ? 200 : val === 'Good' ? 100 : 50;
        gameState.current.score += mult * gameState.current.combo;
        
        let hpChange = val === 'Marvelous' ? 5 : val === 'Perfect' ? 4 : val === 'Great' ? 2 : 1;
        hpChange = hpChange * (1 - (beatmap.difficulty.hpDrainRate / 15)); 
        
        if (mods.easy) hpChange *= 1.2;
        if (mods.hardRock) hpChange *= 0.6;
        
        gameState.current.health = Math.min(100, Math.max(0, gameState.current.health + hpChange));
    }
    
    if (mods.perfect && val !== 'Marvelous' && val !== 'Perfect' && val !== 'Miss') {
        onRestart(); 
    }

    gameState.current.popups.push({ id: Date.now() + Math.random(), type: val, x, y, startTime: Date.now() });
    if (gameState.current.popups.length > 5) gameState.current.popups.shift();

    setCombo(gameState.current.combo);
    setScore(gameState.current.score);
    setHealth(gameState.current.health);
    
    const processed = gameState.current.processedObjects.size;
    if (processed > 0) {
      const total = (Object.entries(gameState.current.hits) as [string, number][]).reduce((acc, [k, v]) => {
        const mult = k === 'Marvelous' ? 320 : k === 'Perfect' ? 300 : k === 'Great' ? 200 : k === 'Good' ? 100 : k === 'Bad' ? 50 : 0;
        return acc + (v * mult);
      }, 0);
      setAccuracy((total / (processed * 320)) * 100);
    }
  };

  const failGame = () => {
      gameState.current.failed = true;
      setIsFailed(true);
      audioManager.stop();
  };

  const endGame = () => {
    onExit({
      score: gameState.current.score,
      combo: gameState.current.combo,
      maxCombo: gameState.current.maxCombo,
      accuracy: accuracy,
      hits: gameState.current.hits
    });
  };
  
  const drawNoteShape = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, shape: string, color: string, isOutline: boolean = false) => {
      ctx.beginPath();
      
      if (shape === 'circle') {
        ctx.arc(x, y, size/2, 0, Math.PI * 2);
      } else if (shape === 'bar') {
        ctx.rect(x - size/2, y - 10, size, 20);
      } else if (shape === 'arrow') {
        ctx.moveTo(x, y - size/2);
        ctx.lineTo(x + size/2, y + size/2);
        ctx.lineTo(x - size/2, y + size/2);
        ctx.closePath();
      } else if (shape === 'diamond' || shape === 'diamond-soft') {
        ctx.moveTo(x, y - size/2);
        ctx.lineTo(x + size/2, y);
        ctx.lineTo(x, y + size/2);
        ctx.lineTo(x - size/2, y);
        ctx.closePath();
      } else if (shape === 'line') {
          ctx.rect(x - size/2, y - 2, size, 4);
      }

      if (isOutline) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2;
          ctx.stroke();
          if (shape === 'diamond-soft') {
              ctx.shadowBlur = 10;
              ctx.shadowColor = color;
              ctx.stroke();
              ctx.shadowBlur = 0;
          }
      } else {
          ctx.fillStyle = color;
          ctx.fill();
           if (shape === 'circle') {
             ctx.strokeStyle = '#fff';
             ctx.lineWidth = 2;
             ctx.stroke();
           }
      }
  };

  const render = (time: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (beatmap.backgroundBlob) {
        if (!skinImages.current['bg_image']) {
             const img = new Image();
             img.src = URL.createObjectURL(beatmap.backgroundBlob);
             skinImages.current['bg_image'] = img;
        }
        
        const img = skinImages.current['bg_image'];
        if (img && img.complete) {
            const scale = Math.max(canvas.width / img.width, canvas.height / img.height);
            const x = (canvas.width / 2) - (img.width / 2) * scale;
            const y = (canvas.height / 2) - (img.height / 2) * scale;
            ctx.globalAlpha = 0.3; 
            ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
            ctx.globalAlpha = 1.0;
        } else {
             ctx.fillStyle = '#000';
             ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
    } else {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    
    ctx.fillStyle = `rgba(0,0,0,${settings.backgroundDim})`;
    ctx.fillRect(0,0, canvas.width, canvas.height);

    if (beatmap.mode === GameMode.Mania) renderMania(ctx, time);

    renderPopups(ctx);
    
    const barW = canvas.width * 0.4;
    const barH = 10;
    const barX = (canvas.width - barW) / 2;
    const barY = 20;
    
    const currentHealth = gameState.current.health;

    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(barX, barY, barW, barH);
    const fillW = (barW * currentHealth) / 100;
    ctx.fillStyle = currentHealth > 50 ? '#4ade80' : currentHealth > 20 ? '#fbbf24' : '#ef4444';
    ctx.fillRect(barX, barY, fillW, barH);
    ctx.shadowBlur = 10;
    ctx.shadowColor = ctx.fillStyle;
    ctx.fillRect(barX, barY, fillW, barH);
    ctx.shadowBlur = 0;

    if (songDuration > 0) {
        const pSize = 30;
        const pX = canvas.width - 40;
        const pY = canvas.height - 40;
        const progress = Math.max(0, Math.min(1, time / songDuration));
        
        ctx.beginPath();
        ctx.arc(pX, pY, pSize, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fill();
        
        ctx.beginPath();
        ctx.moveTo(pX, pY);
        ctx.arc(pX, pY, pSize, -Math.PI/2, (-Math.PI/2) + (Math.PI * 2 * progress));
        ctx.closePath();
        ctx.fillStyle = '#4ade80';
        ctx.fill();
        
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pX, pY, pSize, 0, Math.PI * 2);
        ctx.stroke();
    }
  };

  const renderMania = (ctx: CanvasRenderingContext2D, time: number) => {
    const currentSettings = settingsRef.current;
    const currentSkin = SKIN_PRESETS.find(s => s.id === currentSettings.activeSkinId) || SKIN_PRESETS[0];
    
    const lanes = Math.round(beatmap.difficulty.circleSize);
    const keyStr = lanes + "K";
    const maniaColors = currentSettings.skinOverrides.perKeyColors?.[keyStr] || 
                        currentSettings.skinOverrides.maniaColors || 
                        currentSkin.maniaColors;

    const canvasW = canvasRef.current!.width;
    const canvasH = canvasRef.current!.height;
    
    const useCustomSkin = !!skinData.current;
    const hitPos = useCustomSkin && skinData.current!.ini.HitPosition ? skinData.current!.ini.HitPosition * (canvasH/480) : canvasH - 120; 
    
    const isMobile = canvasW < 768;
    const laneWidth = isMobile ? (canvasW / lanes) : currentSettings.laneWidth;
    const totalW = lanes * laneWidth;
    const startX = isMobile ? 0 : (canvasW - totalW) / 2;
    
    const baseSpeed = currentSettings.useBeatmapScrollSpeed ? beatmap.difficulty.sliderMultiplier * 15 : currentSettings.scrollSpeed;
    const pixelSpeed = (baseSpeed / 20) * (canvasH / 600);

    ctx.fillStyle = `rgba(10,10,10,0.8)`;
    ctx.fillRect(startX, 0, totalW, canvasH);

    if (!useCustomSkin) {
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 1;
        for(let i = 0; i <= lanes; i++) {
            ctx.beginPath();
            ctx.moveTo(startX + i * laneWidth, 0);
            ctx.lineTo(startX + i * laneWidth, canvasH);
            ctx.stroke();
        }
    } else if (skinImages.current['mania-stage-left']) {
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 1;
        for(let i = 0; i <= lanes; i++) {
            ctx.beginPath();
            ctx.moveTo(startX + i * laneWidth, 0);
            ctx.lineTo(startX + i * laneWidth, canvasH);
            ctx.stroke();
        }
    }

    const shape = currentSettings.noteStyle;
    
    if (!useCustomSkin && shape === 'line') {
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillRect(startX, hitPos - 2, totalW, 4);
    } else if (!useCustomSkin) {
        for(let i = 0; i < lanes; i++) {
            const logicalCol = gameState.current.columnMap[i]; 
            const colColor = maniaColors[logicalCol % maniaColors.length];
            const noteX = startX + i * laneWidth;
            const noteCenterX = noteX + laneWidth / 2;
            drawNoteShape(ctx, noteCenterX, hitPos, laneWidth * 0.8, shape, colColor, true);
        }
    } else {
         for(let i = 0; i < lanes; i++) {
             const noteX = startX + i * laneWidth;
             const isOdd = lanes % 2 !== 0;
             const center = Math.floor(lanes / 2);
             
             const logicalCol = gameState.current.columnMap[i];
             
             let suffix = '1';
             if (isOdd && i === center) suffix = 'S';
             else if (i % 2 !== 0) suffix = '2';
             
             const keyModeStr = `${lanes}K`;
             const binds = currentSettings.keybinds.mania[keyModeStr];
             let isPressed = false;
             if (binds && logicalCol < binds.length) {
                 const key = binds[logicalCol];
                 isPressed = gameState.current.activeKeys.has(key);
             }
             
             let imgKey = `mania-key${suffix}`;
             if (isPressed && skinImages.current[`${imgKey}D`]) {
                 imgKey += 'D';
             }
             
             if (skinImages.current[imgKey]) {
                 const img = skinImages.current[imgKey];
                 const h = (img.height / img.width) * laneWidth;
                 ctx.drawImage(img, noteX, hitPos - h/2, laneWidth, h); 
             } else {
                 const colColor = maniaColors[i % maniaColors.length];
                 drawNoteShape(ctx, noteX + laneWidth/2, hitPos, laneWidth*0.8, 'bar', colColor, true);
                 if (isPressed) {
                     ctx.fillStyle = 'rgba(255,255,255,0.5)';
                     ctx.fillRect(noteX, hitPos - 10, laneWidth, 20);
                 }
             }
         }
    }

    beatmap.hitObjects.forEach((obj, idx) => {
      const isProcessed = gameState.current.processedObjects.has(idx);
      const isMissed = gameState.current.missedObjects.has(idx);
      const isLN = (obj.endTime || 0) > obj.time;
      
      if (isMissed) return;
      if (isProcessed && (!isLN || time > (obj.endTime || 0))) return;

      const visualCol = gameState.current.columnMap.indexOf(obj.column || 0);
      if (visualCol === -1) return;

      const noteX = startX + visualCol * laneWidth;
      const noteCenterX = noteX + laneWidth / 2;
      const noteColor = maniaColors[(obj.column || 0) % maniaColors.length];

      const diff = obj.time - time;
      const headY = hitPos - diff * pixelSpeed;
      let tailY = headY;
      
      if (isLN) {
          const diffEnd = (obj.endTime || 0) - time;
          tailY = hitPos - diffEnd * pixelSpeed;
      }
      
      if (headY < -200 && tailY < -200) return; 
      if (tailY > canvasH + 200) return;

      if (isLN) {
          const bodyStartY = isProcessed ? hitPos : headY;
          const bodyHeight = bodyStartY - tailY;

          if (bodyHeight > 0) {
              if (useCustomSkin) {
                 ctx.fillStyle = noteColor;
                 ctx.globalAlpha = 0.7;
                 ctx.fillRect(noteCenterX - (laneWidth * 0.3), tailY, laneWidth * 0.6, bodyHeight);
                 ctx.globalAlpha = 1.0;
              } else {
                  ctx.globalAlpha = 0.7;
                  ctx.fillStyle = noteColor;
                  ctx.fillRect(noteCenterX - (laneWidth * 0.3), tailY, laneWidth * 0.6, bodyHeight);
                  ctx.globalAlpha = 1.0;
                  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
                  ctx.lineWidth = 2;
                  ctx.strokeRect(noteCenterX - (laneWidth * 0.3), tailY, laneWidth * 0.6, bodyHeight);
              }
          }
      }
      
      if (!isProcessed) {
         if (useCustomSkin) {
             const isOdd = lanes % 2 !== 0;
             const center = Math.floor(lanes / 2);
             let imgName = 'mania-note1';
             if (isOdd && visualCol === center) imgName = 'mania-noteS';
             else if (visualCol % 2 !== 0) imgName = 'mania-note2';

             if (skinImages.current[imgName]) {
                 const img = skinImages.current[imgName];
                 const h = (img.height / img.width) * laneWidth;
                 ctx.drawImage(img, noteX, headY - h/2, laneWidth, h);
             } else {
                 drawNoteShape(ctx, noteCenterX, headY, laneWidth * 0.8, shape, noteColor, false);
             }
         } else {
             drawNoteShape(ctx, noteCenterX, headY, laneWidth * 0.8, shape, noteColor, false);
         }
      }
      
      if (isLN) {
         if (useCustomSkin) {
              const isOdd = lanes % 2 !== 0;
             const center = Math.floor(lanes / 2);
             let imgName = 'mania-note1';
             if (isOdd && visualCol === center) imgName = 'mania-noteS';
             else if (visualCol % 2 !== 0) imgName = 'mania-note2';
             
             if (skinImages.current[imgName]) {
                 const img = skinImages.current[imgName];
                 const h = (img.height / img.width) * laneWidth;
                 ctx.drawImage(img, noteX, tailY - h/2, laneWidth, h);
             } else {
                  drawNoteShape(ctx, noteCenterX, tailY, laneWidth * 0.8, shape, noteColor, false);
             }
         } else {
             drawNoteShape(ctx, noteCenterX, tailY, laneWidth * 0.8, shape, noteColor, false);
         }
      }
    });
  };

  const renderPopups = (ctx: CanvasRenderingContext2D) => {
    const currentSettings = settingsRef.current;
    const currentSkin = SKIN_PRESETS.find(s => s.id === currentSettings.activeSkinId) || SKIN_PRESETS[0];

    const now = Date.now();
    gameState.current.popups = gameState.current.popups.filter(p => now - p.startTime < 400);
    
    const canvasW = canvasRef.current!.width;
    const lanes = Math.round(beatmap.difficulty.circleSize);
    const isMobile = canvasW < 768;
    const laneWidth = isMobile ? (canvasW / lanes) : currentSettings.laneWidth;
    const startX = isMobile ? 0 : (canvasW - lanes * laneWidth) / 2;

    gameState.current.popups.forEach(p => {
      const alpha = 1 - (now - p.startTime) / 400;
      
      let drawn = false;
      const useCustomSkin = !!skinData.current;
      if (useCustomSkin) {
          let imgKey = '';
          switch(p.type) {
              case 'Marvelous': imgKey = 'mania-hit300g'; break;
              case 'Perfect': imgKey = 'mania-hit300'; break;
              case 'Great': imgKey = 'mania-hit200'; break;
              case 'Good': imgKey = 'mania-hit100'; break;
              case 'Bad': imgKey = 'mania-hit50'; break;
              case 'Miss': imgKey = 'mania-miss'; break;
          }
          
          if (skinImages.current[imgKey]) {
              ctx.globalAlpha = alpha;
              const img = skinImages.current[imgKey];
              let dx = p.x;
              let dy = p.y;
              if (beatmap.mode === GameMode.Mania) {
                const visualCol = gameState.current.columnMap.indexOf(p.x); 
                dx = startX + visualCol * laneWidth + laneWidth / 2;
                dy = canvasRef.current!.height * 0.4; 
              }
              ctx.drawImage(img, dx - img.width/2, dy - img.height/2);
              drawn = true;
          }
      }

      if (!drawn) {
          ctx.fillStyle = currentSkin.judgementColors[p.type];
          ctx.globalAlpha = alpha;
          ctx.textAlign = 'center';
          
          if (currentSettings.judgementSet === 'default') {
             ctx.font = '900 36px "Exo 2"';
             ctx.shadowBlur = 10;
             ctx.shadowColor = currentSkin.judgementColors[p.type];
          } else if (currentSettings.judgementSet === 'flat') {
             ctx.font = 'bold 30px Arial';
             ctx.shadowBlur = 0;
          } else {
             ctx.font = 'italic 900 40px "Exo 2"';
             ctx.strokeStyle = '#fff';
             ctx.lineWidth = 1;
             ctx.strokeText(p.type.toUpperCase(), 0, 0); 
          }
          
          let dx = p.x;
          let dy = p.y;
          if (beatmap.mode === GameMode.Mania) {
            const visualCol = gameState.current.columnMap.indexOf(p.x); 
            dx = startX + visualCol * laneWidth + laneWidth / 2;
            dy = canvasRef.current!.height * 0.6; 
          }
          ctx.fillText(p.type.toUpperCase(), dx, dy - (1 - alpha) * 25);
          ctx.shadowBlur = 0;
      }
      ctx.globalAlpha = 1.0;
    });
  };

  return (
    <div className="relative w-full h-full touch-none overflow-hidden">
      <canvas ref={canvasRef} width={window.innerWidth} height={window.innerHeight} />
      
      {showSkip && (
          <div className="absolute bottom-32 right-8 z-40 animate-pulse">
              <div className="bg-white/10 border border-white/20 px-6 py-3 rounded-full flex items-center space-x-2">
                  <span className="text-2xl font-black">SPACE</span>
                  <span className="text-sm font-bold uppercase tracking-widest">to Skip Intro</span>
              </div>
          </div>
      )}

      <div className="absolute top-4 left-4 text-white font-mono pointer-events-none z-10">
        <div className="text-4xl font-black drop-shadow-md">{score.toLocaleString()}</div>
        <div className="text-lg opacity-60">{accuracy.toFixed(2)}%</div>
      </div>

      <div className="absolute bottom-4 left-4 text-white font-black text-6xl italic pointer-events-none drop-shadow-lg z-10">
        {combo}x
      </div>

      <button 
        onClick={togglePause} 
        className="absolute top-4 right-4 w-12 h-12 glass rounded-full flex items-center justify-center text-xl z-[60]"
      >
        {isPaused ? '▶' : '||'}
      </button>

      {restartProgress > 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[70]">
          <div className="text-center">
            <div className="text-2xl font-bold text-red-500 mb-2">RESTARTING...</div>
            <div className="w-48 h-1 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-red-500 transition-all" style={{ width: `${restartProgress}%` }} />
            </div>
          </div>
        </div>
      )}
      
      {isFailed && (
        <div className="absolute inset-0 bg-red-900/80 backdrop-blur-xl flex flex-col items-center justify-center space-y-4 z-50 animate-in fade-in duration-300">
          <h2 className="text-6xl font-black italic text-white mb-6 drop-shadow-[0_0_15px_rgba(255,0,0,0.5)]">FAILED</h2>
          <button onClick={onRestart} className="w-56 py-4 bg-white/5 hover:bg-white/20 text-white rounded-2xl font-bold border border-white/10 transition active:scale-95 shadow-lg">RETRY</button>
          <button onClick={() => onExit({ score: 0, combo: 0, maxCombo: 0, accuracy: 0, hits: gameState.current.hits })} className="w-56 py-4 bg-white/5 hover:bg-red-500/20 text-white rounded-2xl font-bold border border-white/10 transition active:scale-95 shadow-lg">QUIT</button>
        </div>
      )}

      {isPaused && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-xl flex flex-col items-center justify-center space-y-4 z-50 animate-in fade-in duration-300">
          <h2 className="text-5xl font-black italic text-pink-500 mb-6 drop-shadow-[0_0_15px_rgba(236,72,153,0.5)]">PAUSED</h2>
          <button onClick={togglePause} className="w-56 py-4 bg-white/5 hover:bg-pink-500/20 text-white rounded-2xl font-bold border border-white/10 transition active:scale-95">CONTINUE</button>
          <button onClick={onRestart} className="w-56 py-4 bg-white/5 hover:bg-blue-500/20 text-white rounded-2xl font-bold border border-white/10 transition active:scale-95">RESTART</button>
          <button onClick={() => onExit({ score: 0, combo: 0, maxCombo: 0, accuracy: 0, hits: gameState.current.hits })} className="w-56 py-4 bg-white/5 hover:bg-red-500/20 text-white rounded-2xl font-bold border border-white/10 transition active:scale-95">QUIT</button>
        </div>
      )}
    </div>
  );
};

export default GameRenderer;