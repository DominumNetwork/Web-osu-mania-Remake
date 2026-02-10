import React, { useState, useEffect } from 'react';
import { SettingsState, SkinPreset, CustomSkinData, ExportOptions } from '../types';
import { SKIN_PRESETS, DEFAULT_SETTINGS } from '../constants';
import { clearDatabase, saveSkin, getAllSkins, getAllBeatmaps, saveBeatmap } from '../utils/db';
import { parseSkin } from '../utils/skin';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  settings: SettingsState;
  onUpdate: (s: SettingsState) => void;
}

type Tab = 'General' | 'Gameplay' | 'Skin' | 'Mods' | 'Keybinds' | 'Data';

interface RebindState {
    mode: 'mania';
    maniaKey?: string;
    index?: number;
}

const Toggle: React.FC<{ label: string; checked: boolean; onChange: (v: boolean) => void }> = ({ label, checked, onChange }) => (
    <div className="flex items-center justify-between py-2">
        <span className="text-sm font-bold text-white/70">{label}</span>
        <div 
            onClick={() => onChange(!checked)}
            className={`w-12 h-6 rounded-full p-1 cursor-pointer transition duration-200 ${checked ? 'bg-blue-500' : 'bg-white/10'}`}
        >
            <div className={`w-4 h-4 bg-white rounded-full shadow-md transform transition duration-200 ${checked ? 'translate-x-6' : ''}`}></div>
        </div>
    </div>
);

