import { CustomSkinData } from '../types';

export const parseSkin = async (file: File): Promise<CustomSkinData> => {
    const zip = new (window as any).JSZip();
    const contents = await zip.loadAsync(file);
    
    const skinName = file.name.replace('.osk', '');
    const data: CustomSkinData = {
        name: skinName,
        ini: {
            HitPosition: 402,
            ScorePosition: 325,
            ComboPosition: 111,
            ColumnWidth: 30, 
            Colours: {}
        },
        images: {}
    };

    let iniFile = null;
    let iniKey = Object.keys(contents.files).find(k => k.toLowerCase().endsWith('skin.ini'));
    if (iniKey) {
        iniFile = await contents.files[iniKey].async('string');
        parseSkinIni(iniFile, data);
    }

    const imageExtensions = ['.png', '.jpg', '.jpeg'];
    
    for (const filename of Object.keys(contents.files)) {
        if (contents.files[filename].dir) continue;
        
        const lowerName = filename.toLowerCase();
        if (!imageExtensions.some(ext => lowerName.endsWith(ext))) continue;

        let baseName = lowerName.split('/').pop()?.split('.')[0];
        
        if (baseName && baseName.endsWith('@2x')) {
            baseName = baseName.slice(0, -3);
        }

        if (baseName && (baseName.startsWith('mania-') || baseName.startsWith('lighting'))) {
             const blob = await contents.files[filename].async('blob');
             data.images[baseName] = blob;
        }
    }

    return data;
};

const parseSkinIni = (content: string, data: CustomSkinData) => {
    const lines = content.split(/\r?\n/).map(l => l.trim());
    let section = '';

    for (const line of lines) {
        if (line.startsWith('[') && line.endsWith(']')) {
            section = line.slice(1, -1);
            continue;
        }
        if (line.startsWith('//') || line.length === 0) continue;

        const parts = line.split(':');
        if (parts.length < 2) continue;

        const key = parts[0].trim();
        const val = parts[1].trim();

        if (section === 'Mania') {
            if (key === 'HitPosition') data.ini.HitPosition = parseInt(val);
            if (key === 'ScorePosition') data.ini.ScorePosition = parseInt(val);
            if (key === 'ComboPosition') data.ini.ComboPosition = parseInt(val);
            if (key === 'ColumnWidth') {
                const widths = val.split(',').map(n => parseInt(n));
                if (widths.length > 0) data.ini.ColumnWidth = widths[0]; 
            }
        }
    }
};