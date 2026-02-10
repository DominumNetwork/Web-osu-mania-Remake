import React, { useState, useEffect, useRef } from 'react';
import { BeatmapData, GameMode, SettingsState, GameScore } from './types';
import { DEFAULT_SETTINGS } from './constants';
import { parseOsuFile } from './utils/parser';
import { audioManager } from './utils/audio';
import { saveBeatmap, getAllBeatmaps, saveSettings, getSettings, deleteBeatmap, updateBeatmap } from './utils/db';
import GameRenderer from './components/GameRenderer';
import SettingsModal from './components/SettingsModal';

enum Screen { Menu, SongSelect, Playing, Results, Direct }

const GENRES = [
    { id: 0, name: 'Any' }, { id: 1, name: 'Unspecified' }, { id: 2, name: 'Video Game' }, 
    { id: 3, name: 'Anime' }, { id: 4, name: 'Rock' }, { id: 5, name: 'Pop' }, 
    { id: 6, name: 'Other' }, { id: 7, name: 'Novelty' }, { id: 9, name: 'Hip Hop' }, 
    { id: 10, name: 'Electronic' }, { id: 11, name: 'Metal' }, { id: 12, name: 'Classical' }, 
    { id: 13, name: 'Folk' }, { id: 14, name: 'Jazz' }
];

const LANGUAGES = [
    { id: 0, name: 'Any' }, { id: 2, name: 'English' }, { id: 4, name: 'Chinese' }, 
    { id: 7, name: 'French' }, { id: 8, name: 'German' }, { id: 11, name: 'Italian' }, 
    { id: 3, name: 'Japanese' }, { id: 6, name: 'Korean' }, { id: 10, name: 'Spanish' }, 
    { id: 9, name: 'Swedish' }, { id: 12, name: 'Russian' }, { id: 13, name: 'Polish' }, 
    { id: 5, name: 'Instrumental' }, { id: 1, name: 'Other' }
];

const STATUSES = [
    { id: 'all', name: 'Any' }, { id: '1', name: 'Ranked' }, { id: '3', name: 'Qualified' }, 
    { id: '4', name: 'Loved' }, { id: '0', name: 'Pending' }, { id: '-1', name: 'WIP' }, 
    { id: '-2', name: 'Graveyard' }
];

type SortOption = 'Title' | 'Artist' | 'Difficulty' | 'Date';

