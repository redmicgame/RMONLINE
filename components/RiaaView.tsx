import React, { useState, useMemo } from 'react';
import { useGame, formatNumber } from '../context/GameContext';
import { useOnline } from '../context/OnlineContext';
import ArrowLeftIcon from './icons/ArrowLeftIcon';
import RiaaIcon from './icons/RiaaIcon';
import ShareIcon from './icons/ArrowUpOnBoxIcon';
import { GameDate } from '../types';
import { LABELS } from '../constants';

interface CertDetails {
    id: string;
    artist: string;
    title: string;
    format: 'SINGLE' | 'ALBUM';
    certifiedUnits: number; // in millions
    certName: string; // 'GOLD', 'PLATINUM', '2X MULTI PLATINUM', 'DIAMOND'
    certImageDetails: {
        text: string;
        color: string;
        ring: string;
    };
    label: string;
    date: string;
    releaseDate: string;
    genre: string;
    history: string[];
}

const getCertLevel = (units: number) => {
    if (units >= 10) return { name: units === 10 ? 'DIAMOND' : `${Math.floor(units)}X DIAMOND`, text: 'DIAMOND', color: '#e0f7fa', ring: '#b2ebf2' };
    if (units >= 2) return { name: `${Math.floor(units)}X MULTI PLATINUM`, text: `${Math.floor(units)}X PLATINUM`, color: '#e5e4e2', ring: '#d3d3d3'};
    if (units >= 1) return { name: 'PLATINUM', text: 'PLATINUM', color: '#e5e4e2', ring: '#d3d3d3' };
    if (units >= 0.5) return { name: 'GOLD', text: 'GOLD', color: '#ffd700', ring: '#e6c200' };
    return null;
};

const formatGameDate = (date?: GameDate) => {
    if (!date) return 'Unknown';
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const month = months[Math.floor(date.week / 4) % 12];
    const day = (date.week % 4) * 7 + 1; 
    return `${month} ${day}, ${date.year}`;
}

const getDeterministicCertDate = (releaseDate: GameDate | undefined, requiredUnits: number, seedString: string) => {
    if (!releaseDate) return 'Unknown';
    // Use title/artist string to get a deterministic offset
    let hash = 0;
    for (let i = 0; i < seedString.length; i++) {
        hash = seedString.charCodeAt(i) + ((hash << 5) - hash);
    }
    const pseudoRand = Math.abs(hash) % 100 / 100; // 0.0 to 1.0

    const releaseWeeks = releaseDate.year * 52 + releaseDate.week;
    
    // Determine how many weeks it "took" based on requirement
    let weeksTaken = 4;
    if (requiredUnits >= 10) weeksTaken = 104 + (pseudoRand * 104);
    else if (requiredUnits >= 2) weeksTaken = 52 + (pseudoRand * 52);
    else if (requiredUnits >= 1) weeksTaken = 26 + (pseudoRand * 26);
    else weeksTaken = 8 + (pseudoRand * 8);

    const thresholdWeeks = releaseWeeks + weeksTaken;
    return formatGameDate({ year: Math.floor(thresholdWeeks / 52), week: Math.floor(thresholdWeeks % 52) });
}

const getCertHistory = (
    units: number, 
    releaseDate: GameDate | undefined, 
    seedString: string,
    certifications?: { level: string; date: GameDate }[]
) => {
    if (certifications && certifications.length > 0) {
        return [...certifications].reverse().map(c => `${c.level} | ${formatGameDate(c.date)}`);
    }

    const history = [];
    const maxUnitsToFake = units >= 10 ? 10 : units >= 2 ? Math.floor(units) : units >= 1 ? 1 : 0.5;
    const certDateStr = getDeterministicCertDate(releaseDate, maxUnitsToFake, seedString);

    if (units >= 10) {
        history.push(`Diamond | ${certDateStr}`);
        history.push(`Multi Platinum | ${getDeterministicCertDate(releaseDate, 2, seedString)}`);
        history.push(`Platinum | ${getDeterministicCertDate(releaseDate, 1, seedString)}`);
        history.push(`Gold | ${getDeterministicCertDate(releaseDate, 0.5, seedString)}`);
    } else if (units >= 2) {
        history.push(`${Math.floor(units)}x Platinum | ${certDateStr}`);
        history.push(`Platinum | ${getDeterministicCertDate(releaseDate, 1, seedString)}`);
        history.push(`Gold | ${getDeterministicCertDate(releaseDate, 0.5, seedString)}`);
    } else if (units >= 1) {
        history.push(`Platinum | ${certDateStr}`);
        history.push(`Gold | ${getDeterministicCertDate(releaseDate, 0.5, seedString)}`);
    } else if (units >= 0.5) {
        history.push(`Gold | ${certDateStr}`);
    }
    return history;
}