const SettingsModal: React.FC<Props> = ({ isOpen, onClose, settings, onUpdate }) => {
  const [activeTab, setActiveTab] = useState<Tab>('General');
  const [rebind, setRebind] = useState<RebindState | null>(null);
  const [customSkins, setCustomSkins] = useState<CustomSkinData[]>([]);
  
  const [exportOpts, setExportOpts] = useState<ExportOptions>({ beatmaps: false, keybinds: false, skins: false, settings: false });
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  
  const [previewKeyCount, setPreviewKeyCount] = useState(4);

  useEffect(() => {
      const loadCustomSkins = async () => {
          const skins = await getAllSkins();
          setCustomSkins(skins);
      };
      if (isOpen) loadCustomSkins();
  }, [isOpen]);

  useEffect(() => {
    if (!rebind) return;

    const handler = (e: KeyboardEvent) => {
        e.preventDefault();
        e.stopPropagation();
        
        const newKey = e.key.toLowerCase();
        
        const newSettings = { ...settings };

        if (rebind.mode === 'mania' && rebind.maniaKey && rebind.index !== undefined) {
             const newKeys = [...newSettings.keybinds.mania[rebind.maniaKey]];
             newKeys[rebind.index] = newKey;
             newSettings.keybinds.mania[rebind.maniaKey] = newKeys;
        }

        onUpdate(newSettings);
        setRebind(null);
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [rebind, settings, onUpdate]);

  if (!isOpen) return null;

  const updateSetting = (key: keyof SettingsState, val: any) => {
    onUpdate({ ...settings, [key]: val });
  };
  
  const updateMod = (key: keyof typeof settings.modifiers, val: any) => {
      onUpdate({ ...settings, modifiers: { ...settings.modifiers, [key]: val } });
  };

  const handleClearData = async () => {
    if(confirm("Are you sure? This will delete all imported beatmaps, settings, and skins.")) {
        await clearDatabase();
        window.location.reload();
    }
  };
  
  const handleSkinUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
          const skin = await parseSkin(file);
          await saveSkin(skin);
          setCustomSkins(prev => [...prev, skin]);
          alert("Skin imported successfully!");
      } catch (e) {
          console.error(e);
          alert("Failed to import skin.");
      }
      e.target.value = '';
  };
  
  const handleExport = async () => {
      setIsExporting(true);
      try {
          const zip = new (window as any).JSZip();
          const manifest: any = { options: exportOpts, date: Date.now() };

          if (exportOpts.settings || exportOpts.keybinds) {
              const exportSettings = JSON.parse(JSON.stringify(settings));
              if (!exportOpts.settings) {
                   const temp = { keybinds: exportSettings.keybinds };
                   zip.file('settings.json', JSON.stringify(temp));
              } else if (!exportOpts.keybinds) {
                   if (!exportOpts.keybinds) delete exportSettings.keybinds;
                   zip.file('settings.json', JSON.stringify(exportSettings));
              } else {
                   zip.file('settings.json', JSON.stringify(exportSettings));
              }
          }

          if (exportOpts.skins) {
              const skins = await getAllSkins();
              const skinsFolder = zip.folder('skins');
              for (const skin of skins) {
                  const skinFolder = skinsFolder.folder(skin.name);
                  skinFolder.file('skin.json', JSON.stringify({ name: skin.name, ini: skin.ini }));
                  const imgFolder = skinFolder.folder('images');
                  for (const [imgName, blob] of Object.entries(skin.images)) {
                      imgFolder.file(imgName, blob);
                  }
              }
          }

          if (exportOpts.beatmaps) {
              const maps = await getAllBeatmaps();
              const mapsFolder = zip.folder('beatmaps');
              for (const map of maps) {
                  const mapFolder = mapsFolder.folder(map.id!.toString());
                  const { audioBlob, backgroundBlob, ...jsonMap } = map;
                  mapFolder.file('map.json', JSON.stringify(jsonMap));
                  if (audioBlob) mapFolder.file('audio', audioBlob);
                  if (backgroundBlob) mapFolder.file('bg', backgroundBlob);
              }
          }
          
          zip.file('manifest.json', JSON.stringify(manifest));

          const content = await zip.generateAsync({ type: 'blob' });
          const url = URL.createObjectURL(content);
          const a = document.createElement('a');
          a.href = url;
          const flags = [
             exportOpts.beatmaps ? 'maps' : '', 
             exportOpts.keybinds ? 'keys' : '', 
             exportOpts.skins ? 'skins' : '', 
             exportOpts.settings ? 'config' : ''
          ].filter(x => x).join('_');
          
          a.download = `backup_${flags || 'full'}.wosu`;
          a.click();
          URL.revokeObjectURL(url);

      } catch (e) {
          console.error(e);
          alert("Export failed.");
      }
      setIsExporting(false);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setIsImporting(true);
      try {
          const zip = new (window as any).JSZip();
          const contents = await zip.loadAsync(file);
          
          if (contents.files['manifest.json']) {
               const manifestStr = await contents.files['manifest.json'].async('string');
               const manifest = JSON.parse(manifestStr);
          }

          if (contents.files['settings.json']) {
               const setStr = await contents.files['settings.json'].async('string');
               const importedSettings = JSON.parse(setStr);
               onUpdate({ ...settings, ...importedSettings });
          }

          const skinsFolder = contents.folder('skins');
          if (skinsFolder) {
               const skinDirs: any[] = [];
               skinsFolder.forEach((relativePath: string, file: any) => {
                   if (file.dir) {
                       const skinName = relativePath.replace(/\/$/, '');
                       if (!skinDirs.includes(skinName) && !skinName.includes('/')) skinDirs.push(skinName);
                   }
               });
               
               for (const skinName of skinDirs) {
                   const skinDir = skinsFolder.folder(skinName);
                   const jsonFile = skinDir.file('skin.json');
                   if (jsonFile) {
                       const jsonStr = await jsonFile.async('string');
                       const skinData = JSON.parse(jsonStr);
                       const imgDir = skinDir.folder('images');
                       skinData.images = {};
                       if (imgDir) {
                           const imgFiles: any[] = [];
                           imgDir.forEach((path: string, f: any) => { if(!f.dir) imgFiles.push({path, f}); });
                           
                           for (const {path, f} of imgFiles) {
                               const blob = await f.async('blob');
                               const baseName = path.split('/').pop();
                               if (baseName) skinData.images[baseName] = blob;
                           }
                       }
                       await saveSkin(skinData);
                   }
               }
          }

          const mapsFolder = contents.folder('beatmaps');
          if (mapsFolder) {
               const mapDirs: any[] = [];
               mapsFolder.forEach((path: string, file: any) => {
                   if (file.dir) {
                       const id = path.replace(/\/$/, '');
                       if (!mapDirs.includes(id) && !id.includes('/')) mapDirs.push(id);
                   }
               });

               for (const id of mapDirs) {
                   const mapDir = mapsFolder.folder(id);
                   const jsonFile = mapDir.file('map.json');
                   if (jsonFile) {
                       const jsonStr = await jsonFile.async('string');
                       const mapData = JSON.parse(jsonStr);
                       
                       let audioBlob = new Blob([]);
                       let bgBlob = undefined;
                       
                       const audioFile = mapDir.file('audio');
                       if (audioFile) audioBlob = await audioFile.async('blob');
                       
                       const bgFile = mapDir.file('bg');
                       if (bgFile) bgBlob = await bgFile.async('blob');
                       
                       delete mapData.id;
                       await saveBeatmap(mapData, audioBlob, bgBlob);
                   }
               }
          }
          
          alert("Import successful! Reloading...");
          window.location.reload();

      } catch (e) {
          console.error(e);
          alert("Import failed.");
      }
      setIsImporting(false);
      e.target.value = '';
  };

  const currentSkin = SKIN_PRESETS.find(s => s.id === settings.activeSkinId) || SKIN_PRESETS[0];

  return (
    <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-[100] backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-[#0f1115] border border-white/10 rounded-xl w-full max-w-4xl h-[85vh] flex flex-col shadow-2xl overflow-hidden relative">
        
        {rebind && (
            <div className="absolute inset-0 bg-black/80 z-[110] flex items-center justify-center backdrop-blur-sm animate-in fade-in duration-150">
                <div className="text-center">
                    <div className="text-3xl font-black italic text-blue-500 mb-2">PRESS ANY KEY</div>
                    <div className="text-white/50">Click to assign new keybind</div>
                    <button onClick={() => setRebind(null)} className="mt-8 text-sm underline opacity-50 hover:opacity-100">Cancel</button>
                </div>
            </div>
        )}

        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-[#131519]">
          <h2 className="text-2xl font-bold text-white tracking-wide">Settings</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition">&times;</button>
        </div>

        <div className="flex border-b border-white/5 bg-[#131519] overflow-x-auto">
            {(['General', 'Gameplay', 'Skin', 'Mods', 'Keybinds', 'Data'] as Tab[]).map(tab => (
                <button 
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex-1 min-w-[100px] py-4 text-sm font-bold uppercase tracking-wider transition relative ${activeTab === tab ? 'text-blue-400 bg-white/5' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
                >
                    {tab}
                    {activeTab === tab && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-400"></div>}
                </button>
            ))}
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
            
            {activeTab === 'General' && (
                <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
                    <section>
                        <h3 className="text-white font-bold text-lg mb-4">Volume</h3>
                        <div className="flex items-center space-x-4 mb-4">
                            <span className="w-24 text-sm opacity-60">Master</span>
                            <input type="range" min="0" max="1" step="0.05" value={settings.volume} onChange={e => updateSetting('volume', parseFloat(e.target.value))} className="flex-1 accent-blue-500" />
                            <span className="w-12 text-right font-mono">{Math.round(settings.volume * 100)}%</span>
                        </div>
                    </section>
                    
                    <section>
                        <h3 className="text-white font-bold text-lg mb-4">Beatmap Management</h3>
                        <div className="space-y-3">
                            <label className="flex items-center space-x-3 cursor-pointer p-3 rounded hover:bg-white/5">
                                <input type="radio" checked={settings.beatmapProvider === 'Mino'} onChange={() => updateSetting('beatmapProvider', 'Mino')} className="accent-blue-500" />
                                <div>
                                    <div className="font-bold">Mino (catboy.best)</div>
                                    <div className="text-xs opacity-50">Standard Osu! Mirror</div>
                                </div>
                            </label>
                            <label className="flex items-center space-x-3 cursor-pointer p-3 rounded hover:bg-white/5">
                                <input type="radio" checked={settings.beatmapProvider === 'NeriNyan'} onChange={() => updateSetting('beatmapProvider', 'NeriNyan')} className="accent-blue-500" />
                                <div>
                                    <div className="font-bold">NeriNyan</div>
                                    <div className="text-xs opacity-50">Alternative Mirror</div>
                                </div>
                            </label>
                        </div>
                    </section>
                </div>
            )}
            
            {activeTab === 'Data' && (
                <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
                    <section>
                        <h3 className="text-white font-bold text-lg mb-4">Import / Export</h3>
                        <div className="bg-white/5 p-4 rounded-lg space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <Toggle label="Include Beatmaps" checked={exportOpts.beatmaps} onChange={v => setExportOpts(p => ({...p, beatmaps: v}))} />
                                <Toggle label="Include Keybinds" checked={exportOpts.keybinds} onChange={v => setExportOpts(p => ({...p, keybinds: v}))} />
                                <Toggle label="Include Skins" checked={exportOpts.skins} onChange={v => setExportOpts(p => ({...p, skins: v}))} />
                                <Toggle label="Include Settings" checked={exportOpts.settings} onChange={v => setExportOpts(p => ({...p, settings: v}))} />
                            </div>
                            
                            <div className="flex space-x-4 pt-4 border-t border-white/10">
                                <button 
                                    onClick={handleExport} 
                                    disabled={isExporting}
                                    className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 rounded font-bold transition flex justify-center items-center"
                                >
                                    {isExporting ? 'Exporting...' : 'Export Data (.wosu)'}
                                </button>
                                <div className="flex-1 relative">
                                    <input type="file" accept=".wosu" onChange={handleImport} className="hidden" id="import-wosu" disabled={isImporting} />
                                    <label 
                                        htmlFor="import-wosu" 
                                        className={`block w-full text-center py-3 bg-white/10 hover:bg-white/20 rounded font-bold transition cursor-pointer ${isImporting ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    >
                                        {isImporting ? 'Importing...' : 'Import Data (.wosu)'}
                                    </label>
                                </div>
                            </div>
                        </div>
                    </section>

                    <section>
                        <h3 className="text-white font-bold text-lg mb-4">Maintenance</h3>
                         <button onClick={handleClearData} className="px-6 py-3 bg-red-500/10 text-red-500 border border-red-500/50 hover:bg-red-500 hover:text-white rounded-lg transition font-bold text-sm w-full">
                            Clear All Saved Data
                        </button>
                    </section>
                </div>
            )}

            {activeTab === 'Gameplay' && (
                <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
                     <section>
                        <h3 className="text-white font-bold text-lg mb-4">Display</h3>
                        <div className="space-y-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="font-bold text-sm">Scroll Speed</div>
                                    <div className="text-xs opacity-50">Controls visual note speed</div>
                                </div>
                                <div className="flex items-center space-x-2">
                                     <input type="range" min="10" max="40" value={settings.scrollSpeed} onChange={e => updateSetting('scrollSpeed', parseInt(e.target.value))} className="w-32 accent-blue-500" />
                                     <span className="w-8 text-center font-mono">{settings.scrollSpeed}</span>
                                </div>
                            </div>
                            
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="font-bold text-sm">Background Dim</div>
                                    <div className="text-xs opacity-50">Darken the background image</div>
                                </div>
                                <input type="range" min="0" max="1" step="0.1" value={settings.backgroundDim} onChange={e => updateSetting('backgroundDim', parseFloat(e.target.value))} className="w-32 accent-blue-500" />
                            </div>

                             <div className="flex items-center justify-between">
                                <div className="font-bold text-sm">Show FPS Counter</div>
                                <div onClick={() => updateSetting('showFps', !settings.showFps)} className={`w-12 h-6 rounded-full p-1 cursor-pointer transition ${settings.showFps ? 'bg-blue-500' : 'bg-white/10'}`}>
                                    <div className={`w-4 h-4 bg-white rounded-full shadow-md transform transition ${settings.showFps ? 'translate-x-6' : ''}`}></div>
                                </div>
                            </div>
                        </div>
                    </section>
                    
                    <section>
                        <h3 className="text-white font-bold text-lg mb-4">Touch Controls</h3>
                         <div className="flex items-center justify-between">
                                <div className="font-bold text-sm">Enable Touch Controls</div>
                                <div onClick={() => updateSetting('mobileTouchEnabled', !settings.mobileTouchEnabled)} className={`w-12 h-6 rounded-full p-1 cursor-pointer transition ${settings.mobileTouchEnabled ? 'bg-blue-500' : 'bg-white/10'}`}>
                                    <div className={`w-4 h-4 bg-white rounded-full shadow-md transform transition ${settings.mobileTouchEnabled ? 'translate-x-6' : ''}`}></div>
                                </div>
                        </div>
                    </section>
                </div>
            )}

            {activeTab === 'Skin' && (
                <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
                    <section>
                        <h3 className="text-white font-bold text-lg mb-4">Select Skin</h3>
                        <div className="grid grid-cols-2 gap-3 mb-4">
                            {SKIN_PRESETS.map(s => (
                                <button 
                                    key={s.id} 
                                    onClick={() => onUpdate({ ...settings, activeSkinId: s.id, noteStyle: s.hitObjectShape })} 
                                    className={`p-4 rounded-lg border text-left transition ${settings.activeSkinId === s.id ? 'bg-blue-500/20 border-blue-500' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}
                                >
                                    <div className="font-bold text-sm">{s.name}</div>
                                    <div className="text-xs opacity-50">Built-in</div>
                                </button>
                            ))}
                            {customSkins.map(s => (
                                <button 
                                    key={s.name} 
                                    onClick={() => onUpdate({ ...settings, activeSkinId: `custom_${s.name}` })} 
                                    className={`p-4 rounded-lg border text-left transition ${settings.activeSkinId === `custom_${s.name}` ? 'bg-blue-500/20 border-blue-500' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}
                                >
                                    <div className="font-bold text-sm">{s.name}</div>
                                    <div className="text-xs opacity-50">Imported</div>
                                </button>
                            ))}
                        </div>
                        <div className="relative">
                            <input type="file" accept=".osk,.zip" onChange={handleSkinUpload} className="hidden" id="skin-upload" />
                            <label htmlFor="skin-upload" className="block w-full text-center py-3 bg-white/5 border border-white/10 rounded cursor-pointer hover:bg-white/10 transition text-sm font-bold uppercase tracking-wide">
                                Import Skin (.osk)
                            </label>
                        </div>
                    </section>

                     <section>
                        <h3 className="text-white font-bold text-lg mb-4">Customization</h3>
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <span className="text-sm">Judgement Set</span>
                                <select 
                                    value={settings.judgementSet} 
                                    onChange={(e) => updateSetting('judgementSet', e.target.value)}
                                    className="bg-black/50 border border-white/20 rounded px-2 py-1 text-sm outline-none focus:border-blue-500"
                                >
                                    <option value="default">Default (Glow)</option>
                                    <option value="flat">Flat</option>
                                    <option value="neon">Neon Outline</option>
                                </select>
                            </div>
                             <div className="flex justify-between items-center">
                                <span className="text-sm">Note Style Override</span>
                                <div className="flex space-x-2">
                                    {['bar', 'circle', 'arrow', 'diamond'].map(style => (
                                        <button 
                                            key={style}
                                            onClick={() => updateSetting('noteStyle', style)}
                                            className={`w-8 h-8 rounded border flex items-center justify-center text-xs ${settings.noteStyle === style ? 'bg-blue-500 border-blue-500' : 'bg-white/5 border-white/10'}`}
                                        >
                                            {style === 'circle' ? '●' : style === 'bar' ? '▬' : style === 'arrow' ? '↑' : '◆'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </section>

                    <section>
                        <h3 className="text-white font-bold text-lg mb-4">Color Editor</h3>
                        <div className="space-y-4">
                            <div className="flex justify-between items-center mb-4">
                                <div className="text-sm">Key Count</div>
                                <div className="flex items-center space-x-2">
                                     <input type="range" min="1" max="10" value={previewKeyCount} onChange={e => setPreviewKeyCount(parseInt(e.target.value))} className="w-32 accent-blue-500" />
                                     <span className="w-8 text-center font-mono">{previewKeyCount}K</span>
                                </div>
                            </div>
                            
                            <div>
                                <div className="text-sm mb-2 opacity-70">Customize Colors for {previewKeyCount}K</div>
                                <div className="flex flex-wrap gap-2 mb-4">
                                    {Array.from({length: previewKeyCount}).map((_, i) => {
                                        const keyStr = previewKeyCount + 'K';
                                        const globalColors = settings.skinOverrides.maniaColors || currentSkin.maniaColors;
                                        
                                        let currentColors: string[] = [];
                                        if (settings.skinOverrides.perKeyColors && settings.skinOverrides.perKeyColors[keyStr]) {
                                            currentColors = settings.skinOverrides.perKeyColors[keyStr];
                                        } else {
                                            currentColors = Array.from({length: previewKeyCount}, (_, idx) => globalColors[idx % globalColors.length]);
                                        }
                                        
                                        const activeColor = currentColors[i] || '#ffffff';

                                        return (
                                            <div key={i} className="flex flex-col items-center">
                                                <input 
                                                    type="color"
                                                    value={activeColor}
                                                    onChange={(e) => {
                                                        const keyStr = previewKeyCount + 'K';
                                                        let newKeyColors = settings.skinOverrides.perKeyColors?.[keyStr] ? [...settings.skinOverrides.perKeyColors[keyStr]] : null;
                                                        
                                                        if (!newKeyColors) {
                                                            const baseColors = settings.skinOverrides.maniaColors || currentSkin.maniaColors;
                                                            newKeyColors = Array.from({length: previewKeyCount}, (_, idx) => baseColors[idx % baseColors.length]);
                                                        }
                                                        
                                                        if (i < newKeyColors.length) {
                                                            newKeyColors[i] = e.target.value;
                                                        }
                                                        
                                                        onUpdate({
                                                            ...settings,
                                                            skinOverrides: { 
                                                                ...settings.skinOverrides, 
                                                                perKeyColors: {
                                                                    ...settings.skinOverrides.perKeyColors,
                                                                    [keyStr]: newKeyColors
                                                                } 
                                                            }
                                                        });
                                                    }}
                                                    className="bg-transparent w-8 h-8 cursor-pointer rounded overflow-hidden border-0 mb-1"
                                                />
                                                <span className="text-[10px] opacity-30">{i+1}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="text-xs opacity-50 italic mb-4">
                                    Changes here are specific to {previewKeyCount}K mode.
                                </div>

                                <button 
                                    onClick={() => {
                                        const keyStr = previewKeyCount + 'K';
                                        if (settings.skinOverrides.perKeyColors && settings.skinOverrides.perKeyColors[keyStr]) {
                                            const newPerKey = { ...settings.skinOverrides.perKeyColors };
                                            delete newPerKey[keyStr];
                                            onUpdate({
                                                ...settings,
                                                skinOverrides: { ...settings.skinOverrides, perKeyColors: newPerKey }
                                            });
                                        }
                                    }}
                                    className="text-xs text-red-400 hover:text-red-300 underline"
                                >
                                    Reset {previewKeyCount}K Colors to Default
                                </button>
                            </div>
                        </div>
                    </section>
                </div>
            )}
            
            {activeTab === 'Mods' && (
                <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
                    <section>
                        <h3 className="text-white font-bold text-lg mb-4">Difficulty Reduction</h3>
                        <Toggle label="Easy" checked={settings.modifiers.easy} onChange={(v) => updateMod('easy', v)} />
                        <Toggle label="No Fail" checked={settings.modifiers.noFail} onChange={(v) => updateMod('noFail', v)} />
                        <Toggle label="Half Time" checked={settings.modifiers.halfTime} onChange={(v) => updateMod('halfTime', v)} />
                    </section>

                    <section>
                        <h3 className="text-white font-bold text-lg mb-4">Difficulty Increase</h3>
                        <Toggle label="Hard Rock" checked={settings.modifiers.hardRock} onChange={(v) => updateMod('hardRock', v)} />
                        <Toggle label="Sudden Death" checked={settings.modifiers.suddenDeath} onChange={(v) => updateMod('suddenDeath', v)} />
                        <Toggle label="Perfect" checked={settings.modifiers.perfect} onChange={(v) => updateMod('perfect', v)} />
                        <Toggle label="Double Time" checked={settings.modifiers.doubleTime} onChange={(v) => updateMod('doubleTime', v)} />
                    </section>

                    <section>
                        <h3 className="text-white font-bold text-lg mb-4">Special</h3>
                        <Toggle label="Autoplay" checked={settings.modifiers.autoPlay} onChange={(v) => updateMod('autoPlay', v)} />
                    </section>
                    
                    <section>
                        <h3 className="text-white font-bold text-lg mb-4">Conversion</h3>
                        <Toggle label="Random" checked={settings.modifiers.random} onChange={(v) => updateMod('random', v)} />
                        <Toggle label="Mirror" checked={settings.modifiers.mirror} onChange={(v) => updateMod('mirror', v)} />
                        <Toggle label="Constant Speed" checked={settings.modifiers.constantSpeed} onChange={(v) => updateMod('constantSpeed', v)} />
                        <Toggle label="Hold Off" checked={settings.modifiers.holdOff} onChange={(v) => updateMod('holdOff', v)} />
                    </section>

                    <section>
                        <h3 className="text-white font-bold text-lg mb-4">Custom</h3>
                        <div className="mb-4">
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-sm font-bold text-white/70">Song Speed</span>
                                <span className="text-sm font-mono text-blue-400">{settings.modifiers.songSpeed.toFixed(2)}x</span>
                            </div>
                            <input 
                                type="range" min="0.5" max="2.0" step="0.05" 
                                value={settings.modifiers.songSpeed} 
                                onChange={e => updateMod('songSpeed', parseFloat(e.target.value))} 
                                className="w-full accent-blue-500" 
                            />
                        </div>
                        <Toggle label="Accuracy Override" checked={settings.modifiers.accuracyOverride} onChange={(v) => updateMod('accuracyOverride', v)} />
                        <Toggle label="HP Drain Override" checked={settings.modifiers.hpDrainOverride} onChange={(v) => updateMod('hpDrainOverride', v)} />
                        <Toggle label="Fade In" checked={settings.modifiers.fadeIn} onChange={(v) => updateMod('fadeIn', v)} />
                        <Toggle label="Fade Out" checked={settings.modifiers.fadeOut} onChange={(v) => updateMod('fadeOut', v)} />
                    </section>
                    
                    <button 
                         onClick={() => onUpdate({ ...settings, modifiers: DEFAULT_SETTINGS.modifiers })}
                         className="w-full py-3 bg-red-600 hover:bg-red-500 rounded font-bold text-white transition mt-4"
                    >
                        Reset Mods
                    </button>
                </div>
            )}

            {activeTab === 'Keybinds' && (
                <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                     <p className="text-sm opacity-50 italic">Click any keybind to reassign it. Keybinds are specific to key count.</p>
                     
                     <div className="grid grid-cols-1 gap-6">
                         {Object.entries(settings.keybinds.mania).map(([keyCount, keys]) => (
                             <section key={keyCount} className="bg-white/5 p-4 rounded-lg">
                                 <h3 className="text-blue-400 font-bold mb-3 text-sm uppercase">{keyCount}</h3>
                                 <div className="flex flex-wrap gap-2">
                                     {keys.map((k, i) => (
                                         <button 
                                            key={i} 
                                            onClick={() => setRebind({ mode: 'mania', maniaKey: keyCount, index: i })}
                                            className="bg-black/30 hover:bg-blue-500/20 hover:border-blue-500 border border-white/10 rounded w-10 h-10 flex items-center justify-center font-mono font-bold uppercase transition text-sm"
                                         >
                                            {k}
                                         </button>
                                     ))}
                                 </div>
                             </section>
                         ))}
                     </div>
                </div>
            )}
        </div>

        <div className="p-6 border-t border-white/5 bg-[#131519] flex justify-end">
             <button onClick={onClose} className="px-8 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded shadow-lg shadow-blue-500/20 transition">DONE</button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;