const App: React.FC = () => {
  const [screen, setScreen] = useState<Screen>(Screen.Menu);
  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [beatmaps, setBeatmaps] = useState<BeatmapData[]>([]);
  const [selectedBeatmap, setSelectedBeatmap] = useState<BeatmapData | null>(null);
  const [lastScore, setLastScore] = useState<GameScore | null>(null);
  const [gameKey, setGameKey] = useState(0);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [directMaps, setDirectMaps] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<{id: number, percent: number} | null>(null);
  
  const [searchStatus, setSearchStatus] = useState('all');
  const [searchGenre, setSearchGenre] = useState(0);
  const [searchLanguage, setSearchLanguage] = useState(0);

  const [sortOption, setSortOption] = useState<SortOption>('Title');
  const [sortDesc, setSortDesc] = useState(false);

  useEffect(() => {
    const init = async () => {
        const savedSettings = await getSettings();
        if (savedSettings) {
            setSettings(prev => ({ ...prev, ...savedSettings }));
        }
        refreshBeatmaps();
    };
    init();
  }, []);

  const refreshBeatmaps = async () => {
      const savedBeatmaps = await getAllBeatmaps();
      if (savedBeatmaps.length > 0) {
          setBeatmaps(savedBeatmaps);
      }
  };

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const processImportedZip = async (zip: any, defaultTitle?: string, defaultArtist?: string) => {
      const osuFiles = Object.keys(zip.files).filter(n => n.endsWith('.osu'));
      let processed = false;

      for (const name of osuFiles) {
         try {
             const text = await zip.files[name].async('string');
             const map = parseOsuFile(text);
             
             if(map.metadata.title === 'Unknown' && defaultTitle) map.metadata.title = defaultTitle;
             if(map.metadata.artist === 'Unknown' && defaultArtist) map.metadata.artist = defaultArtist;

             let audioBlob: Blob | null = null;
             const targetAudioName = map.audioFilename.trim().toLowerCase();
             let zipAudioKey = Object.keys(zip.files).find(k => k.toLowerCase() === targetAudioName);
             
             if (zipAudioKey) {
                 audioBlob = await zip.files[zipAudioKey].async('blob');
             } 
             
             if (!audioBlob) {
                 let maxBytes = 0;
                 let bestFile = null;
                 for (const key of Object.keys(zip.files)) {
                     const lowerKey = key.toLowerCase();
                     if (lowerKey.endsWith('.mp3') || lowerKey.endsWith('.ogg')) {
                         const f = zip.files[key];
                         if (!f.dir) {
                             const blob = await f.async('blob');
                             if (blob.size > maxBytes) {
                                 maxBytes = blob.size;
                                 bestFile = blob;
                             }
                         }
                     }
                 }
                 if (bestFile) audioBlob = bestFile;
             }
             
             let bgBlob: Blob | undefined = undefined;
             if (map.backgroundFilename) {
                 const targetBgName = map.backgroundFilename.trim().toLowerCase();
                 const zipBgKey = Object.keys(zip.files).find(k => k.toLowerCase() === targetBgName);
                 if (zipBgKey) {
                     bgBlob = await zip.files[zipBgKey].async('blob');
                 }
             }

             if (audioBlob) {
                 await saveBeatmap(map, audioBlob, bgBlob);
                 processed = true;
             }
         } catch (e) {
             console.error("Failed to process map file", name, e);
         }
      }
      return processed;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    
    let hasUpdates = false;

    try {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          if (file.name.endsWith('.osu')) {
            const text = await file.text();
            const map = parseOsuFile(text);
            await saveBeatmap(map, new Blob([])); 
            hasUpdates = true;
          } else if (file.name.endsWith('.osz')) {
              const zip = new (window as any).JSZip();
              const contents = await zip.loadAsync(file);
              const processed = await processImportedZip(contents);
              if (processed) hasUpdates = true;
          }
        }
    } catch (err) {
      console.error("Import failed", err);
      alert("Import failed.");
    }

    if (hasUpdates) {
        await refreshBeatmaps();
        alert("Import successful!");
    }
    e.target.value = '';
  };

  const searchDirect = async () => {
      if(isSearching) return;
      setIsSearching(true);
      try {
          const baseUrl = settings.beatmapProvider === 'NeriNyan' 
            ? 'https://api.nerinyan.moe/search' 
            : 'https://catboy.best/api/v2/search';
          
          let url = `${baseUrl}?q=${encodeURIComponent(searchQuery)}&mode=3`;
          
          if (searchStatus !== 'all') url += `&status=${searchStatus}`;
          if (searchGenre !== 0) url += `&genre=${searchGenre}`;
          if (searchLanguage !== 0) url += `&language=${searchLanguage}`;
          
          const res = await fetch(url);
          const data = await res.json();
          setDirectMaps(Array.isArray(data) ? data : (data.data || []));
      } catch(e) {
          alert("Failed to search beatmaps.");
      }
      setIsSearching(false);
  };

  const downloadMap = async (mapSet: any) => {
      const downloadUrl = `https://catboy.best/d/${mapSet.id}`; 
      try {
          setDownloadProgress({ id: mapSet.id, percent: 0 });
          
          const response = await fetch(downloadUrl);
          if (!response.body) throw new Error("No response body");

          const contentLength = response.headers.get('content-length');
          const total = contentLength ? parseInt(contentLength, 10) : 0;
          let loaded = 0;

          const reader = response.body.getReader();
          const chunks = [];

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            chunks.push(value);
            loaded += value.length;
            if (total > 0) {
                 setDownloadProgress({ id: mapSet.id, percent: (loaded / total) * 100 });
            }
          }

          const blob = new Blob(chunks);
          
          const zip = new (window as any).JSZip();
          const contents = await zip.loadAsync(blob);
          
          const processed = await processImportedZip(contents, mapSet.title, mapSet.artist);
          
          if (processed) {
             await refreshBeatmaps();
          }

          setDownloadProgress(null);
      } catch(e) {
          console.error(e);
          alert("Download failed.");
          setDownloadProgress(null);
      }
  };

  const deleteMap = async (e: React.MouseEvent, id: number) => {
      e.preventDefault();
      e.stopPropagation();
      if(confirm("Delete this beatmap?")) {
          await deleteBeatmap(id);
          await refreshBeatmaps();
          if(selectedBeatmap?.id === id) {
              setSelectedBeatmap(null);
              audioManager.stop();
          }
      }
  };

  const toggleFavorite = async (e: React.MouseEvent, map: BeatmapData) => {
      e.preventDefault();
      e.stopPropagation();
      if (!map.id) return;
      const updated = { ...map, favorite: !map.favorite };
      await updateBeatmap(updated);
      await refreshBeatmaps();
      if (selectedBeatmap?.id === map.id) setSelectedBeatmap(updated);
  };

  const getSortedBeatmaps = () => {
      return beatmaps.sort((a, b) => {
          if (a.favorite && !b.favorite) return -1;
          if (!a.favorite && b.favorite) return 1;

          let res = 0;
          switch (sortOption) {
              case 'Title':
                  res = a.metadata.title.localeCompare(b.metadata.title);
                  break;
              case 'Artist':
                  res = a.metadata.artist.localeCompare(b.metadata.artist);
                  break;
              case 'Difficulty':
                  res = a.difficulty.overallDifficulty - b.difficulty.overallDifficulty;
                  break;
              case 'Date':
                  res = (a.id || 0) - (b.id || 0);
                  break;
          }
          return sortDesc ? -res : res;
      });
  };

  const sortedBeatmaps = getSortedBeatmaps();
  
  const selectBeatmap = async (map: BeatmapData) => {
      setSelectedBeatmap(map);
      const all = await getAllBeatmaps();
      const stored = all.find(b => b.id === map.id);
      if(stored && stored.audioBlob) {
          await audioManager.loadAudio(stored.audioBlob);
          audioManager.play(); 
      }
  };

  const startGame = () => {
    if (selectedBeatmap) {
        audioManager.stop(); 
        setGameKey(prev => prev + 1);
        setScreen(Screen.Playing);
    }
  };

  const handleResetFilters = () => {
      setSearchQuery('');
      setSearchStatus('all');
      setSearchGenre(0);
      setSearchLanguage(0);
  };

  const getBgUrl = (map: BeatmapData) => {
      if (map.backgroundBlob) {
          return URL.createObjectURL(map.backgroundBlob);
      }
      if (map.metadata.beatmapId && map.metadata.beatmapId !== '0') {
           return null;
      }
      return null;
  };

  return (
    <div className="w-full h-screen bg-[#0f1115] text-white font-['Exo_2'] overflow-hidden flex flex-col">
      <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} settings={settings} onUpdate={setSettings} />
      
      {selectedBeatmap && selectedBeatmap.backgroundBlob && screen !== Screen.Playing && (
          <div className="absolute inset-0 z-0 opacity-30 pointer-events-none">
              <img src={URL.createObjectURL(selectedBeatmap.backgroundBlob)} className="w-full h-full object-cover blur-sm" alt="bg" />
              <div className="absolute inset-0 bg-black/50" />
          </div>
      )}

      {screen !== Screen.Playing && (
        <nav className="h-16 bg-[#131519]/80 backdrop-blur border-b border-white/5 flex items-center justify-between px-4 sm:px-8 shrink-0 z-50 shadow-lg relative">
          <div className="flex items-center space-x-6">
            <h1 className="text-2xl font-black italic text-blue-500 cursor-pointer tracking-tighter" onClick={() => setScreen(Screen.Menu)}>osu!web</h1>
            <button 
                onClick={() => setScreen(Screen.Direct)}
                className={`text-sm font-bold uppercase tracking-wider transition ${screen === Screen.Direct ? 'text-blue-400' : 'text-white/50 hover:text-white'}`}
            >
                Search Beatmaps
            </button>
          </div>
          <button onClick={() => setShowSettings(true)} className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition text-xl">⚙️</button>
        </nav>
      )}

      <div className="flex-1 overflow-hidden relative z-10">
        {screen === Screen.Menu && (
          <div className="flex flex-col items-center justify-center h-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/20 via-transparent to-transparent p-6 text-center">
            <div className="w-64 h-64 sm:w-96 sm:h-96 rounded-full bg-blue-500 flex items-center justify-center shadow-[0_0_100px_rgba(59,130,246,0.3)] hover:scale-105 transition-all duration-500 cursor-pointer group active:scale-95 border-4 border-white/10" onClick={() => setScreen(Screen.SongSelect)}>
              <div className="text-center group-hover:tracking-widest transition-all">
                <span className="text-7xl sm:text-8xl font-black italic text-white drop-shadow-md">osu!</span>
              </div>
            </div>
            <p className="mt-12 text-blue-400 text-sm tracking-[0.5em] uppercase font-bold animate-pulse">Click to Start</p>
          </div>
        )}

        {screen === Screen.Direct && (
            <div className="flex h-full w-full">
                <div className="w-80 bg-[#111318] border-r border-white/5 flex flex-col h-full shrink-0 overflow-y-auto custom-scrollbar">
                     <div className="p-4 border-b border-white/5 flex items-center justify-between">
                         <h2 className="text-xl font-bold">Filters</h2>
                         <button onClick={() => setScreen(Screen.Menu)} className="text-xs text-blue-400 hover:text-white transition uppercase font-bold">Close</button>
                     </div>
                     
                     <div className="p-6 space-y-8">
                         <div className="space-y-2">
                             <div className="text-sm font-bold text-white/60 uppercase tracking-wider">Search</div>
                             <div className="flex space-x-2">
                                <input 
                                    type="text" 
                                    placeholder="Type in keywords..." 
                                    className="w-full bg-black/30 border border-white/10 rounded px-3 py-2 text-sm focus:border-blue-500 outline-none placeholder-white/20"
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && searchDirect()}
                                />
                                <button 
                                    onClick={searchDirect}
                                    className="px-3 bg-blue-600 hover:bg-blue-500 rounded text-white transition flex items-center justify-center"
                                >
                                    🔍
                                </button>
                             </div>
                         </div>

                         <div className="space-y-2">
                             <div className="text-sm font-bold text-white/60 uppercase tracking-wider">Categories</div>
                             <div className="flex flex-wrap gap-2">
                                {STATUSES.map(s => (
                                    <button 
                                        key={s.id}
                                        onClick={() => setSearchStatus(s.id)}
                                        className={`px-2 py-1 text-xs font-bold rounded transition ${searchStatus === s.id ? 'text-blue-400 bg-blue-500/10' : 'text-white/50 hover:text-white'}`}
                                    >
                                        {s.name}
                                    </button>
                                ))}
                             </div>
                         </div>

                         <div className="space-y-2">
                             <div className="text-sm font-bold text-white/60 uppercase tracking-wider">Genre</div>
                             <div className="flex flex-wrap gap-x-3 gap-y-1">
                                 {GENRES.map(g => (
                                     <button
                                        key={g.id}
                                        onClick={() => setSearchGenre(g.id)}
                                        className={`text-xs transition ${searchGenre === g.id ? 'text-blue-400 font-bold' : 'text-white/50 hover:text-white'}`}
                                     >
                                         {g.name}
                                     </button>
                                 ))}
                             </div>
                         </div>

                         <div className="space-y-2">
                             <div className="text-sm font-bold text-white/60 uppercase tracking-wider">Language</div>
                             <div className="flex flex-wrap gap-x-3 gap-y-1">
                                 {LANGUAGES.map(l => (
                                     <button
                                        key={l.id}
                                        onClick={() => setSearchLanguage(l.id)}
                                        className={`text-xs transition ${searchLanguage === l.id ? 'text-blue-400 font-bold' : 'text-white/50 hover:text-white'}`}
                                     >
                                         {l.name}
                                     </button>
                                 ))}
                             </div>
                         </div>

                         <button 
                            onClick={handleResetFilters}
                            className="w-full py-3 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white border border-red-500/30 rounded font-bold text-xs uppercase tracking-wider transition"
                         >
                             Reset Filters
                         </button>
                     </div>
                </div>

                <div className="flex-1 bg-[#0a0c10] p-6 overflow-y-auto custom-scrollbar">
                     <div className="flex-1 space-y-3">
                        {isSearching && (
                            <div className="text-center py-20 animate-pulse text-blue-400 font-bold tracking-widest">SEARCHING...</div>
                        )}

                        {!isSearching && directMaps.map((set: any) => (
                            <div key={set.id} className="bg-[#15171c] p-3 rounded-lg border border-white/5 flex justify-between items-center hover:border-blue-500/40 hover:bg-[#1a1d24] transition group shadow-sm">
                                <div className="flex items-center space-x-4">
                                    <div className="relative w-32 h-20 rounded-lg overflow-hidden shrink-0">
                                         <img src={`https://assets.ppy.sh/beatmaps/${set.id}/covers/list.jpg`} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition" alt="cover" />
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="font-bold text-lg text-white group-hover:text-blue-400 transition truncate">{set.title}</h3>
                                        <p className="text-sm text-white/50 truncate">{set.artist} // </p>
                                        <div className="flex space-x-2 mt-2">
                                            <span className="text-[10px] bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded uppercase font-bold tracking-wide border border-blue-500/20">{set.status}</span>
                                            <span className="text-[10px] bg-white/5 px-2 py-0.5 rounded text-white/60">BPM: {set.bpm}</span>
                                            <span className="text-[10px] bg-white/5 px-2 py-0.5 rounded text-white/60">☆ {set.difficulty_rating?.toFixed(1) || '?'}</span>
                                        </div>
                                    </div>
                                </div>
                                
                                {downloadProgress?.id === set.id ? (
                                    <div className="w-32 bg-white/10 rounded-full h-2 overflow-hidden">
                                        <div className="bg-blue-500 h-full transition-all duration-300" style={{width: `${downloadProgress.percent}%`}}></div>
                                    </div>
                                ) : (
                                    <button 
                                        onClick={() => downloadMap(set)}
                                        className="px-6 py-2 bg-[#1f2229] hover:bg-blue-600 text-blue-400 hover:text-white border border-blue-500/20 hover:border-transparent text-xs font-black uppercase tracking-wider rounded transition"
                                    >
                                        Download
                                    </button>
                                )}
                            </div>
                        ))}
                        
                        {!isSearching && directMaps.length === 0 && (
                            <div className="flex flex-col items-center justify-center h-full opacity-20 mt-20">
                                <span className="text-6xl mb-4">🔍</span>
                                <span className="font-bold">Search for beatmaps to download</span>
                            </div>
                        )}
                     </div>
                </div>
            </div>
        )}

        {screen === Screen.SongSelect && (
          <div className="flex h-full flex-col sm:flex-row">
            <div className="w-full sm:w-1/3 bg-[#111318]/90 border-r border-white/5 overflow-y-auto order-2 sm:order-1 flex flex-col">
               <div className="p-4 bg-[#181a20] border-b border-white/5 space-y-3">
                    <input type="file" multiple onChange={handleFileUpload} className="hidden" id="import-btn" />
                    <label htmlFor="import-btn" className="block w-full text-center py-3 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg hover:bg-blue-500 hover:text-white transition cursor-pointer font-bold text-sm uppercase tracking-wide">
                        Import Map (.osz)
                    </label>

                    <div className="flex items-center space-x-2 bg-black/20 p-2 rounded">
                        <select 
                            value={sortOption} 
                            onChange={(e) => setSortOption(e.target.value as SortOption)}
                            className="bg-transparent text-xs font-bold uppercase text-white/60 outline-none flex-1"
                        >
                            <option value="Title">Title</option>
                            <option value="Artist">Artist</option>
                            <option value="Difficulty">Difficulty</option>
                            <option value="Date">Added</option>
                        </select>
                        <button onClick={() => setSortDesc(!sortDesc)} className="text-white/60 hover:text-white text-xs font-bold uppercase">
                            {sortDesc ? 'DESC' : 'ASC'}
                        </button>
                    </div>
               </div>

              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {sortedBeatmaps.length === 0 ? (
                  <div className="text-center py-20 opacity-20 italic text-sm p-4">
                    No maps found. <br/> Check "Direct" to download some.
                  </div>
                ) : (
                   sortedBeatmaps.map((map, i) => (
                      <div key={i}>
                          <div 
                            onClick={() => selectBeatmap(map)} 
                            className={`p-4 rounded-xl cursor-pointer border-l-4 transition-all relative overflow-hidden group ${selectedBeatmap === map ? 'bg-[#1a1d24] border-blue-500' : 'bg-[#15171c] border-transparent hover:bg-[#1a1d24]'}`}
                          >
                             {map.backgroundBlob && (
                                 <div className="absolute inset-0 z-0 opacity-20 group-hover:opacity-30 transition">
                                     <img src={URL.createObjectURL(map.backgroundBlob)} className="w-full h-full object-cover" alt="card-bg" />
                                 </div>
                             )}
                             <div className="relative z-10 flex justify-between items-start">
                                <div>
                                    <h3 className={`font-bold text-sm leading-tight ${selectedBeatmap === map ? 'text-white' : 'text-white/80'}`}>
                                        {map.favorite && <span className="text-yellow-400 mr-1">★</span>}
                                        {map.metadata.title}
                                    </h3>
                                    <p className="text-xs opacity-50 mt-1">{map.metadata.artist}</p>
                                    <div className="flex justify-between items-end mt-2">
                                        <span className="text-[10px] text-blue-400 font-bold uppercase tracking-wider">{map.metadata.version}</span>
                                        <span className="text-xs font-bold bg-black/30 px-2 py-0.5 rounded text-white/70 ml-2">{map.difficulty.overallDifficulty.toFixed(1)}★</span>
                                    </div>
                                </div>
                                <div className="opacity-0 group-hover:opacity-100 flex flex-col space-y-1 transition-opacity">
                                    {map.id && (
                                        <>
                                            <button onClick={(e) => toggleFavorite(e, map)} className="text-yellow-500 hover:text-yellow-400 text-xs p-1">
                                                {map.favorite ? '★' : '☆'}
                                            </button>
                                            <button onClick={(e) => deleteMap(e, map.id!)} className="text-red-500 hover:text-red-400 text-xs p-1">
                                                ✕
                                            </button>
                                        </>
                                    )}
                                </div>
                             </div>
                          </div>
                          <div className="h-px w-full bg-white/5 my-1" />
                      </div>
                   ))
                )}
              </div>
            </div>
            
            <div className="flex-1 bg-transparent flex flex-col items-center justify-center p-8 relative overflow-hidden order-1 sm:order-2 shrink-0">
               {selectedBeatmap ? (
                 <div className="relative z-10 w-full max-w-2xl animate-in zoom-in-95 duration-300 flex flex-col items-center">
                    
                    <div className="w-full bg-[#15171c]/90 backdrop-blur border border-white/5 rounded-2xl p-6 shadow-2xl mb-8 flex items-center space-x-6 relative overflow-hidden">
                        {selectedBeatmap.backgroundBlob && (
                            <div className="absolute inset-0 opacity-10">
                                <img src={URL.createObjectURL(selectedBeatmap.backgroundBlob)} className="w-full h-full object-cover" alt="header-bg" />
                            </div>
                        )}
                        <div className="w-32 h-32 bg-blue-500/10 rounded-xl flex items-center justify-center text-4xl shadow-inner shrink-0 overflow-hidden relative border border-white/10 z-10">
                            {selectedBeatmap.backgroundBlob ? (
                                <img src={URL.createObjectURL(selectedBeatmap.backgroundBlob)} className="w-full h-full object-cover" alt="icon" />
                            ) : (
                                <span>🎵</span>
                            )}
                        </div>
                        <div className="flex-1 min-w-0 z-10">
                             <h2 className="text-3xl font-black italic text-white truncate">{selectedBeatmap.metadata.title}</h2>
                             <p className="text-xl text-white/50 truncate mb-4">{selectedBeatmap.metadata.artist}</p>
                             <div className="flex space-x-2">
                                 <span className="px-3 py-1 bg-white/5 rounded text-sm font-bold text-white/60">BPM: N/A</span>
                                 <span className="px-3 py-1 bg-white/5 rounded text-sm font-bold text-white/60">CS: {selectedBeatmap.difficulty.circleSize}</span>
                                 <span className="px-3 py-1 bg-white/5 rounded text-sm font-bold text-white/60">OD: {selectedBeatmap.difficulty.overallDifficulty}</span>
                             </div>
                        </div>
                    </div>

                    <button onClick={startGame} className="w-64 py-5 bg-blue-600 hover:bg-blue-500 hover:scale-105 rounded-xl font-black text-2xl transition shadow-xl shadow-blue-600/20 active:scale-95 flex items-center justify-center space-x-3 group z-10">
                       <span className="tracking-widest italic">PLAY</span>
                    </button>
                 </div>
               ) : (
                 <div className="relative z-10 text-center opacity-20 py-10">
                    <span className="text-9xl block mb-4 grayscale">🎹</span>
                    <h2 className="text-2xl font-bold">Select a beatmap</h2>
                 </div>
               )}
            </div>
          </div>
        )}

        {screen === Screen.Playing && selectedBeatmap && (
          <GameRenderer 
            key={gameKey}
            beatmap={selectedBeatmap} 
            settings={settings} 
            onExit={(s) => { setLastScore(s); setScreen(Screen.Results); }} 
            onRestart={() => setGameKey(k => k + 1)} 
          />
        )}

        {screen === Screen.Results && lastScore && (
          <div className="flex flex-col items-center justify-center h-full bg-[#0a0c10] p-4">
             {selectedBeatmap && selectedBeatmap.backgroundBlob && (
                 <div className="absolute inset-0 z-0 opacity-20 pointer-events-none">
                     <img src={URL.createObjectURL(selectedBeatmap.backgroundBlob)} className="w-full h-full object-cover blur-sm" alt="bg" />
                 </div>
             )}
            <div className="bg-[#15171c]/90 border border-white/5 p-12 rounded-3xl shadow-2xl text-center max-w-4xl w-full relative z-10">
              <h1 className="text-6xl sm:text-8xl font-black italic text-blue-500 mb-2 tracking-tighter shadow-blue-500/50 drop-shadow-lg">CLEARED</h1>
              <div className="text-2xl text-white/50 font-bold mb-12 tracking-widest">{selectedBeatmap?.metadata.title}</div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-12 text-left mb-12">
                 <div className="space-y-6 flex flex-col justify-center">
                    <div className="text-center">
                        <div className="text-6xl font-black text-white">{lastScore.accuracy.toFixed(2)}%</div>
                        <div className="text-sm uppercase tracking-widest opacity-50 font-bold">Accuracy</div>
                    </div>
                    <div className="flex justify-around mt-4">
                        <div className="text-center">
                            <div className="text-2xl font-bold text-blue-400">{lastScore.score.toLocaleString()}</div>
                            <div className="text-xs uppercase opacity-40 font-bold">Score</div>
                        </div>
                        <div className="text-center">
                            <div className="text-2xl font-bold text-white">{lastScore.maxCombo}x</div>
                            <div className="text-xs uppercase opacity-40 font-bold">Max Combo</div>
                        </div>
                    </div>
                 </div>
                 <div className="grid grid-cols-2 gap-3">
                    {Object.entries(lastScore.hits).map(([k, v]) => (
                      <div key={k} className="bg-black/20 p-4 rounded-xl flex justify-between items-center border border-white/5">
                        <div className="text-xs font-bold opacity-40 uppercase tracking-wider">{k}</div>
                        <div className="text-xl font-bold">{v}</div>
                      </div>
                    ))}
                 </div>
              </div>
              <button onClick={() => setScreen(Screen.SongSelect)} className="px-16 py-4 bg-white/5 hover:bg-white/10 text-white rounded-xl font-bold text-lg transition border border-white/5">Back to Select</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;