const getLatestCertDate = (
    units: number, 
    releaseDate: GameDate | undefined, 
    seedString: string,
    certifications?: { level: string; date: GameDate }[]
) => {
    if (certifications && certifications.length > 0) {
        return formatGameDate(certifications[certifications.length - 1].date);
    }
    const maxUnitsToFake = units >= 10 ? 10 : units >= 2 ? Math.floor(units) : units >= 1 ? 1 : 0.5;
    return getDeterministicCertDate(releaseDate, maxUnitsToFake, seedString);
}

const CertItem: React.FC<{ cert: CertDetails }> = ({ cert }) => {
    const [expanded, setExpanded] = useState(false);

    return (
        <div className="bg-white text-black border border-black mb-4">
            <div className="flex p-4">
                <div className="w-24 h-24 flex-shrink-0 relative rounded-full border-4 border-zinc-200 overflow-hidden flex items-center justify-center p-1" style={{ backgroundColor: cert.certImageDetails.ring }}>
                    <div className="w-full h-full rounded-full border border-black flex flex-col items-center justify-center" style={{ backgroundColor: cert.certImageDetails.color }}>
                         <span className="font-bold text-xs uppercase text-center leading-tight">RIAA<br/>{cert.certImageDetails.text}</span>
                    </div>
                </div>
                <div className="ml-4 flex-grow">
                    <h2 className="text-2xl font-black uppercase font-sans tracking-tight leading-none mb-1">{cert.artist}</h2>
                    <p className="text-sm font-bold uppercase mb-1">Title: <span className="font-normal">{cert.title}</span></p>
                    <p className="text-sm font-bold uppercase mb-1">Certification Date: <span className="font-normal">{cert.date}</span></p>
                    <p className="text-sm font-bold uppercase mb-1">Label: <span className="font-normal">{cert.label}</span></p>
                    <p className="text-sm font-bold uppercase mb-4">Format: <span className="font-normal">{cert.format}</span></p>
                    
                    <div className="flex justify-between items-end mt-4">
                        <button className="flex items-center text-xs font-bold uppercase hover:underline">
                            Share <ShareIcon className="w-4 h-4 ml-1" />
                        </button>
                        <button onClick={() => setExpanded(!expanded)} className="text-xs font-bold uppercase hover:underline">
                            More Details {expanded ? '▲' : '▼'}
                        </button>
                    </div>
                </div>
            </div>
            {expanded && (
                <div className="bg-zinc-700 text-white p-4 text-sm mt-2">
                    <p><span className="font-bold">Release Date:</span> {cert.releaseDate}</p>
                    <p><span className="font-bold">Type:</span> Digital</p>
                    <p><span className="font-bold">Certified Units:</span> {cert.certifiedUnits} Million</p>
                    <p><span className="font-bold">Genre:</span> {cert.genre}</p>
                    <p className="font-bold mt-2">Previous Certification:</p>
                    {cert.history.length > 0 ? (
                        <div className="text-zinc-300 ml-4">
                            {cert.history.map((h, i) => <div key={i}>{h}</div>)}
                        </div>
                    ) : (
                        <p className="text-zinc-400 italic ml-4">None</p>
                    )}
                </div>
            )}
        </div>
    );
};

