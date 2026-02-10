import { BeatmapData, SettingsState, CustomSkinData } from '../types';

const DB_NAME = 'OsuWebCloneDB';
const DB_VERSION = 2; 

export const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('beatmaps')) {
        db.createObjectStore('beatmaps', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('skins')) {
        db.createObjectStore('skins', { keyPath: 'name' });
      }
    };
  });
};

export const saveBeatmap = async (beatmap: BeatmapData, audioBlob: Blob, backgroundBlob?: Blob) => {
  const db = await initDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('beatmaps', 'readwrite');
    const store = tx.objectStore('beatmaps');
    
    const record = {
      ...beatmap,
      audioBlob: audioBlob,
      backgroundBlob: backgroundBlob,
      addedAt: Date.now()
    };
    
    store.put(record);
    
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

export const updateBeatmap = async (beatmap: BeatmapData) => {
    const db = await initDB();
    return new Promise<void>((resolve, reject) => {
        const tx = db.transaction('beatmaps', 'readwrite');
        const store = tx.objectStore('beatmaps');
        
        if (beatmap.id) {
            const req = store.get(beatmap.id);
            req.onsuccess = () => {
                const record = req.result;
                const updated = { ...record, ...beatmap };
                store.put(updated);
            };
        }
        
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
};

export const deleteBeatmap = async (id: number) => {
    const db = await initDB();
    return new Promise<void>((resolve, reject) => {
        const tx = db.transaction('beatmaps', 'readwrite');
        const store = tx.objectStore('beatmaps');
        store.delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
};

export const getAllBeatmaps = async (): Promise<BeatmapData[]> => {
  const db = await initDB();
  return new Promise((resolve) => {
    const tx = db.transaction('beatmaps', 'readonly');
    const store = tx.objectStore('beatmaps');
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
  });
};

export const saveSettings = async (settings: SettingsState) => {
  const db = await initDB();
  const tx = db.transaction('settings', 'readwrite');
  tx.objectStore('settings').put({ id: 'user_settings', ...settings });
};

export const getSettings = async (): Promise<SettingsState | undefined> => {
  const db = await initDB();
  return new Promise((resolve) => {
    const tx = db.transaction('settings', 'readonly');
    const store = tx.objectStore('settings');
    const request = store.get('user_settings');
    request.onsuccess = () => resolve(request.result as SettingsState);
  });
};

export const saveSkin = async (skin: CustomSkinData) => {
    const db = await initDB();
    return new Promise<void>((resolve, reject) => {
        const tx = db.transaction('skins', 'readwrite');
        tx.objectStore('skins').put(skin);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
};

export const getSkin = async (name: string): Promise<CustomSkinData | undefined> => {
    const db = await initDB();
    return new Promise((resolve) => {
        const tx = db.transaction('skins', 'readonly');
        const store = tx.objectStore('skins');
        const req = store.get(name);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(undefined);
    });
};

export const getAllSkins = async (): Promise<CustomSkinData[]> => {
    const db = await initDB();
    return new Promise((resolve) => {
        const tx = db.transaction('skins', 'readonly');
        const store = tx.objectStore('skins');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result);
    });
};

export const clearDatabase = async () => {
    const db = await initDB();
    return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['beatmaps', 'settings', 'skins'], 'readwrite');
        tx.objectStore('beatmaps').clear();
        tx.objectStore('settings').clear();
        tx.objectStore('skins').clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
};