const RiaaView: React.FC = () => {
    const { gameState, dispatch, activeArtistData, activeArtist } = useGame();
    const { onlineSongs, onlineReleases } = useOnline();
    const [searchTerm, setSearchTerm] = useState('');
    const [formatFilter, setFormatFilter] = useState<'All' | 'Albums/EPs' | 'Singles'>('All');

    const allCerts = useMemo(() => {
        const certs: CertDetails[] = [];
        const { date } = gameState;
        
        let playerLabelStr = 'INDEPENDENT';
        if (activeArtistData?.contract) {
            const labelId = activeArtistData.contract.labelId;
            const major = LABELS.find(l => l.id === labelId);
            if (major) {
                playerLabelStr = major.name;
            } else {
                const custom = activeArtistData.customLabels?.find(l => l.id === labelId);
                if (custom) {
                    if (custom.dealWithMajorId) {
                        const dist = LABELS.find(l => l.id === custom.dealWithMajorId)?.name;
                        playerLabelStr = dist ? `${custom.name} / ${dist}` : custom.name;
                    } else {
                        playerLabelStr = custom.name;
                    }
                }
            }
        }
        
        // 1. Process Player Data
        if (activeArtistData && activeArtist) {
            const playerArtistName = activeArtist.name;
            
            // Player Singles
            activeArtistData.songs.forEach(song => {
                if (!song.isReleased && !song.releaseId) return; 
                const units = song.streams / 150 / 1000000;
                const level = getCertLevel(units);
                if (level) {
                     const certDateStr = getLatestCertDate(units, song.releaseDate, song.id, song.certifications);
                     const releaseDateStr = formatGameDate(song.releaseDate);

                     let labelStr = playerLabelStr;
                     // For player's releases, there could be taking down logic/rights owner, but we'll use active label to simplify
                     certs.push({
                        id: song.id,
                        artist: playerArtistName,
                        title: song.title,
                        format: 'SINGLE',
                        certifiedUnits: parseFloat(units.toFixed(1)),
                        certName: level.name,
                        certImageDetails: level,
                        label: labelStr,
                        date: certDateStr,
                        releaseDate: releaseDateStr,
                        genre: song.genre || 'POP',
                        history: getCertHistory(units, song.releaseDate, song.id, song.certifications)
                    });
                }
            });

            // Player Albums
            const deluxeMap = new Map<string, typeof activeArtistData.releases[0]>();
            activeArtistData.releases.forEach(r => {
                if (r.standardEditionId) deluxeMap.set(r.standardEditionId, r);
            });

            activeArtistData.releases.filter(r => !r.standardEditionId).forEach(release => {
                let totalStreams = 0;
                const deluxeVersion = deluxeMap.get(release.id);
                const songsToCount = deluxeVersion ? deluxeVersion.songIds : release.songIds;
                
                songsToCount.forEach(id => {
                    const s = activeArtistData.songs.find(x => x.id === id);
                    if (s) totalStreams += s.streams;
                });
                
                // Add physical merch sales from both versions
                const merchUnits = activeArtistData.merch
                    .filter(m => m.releaseId === release.id || (deluxeVersion && m.releaseId === deluxeVersion.id))
                    .reduce((sum, m) => sum + (m.unitsSold || 0), 0);
                    
                const units = (totalStreams / 1500 + merchUnits) / 1000000; 
                const level = getCertLevel(units);
                if (level) {
                     const certDateStr = getLatestCertDate(units, release.releaseDate, release.id, release.certifications);
                     const releaseDateStr = formatGameDate(release.releaseDate);

                     let labelStr = playerLabelStr;
                     if (release.releasingLabel) {
                         labelStr = release.releasingLabel.dealWithMajor 
                            ? `${release.releasingLabel.name} / ${release.releasingLabel.dealWithMajor}` 
                            : release.releasingLabel.name;
                     }

                     certs.push({
                        id: release.id,
                        artist: playerArtistName,
                        title: deluxeVersion ? deluxeVersion.title : release.title,
                        format: 'ALBUM',
                        certifiedUnits: parseFloat(units.toFixed(1)),
                        certName: level.name,
                        certImageDetails: level,
                        label: labelStr,
                        date: certDateStr,
                        releaseDate: releaseDateStr,
                        genre: 'POP',
                        history: getCertHistory(units, release.releaseDate, release.id, release.certifications)
                    });
                }
            });
        }

        // 2. Process Real Online Players' Singles
        const localCertIds = new Set(certs.map(c => c.id));
        onlineSongs.forEach((song) => {
            if (localCertIds.has(song.id)) return;
            const units = (song.totalStreams || 0) / 150 / 1_000_000;
            const level = getCertLevel(units);
            if (level) {
                const relDate = { year: song.releaseYear || date.year, week: song.releaseWeek || 1 };
                certs.push({
                    id: song.id,
                    artist: song.artistName,
                    title: song.title,
                    format: 'SINGLE',
                    certifiedUnits: parseFloat(units.toFixed(1)),
                    certName: level.name,
                    certImageDetails: level,
                    label: 'ONLINE',
                    date: getLatestCertDate(units, relDate, song.id),
                    releaseDate: formatGameDate(relDate),
                    genre: song.genre || 'POP',
                    history: getCertHistory(units, relDate, song.id)
                });
            }
        });

        // 3. Process Real Online Players' Albums
        onlineReleases.forEach((rel) => {
            if (localCertIds.has(rel.id) || rel.isScheduled) return;
            const units = ((rel.totalStreams || 0) / 1500 + (rel.totalSales || 0)) / 1_000_000;
            const level = getCertLevel(units);
            if (level) {
                const relDate = { year: rel.releaseYear || date.year, week: rel.releaseWeek || 1 };
                certs.push({
                    id: rel.id,
                    artist: rel.artistName,
                    title: rel.title,
                    format: 'ALBUM',
                    certifiedUnits: parseFloat(units.toFixed(1)),
                    certName: level.name,
                    certImageDetails: level,
                    label: rel.labelName || 'INDEPENDENT',
                    date: getLatestCertDate(units, relDate, rel.id),
                    releaseDate: formatGameDate(relDate),
                    genre: 'POP',
                    history: getCertHistory(units, relDate, rel.id)
                });
            }
        });

        return certs.sort((a, b) => b.certifiedUnits - a.certifiedUnits);
    }, [gameState, activeArtistData, activeArtist, onlineSongs, onlineReleases]);

    const filteredCerts = useMemo(() => {
        return allCerts.filter(c => {
            const matchesSearch = c.artist.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                  c.title.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesFormat = formatFilter === 'All' ? true : 
                                  formatFilter === 'Albums/EPs' ? c.format === 'ALBUM' : 
                                  c.format === 'SINGLE';
            return matchesSearch && matchesFormat;
        });
    }, [allCerts, searchTerm, formatFilter]);

    return (
        <div className="h-full w-full bg-white text-black overflow-y-auto">
            {/* RIAA Header Bar */}
            <div className="bg-black text-white p-4 flex items-center justify-between shadow-md">
                <button onClick={() => dispatch({type: 'CHANGE_VIEW', payload: 'apps'})} className="p-2 mr-2 hover:bg-white/20 rounded-full">
                    <ArrowLeftIcon className="w-6 h-6" />
                </button>
                <div className="flex-grow">
                    <input 
                        type="text" 
                        placeholder="Search..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-white text-black px-4 py-2 text-lg focus:outline-none placeholder-zinc-500"
                    />
                </div>
            </div>

            {/* Advanced Search Options */}
            <div className="bg-zinc-700 text-white p-4">
                <div className="flex items-center text-xs uppercase mb-4 cursor-pointer font-bold">
                    Advanced Search ▼
                </div>
                <div className="grid grid-cols-2 gap-4 max-w-sm mx-auto text-sm">
                    <label className="flex items-center cursor-pointer">
                        <input type="radio" name="format" checked={formatFilter === 'Albums/EPs'} onChange={() => setFormatFilter('Albums/EPs')} className="mr-2" />
                        Albums/EPs
                    </label>
                    <label className="flex items-center cursor-pointer">
                        <input type="radio" name="format" checked={formatFilter === 'Singles'} onChange={() => setFormatFilter('Singles')} className="mr-2" />
                        Singles
                    </label>
                    <label className="flex items-center cursor-pointer">
                        <input type="radio" name="format" checked={formatFilter === 'All'} onChange={() => setFormatFilter('All')} className="mr-2" />
                        None (All)
                    </label>
                </div>
            </div>

            <main className="max-w-3xl mx-auto p-4 space-y-6">
                {filteredCerts.length === 0 ? (
                    <p className="text-center text-zinc-500 my-8">No certifications found.</p>
                ) : (
                    filteredCerts.slice(0, 50).map(cert => (
                        <CertItem key={cert.id + cert.title} cert={cert} />
                    ))
                )}
            </main>
        </div>
    );
};

export default RiaaView;
