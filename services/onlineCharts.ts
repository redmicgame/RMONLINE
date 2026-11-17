import type {
    AlbumChartEntry,
    ChartEntry,
    ChartHistory,
    GameDate,
    Release,
    Song,
    Video,
    VideoChartEntry
} from '../types';

export interface OnlineSongDoc {
    id: string;
    ownerUid: string;
    artistId: string;
    artistName: string;
    artistAvatar: string;
    title: string;
    genre: string;
    coverArt: string;
    explicit?: boolean;
    duration?: number;
    releaseYear: number;
    releaseWeek: number;
    totalStreams: number;
    weeklyStreams: number;
    weeklySales: number;
    totalSales: number;
    radioImpressions?: number;
    radioPlays?: number;
    hot100Points: number;
    ukPoints: number;
    isAvailableOnStreaming?: boolean;
    exclusiveTo?: string;
    albumId?: string;
    albumTitle?: string;
    features?: string[];
    regionalStreams?: Record<string, number>;
    lastUpdatedWeekKey?: number;
}

export interface OnlineReleaseDoc {
    id: string;
    ownerUid: string;
    artistId: string;
    artistName: string;
    artistAvatar: string;
    title: string;
    type: string;
    coverArt: string;
    releaseYear: number;
    releaseWeek: number;
    isScheduled: boolean;
    preSaves: number;
    weeklyActivity: number;
    weeklyPureSales?: number;
    weeklySES?: number;
    totalSales: number;
    totalStreams: number;
    songIds?: string[];
    songTitles?: string[];
    labelName?: string;
    lastUpdatedWeekKey?: number;
}

export interface OnlineVideoDoc {
    id: string;
    ownerUid: string;
    artistId: string;
    artistName: string;
    artistAvatar: string;
    songId?: string;
    songTitle?: string;
    title: string;
    type: string;
    thumbnail: string;
    description?: string;
    views: number;
    weeklyViews: number;
    likes: number;
    spotifyViews?: number;
    isOnSpotify?: boolean;
    releaseYear: number;
    releaseWeek: number;
    createdAtMs: number;
}

export interface OnlineChartSnapshot {
    billboardHot100: ChartEntry[];
    billboardBubblingUnder25: ChartEntry[];
    billboardTopAlbums: AlbumChartEntry[];
    spotifyGlobal: ChartEntry[];
    spotifyUS: ChartEntry[];
    spotifyUK: ChartEntry[];
    spotifyCanada: ChartEntry[];
    spotifyLatin: ChartEntry[];
    spotifyAsia: ChartEntry[];
    spotifyAfrica: ChartEntry[];
    spotifyGlobalMusicVideos: VideoChartEntry[];
    ukSinglesChart: ChartEntry[];
    ukAlbumsChart: AlbumChartEntry[];
    hotPopSongs: ChartEntry[];
    hotRapRnb: ChartEntry[];
    electronicChart: ChartEntry[];
    countryChart: ChartEntry[];
    radioOverallChart: ChartEntry[];
    chartHistory: ChartHistory;
    albumChartHistory: ChartHistory;
    videoChartHistory: ChartHistory;
    hotPopSongsHistory: ChartHistory;
    hotRapRnbHistory: ChartHistory;
    electronicChartHistory: ChartHistory;
    countryChartHistory: ChartHistory;
    ukSinglesChartHistory: ChartHistory;
    ukAlbumsChartHistory: ChartHistory;
}

function updateChartHistoryMap(
    prevHistory: ChartHistory,
    entries: { uniqueId: string; rank: number }[],
    date: GameDate,
    limitRank: number
): ChartHistory {
    const next: ChartHistory = { ...prevHistory };
    const activeIds = new Set<string>();

    for (const entry of entries.slice(0, limitRank)) {
        activeIds.add(entry.uniqueId);
        const existing = next[entry.uniqueId];
        if (!existing) {
            next[entry.uniqueId] = {
                peak: entry.rank,
                weeksOnChart: 1,
                lastRank: entry.rank,
                weeksAtNo1: entry.rank === 1 ? 1 : 0,
                weeksAtPeak: 1,
                chartRun: [entry.rank],
                chartRunEntries: [{ year: date.year, week: date.week, rank: entry.rank }],
                firstEntered: { year: date.year, week: date.week }
            };
        } else {
            const newPeak = Math.min(existing.peak || entry.rank, entry.rank);
            const alreadyRecordedThisWeek = (existing.chartRunEntries || []).some(
                e => e.year === date.year && e.week === date.week
            );
            next[entry.uniqueId] = {
                ...existing,
                peak: newPeak,
                weeksOnChart: alreadyRecordedThisWeek ? existing.weeksOnChart : (existing.weeksOnChart || 0) + 1,
                lastRank: entry.rank,
                weeksAtNo1: (existing.weeksAtNo1 || 0) + (!alreadyRecordedThisWeek && entry.rank === 1 ? 1 : 0),
                weeksAtPeak: newPeak < existing.peak
                    ? 1
                    : (entry.rank === newPeak && !alreadyRecordedThisWeek ? (existing.weeksAtPeak || 0) + 1 : (existing.weeksAtPeak || 1)),
                chartRun: alreadyRecordedThisWeek
                    ? existing.chartRun
                    : [...(existing.chartRun || []), entry.rank].slice(-200),
                chartRunEntries: alreadyRecordedThisWeek
                    ? existing.chartRunEntries
                    : [...(existing.chartRunEntries || []), { year: date.year, week: date.week, rank: entry.rank }].slice(-200)
            };
        }
    }

    for (const id of Object.keys(next)) {
        if (!activeIds.has(id) && next[id].lastRank !== null) {
            next[id] = { ...next[id], lastRank: null };
        }
    }
    return next;
}

export function buildOnlineCharts(params: {
    onlineSongs: OnlineSongDoc[];
    onlineReleases: OnlineReleaseDoc[];
    onlineVideos: OnlineVideoDoc[];
    localUid: string | null;
    localArtistId: string | null;
    localArtistName: string;
    localArtistAvatar: string;
    localSongs: Song[];
    localReleases: Release[];
    localVideos: Video[];
    date: GameDate;
    prevChartHistory?: ChartHistory;
    prevAlbumChartHistory?: ChartHistory;
    prevVideoChartHistory?: ChartHistory;
    prevHotPopHistory?: ChartHistory;
    prevHotRapRnbHistory?: ChartHistory;
    prevElectronicHistory?: ChartHistory;
    prevCountryHistory?: ChartHistory;
    prevUkSinglesHistory?: ChartHistory;
    prevUkAlbumsHistory?: ChartHistory;
}): OnlineChartSnapshot {
    const {
        onlineSongs,
        onlineReleases,
        onlineVideos,
        localUid,
        localArtistId,
        localArtistName,
        localArtistAvatar,
        localSongs,
        localReleases,
        localVideos,
        date,
        prevChartHistory = {},
        prevAlbumChartHistory = {},
        prevVideoChartHistory = {},
        prevHotPopHistory = {},
        prevHotRapRnbHistory = {},
        prevElectronicHistory = {},
        prevCountryHistory = {},
        prevUkSinglesHistory = {},
        prevUkAlbumsHistory = {}
    } = params;

    // Merge remote online songs with current local player's released songs (local is source of truth for own songs)
    const mergedSongMap = new Map<string, OnlineSongDoc>();
    for (const s of onlineSongs) {
        mergedSongMap.set(s.id, s);
    }
    if (localUid && localArtistId) {
        for (const ls of localSongs) {
            if (!ls.isReleased || ls.isTakenDown) continue;
            const weeklyStreams = ls.actualLastWeekStreams || ls.lastWeekStreams || ls.weeklyStreams || 0;
            const weeklySales = ls.actualLastWeekSales || ls.itunesSalesWeek || 0;
            const radioImp = ls.radioImpressions || 0;
            const hot100Points = Math.round(weeklyStreams / 150 + weeklySales * 1.2 + radioImp / 50000);
            const ukPoints = Math.round(((ls.regionalStreams?.UK ?? weeklyStreams * 0.22) / 100) + weeklySales * 0.6);
            mergedSongMap.set(ls.id, {
                id: ls.id,
                ownerUid: localUid,
                artistId: localArtistId,
                artistName: ls.primaryArtist || localArtistName,
                artistAvatar: ls.coverArt || localArtistAvatar,
                title: ls.title,
                genre: ls.genre || 'Pop',
                coverArt: ls.coverArt,
                explicit: ls.explicit,
                duration: ls.duration,
                releaseYear: ls.releaseDate?.year || date.year,
                releaseWeek: ls.releaseDate?.week || date.week,
                totalStreams: ls.streams || 0,
                weeklyStreams,
                weeklySales,
                totalSales: ls.sales || 0,
                radioImpressions: radioImp,
                radioPlays: ls.radioPlays || 0,
                hot100Points,
                ukPoints,
                isAvailableOnStreaming: ls.isAvailableOnStreaming !== false,
                exclusiveTo: ls.exclusiveTo || 'none',
                features: ls.features || [],
                regionalStreams: ls.regionalStreams || {
                    US: Math.round(weeklyStreams * 0.35),
                    UK: Math.round(weeklyStreams * 0.14),
                    Canada: Math.round(weeklyStreams * 0.08),
                    'Latin America': Math.round(weeklyStreams * 0.18),
                    Asia: Math.round(weeklyStreams * 0.17),
                    Africa: Math.round(weeklyStreams * 0.08),
                }
            });
        }
    }

    const allSongs = Array.from(mergedSongMap.values()).filter(
        s => (s.weeklyStreams > 0 || s.weeklySales > 0 || (s.radioImpressions || 0) > 0 || s.totalStreams > 0)
    );

    const toSongChartEntry = (s: OnlineSongDoc, rank: number, scoreValue: number, streamsVal: number, hist: ChartHistory): ChartEntry => {
        const prev = hist[s.id];
        const peak = prev ? Math.min(prev.peak || rank, rank) : rank;
        const weeksOnChart = prev ? prev.weeksOnChart : 1;
        const isPlayerSong = Boolean(localUid && s.ownerUid === localUid);
        return {
            rank,
            lastWeek: prev?.lastRank ?? null,
            peak,
            weeksOnChart,
            title: s.title,
            artist: s.features && s.features.length > 0 ? `${s.artistName} feat. ${s.features.join(', ')}` : s.artistName,
            coverArt: s.coverArt,
            isPlayerSong,
            songId: isPlayerSong ? s.id : undefined,
            uniqueId: s.id,
            weeklyStreams: Math.max(0, Math.round(streamsVal)),
            dailyStreams: Math.max(0, Math.round(streamsVal / 7)),
            digitalSales: Math.max(0, Math.round(s.weeklySales || 0)),
            radioImpressions: Math.max(0, Math.round(s.radioImpressions || 0)),
            radioPlays: Math.max(0, Math.round(s.radioPlays || 0)),
            points: Math.max(0, Math.round(scoreValue)),
            genre: s.genre,
            regionalStreams: s.regionalStreams
        };
    };

    // 1. Billboard Hot 100 + Bubbling Under 25
    const sortedHot100 = [...allSongs].sort((a, b) => (b.hot100Points || b.weeklyStreams) - (a.hot100Points || a.weeklyStreams));
    const hot100Songs = sortedHot100.slice(0, 100);
    const bubblingSongs = sortedHot100.slice(100, 125);
    const billboardHot100 = hot100Songs.map((s, idx) =>
        toSongChartEntry(s, idx + 1, s.hot100Points, s.weeklyStreams, prevChartHistory)
    );
    const billboardBubblingUnder25 = bubblingSongs.map((s, idx) =>
        toSongChartEntry(s, idx + 1, s.hot100Points, s.weeklyStreams, {})
    );
    const chartHistory = updateChartHistoryMap(prevChartHistory, billboardHot100, date, 100);

    // 2. Spotify Global & Regional
    const streamableSongs = allSongs.filter(
        s => s.isAvailableOnStreaming !== false && (!s.exclusiveTo || s.exclusiveTo === 'none' || s.exclusiveTo === 'Spotify')
    );
    const sortByRegion = (regionKey: string | null) => {
        return [...streamableSongs]
            .map(s => {
                const regionStreams = regionKey
                    ? (s.regionalStreams?.[regionKey] ?? Math.round((s.weeklyStreams || 0) * 0.15))
                    : (s.weeklyStreams || 0);
                return { song: s, streams: regionStreams };
            })
            .filter(item => item.streams > 0)
            .sort((a, b) => b.streams - a.streams)
            .slice(0, 100)
            .map((item, idx) => toSongChartEntry(item.song, idx + 1, item.streams, item.streams, prevChartHistory));
    };

    const spotifyGlobal = sortByRegion(null);
    const spotifyUS = sortByRegion('US');
    const spotifyUK = sortByRegion('UK');
    const spotifyCanada = sortByRegion('Canada');
    const spotifyLatin = sortByRegion('Latin America');
    const spotifyAsia = sortByRegion('Asia');
    const spotifyAfrica = sortByRegion('Africa');

    // 3. UK Singles Chart
    const sortedUkSingles = [...allSongs]
        .sort((a, b) => (b.ukPoints || b.weeklyStreams) - (a.ukPoints || a.weeklyStreams))
        .slice(0, 100);
    const ukSinglesChart = sortedUkSingles.map((s, idx) =>
        toSongChartEntry(s, idx + 1, s.ukPoints, s.regionalStreams?.UK ?? Math.round(s.weeklyStreams * 0.2), prevUkSinglesHistory)
    );
    const ukSinglesChartHistory = updateChartHistoryMap(prevUkSinglesHistory, ukSinglesChart, date, 100);

    // 4. Genre Charts
    const buildGenreChart = (matcher: (g: string) => boolean, hist: ChartHistory) => {
        const list = sortedHot100.filter(s => matcher((s.genre || '').toLowerCase())).slice(0, 50);
        const entries = list.map((s, idx) => toSongChartEntry(s, idx + 1, s.hot100Points, s.weeklyStreams, hist));
        return {
            entries,
            history: updateChartHistoryMap(hist, entries, date, 50)
        };
    };

    const popRes = buildGenreChart(g => g.includes('pop') || g.includes('k-pop') || g.includes('indie'), prevHotPopHistory);
    const rapRnbRes = buildGenreChart(g => g.includes('hip') || g.includes('rap') || g.includes('r&b') || g.includes('trap') || g.includes('soul'), prevHotRapRnbHistory);
    const elecRes = buildGenreChart(g => g.includes('elec') || g.includes('edm') || g.includes('dance') || g.includes('house'), prevElectronicHistory);
    const countryRes = buildGenreChart(g => g.includes('country') || g.includes('folk') || g.includes('americana'), prevCountryHistory);

    // 5. Radio Overall Chart
    const radioOverallChart = [...allSongs]
        .filter(s => (s.radioImpressions || 0) > 0 || (s.radioPlays || 0) > 0)
        .sort((a, b) => (b.radioImpressions || 0) - (a.radioImpressions || 0))
        .slice(0, 50)
        .map((s, idx) => toSongChartEntry(s, idx + 1, s.radioImpressions || 0, s.weeklyStreams, prevChartHistory));

    // 6. Albums / Releases (Billboard 200 & UK Albums)
    const mergedReleaseMap = new Map<string, OnlineReleaseDoc>();
    for (const r of onlineReleases) {
        if (!r.isScheduled) mergedReleaseMap.set(r.id, r);
    }
    if (localUid && localArtistId) {
        for (const lr of localReleases) {
            if (lr.isScheduled || lr.isTakenDown) continue;
            if (lr.type === 'Single') continue;
            const releaseSongs = localSongs.filter(s => lr.songIds.includes(s.id));
            const weeklyStreams = releaseSongs.reduce((sum, s) => sum + (s.actualLastWeekStreams || s.lastWeekStreams || s.weeklyStreams || 0), 0);
            const weeklySES = Math.round(weeklyStreams / 1500);
            const weeklyPureSales = Math.round(releaseSongs.reduce((sum, s) => sum + (s.actualLastWeekSales || 0), 0) / 10 + (lr.preorderSales || 0));
            const weeklyActivity = Math.max(weeklySES + weeklyPureSales, Math.round((lr.copiesSold || 0) * 0.05));
            mergedReleaseMap.set(lr.id, {
                id: lr.id,
                ownerUid: localUid,
                artistId: localArtistId,
                artistName: localArtistName,
                artistAvatar: lr.coverArt || localArtistAvatar,
                title: lr.title,
                type: lr.type,
                coverArt: lr.coverArt,
                releaseYear: lr.releaseDate?.year || date.year,
                releaseWeek: lr.releaseDate?.week || date.week,
                isScheduled: false,
                preSaves: 0,
                weeklyActivity,
                weeklyPureSales,
                weeklySES,
                totalSales: lr.copiesSold || lr.sales || 0,
                totalStreams: releaseSongs.reduce((sum, s) => sum + (s.streams || 0), 0),
                songIds: lr.songIds,
                labelName: lr.releasingLabel?.name || 'Independent'
            });
        }
    }

    const activeAlbums = Array.from(mergedReleaseMap.values()).filter(
        r => r.type !== 'Single' && (r.weeklyActivity > 0 || r.totalSales > 0 || r.totalStreams > 0)
    );
    const sortedAlbums = [...activeAlbums].sort((a, b) => (b.weeklyActivity || b.totalSales) - (a.weeklyActivity || a.totalSales)).slice(0, 100);

    const toAlbumChartEntry = (r: OnlineReleaseDoc, rank: number, hist: ChartHistory, mult = 1): AlbumChartEntry => {
        const prev = hist[r.id];
        const isPlayerAlbum = Boolean(localUid && r.ownerUid === localUid);
        const activity = Math.max(0, Math.round((r.weeklyActivity || 0) * mult));
        return {
            rank,
            lastWeek: prev?.lastRank ?? null,
            peak: prev ? Math.min(prev.peak || rank, rank) : rank,
            weeksOnChart: prev ? prev.weeksOnChart : 1,
            title: r.title,
            artist: r.artistName,
            artistName: r.artistName,
            label: r.labelName || 'Independent',
            coverArt: r.coverArt,
            isPlayerAlbum,
            albumId: isPlayerAlbum ? r.id : undefined,
            uniqueId: r.id,
            weeklyActivity: activity,
            weeklySales: activity,
            weeklySES: Math.round((r.weeklySES || 0) * mult),
            weeklyPureSales: Math.round((r.weeklyPureSales || 0) * mult)
        };
    };

    const billboardTopAlbums = sortedAlbums.map((r, idx) => toAlbumChartEntry(r, idx + 1, prevAlbumChartHistory, 1));
    const albumChartHistory = updateChartHistoryMap(prevAlbumChartHistory, billboardTopAlbums, date, 100);

    const ukAlbumsChart = [...activeAlbums]
        .sort((a, b) => (b.weeklyActivity || 0) - (a.weeklyActivity || 0))
        .slice(0, 100)
        .map((r, idx) => toAlbumChartEntry(r, idx + 1, prevUkAlbumsHistory, 0.24));
    const ukAlbumsChartHistory = updateChartHistoryMap(prevUkAlbumsHistory, ukAlbumsChart, date, 100);

    // 7. Spotify / Global Music Video Chart
    const mergedVideoMap = new Map<string, OnlineVideoDoc>();
    for (const v of onlineVideos) {
        mergedVideoMap.set(v.id, v);
    }
    if (localUid && localArtistId) {
        for (const lv of localVideos) {
            mergedVideoMap.set(lv.id, {
                id: lv.id,
                ownerUid: localUid,
                artistId: localArtistId,
                artistName: localArtistName,
                artistAvatar: localArtistAvatar,
                songId: lv.songId,
                title: lv.title,
                type: lv.type,
                thumbnail: lv.thumbnail,
                description: lv.description,
                views: lv.views || 0,
                weeklyViews: lv.lastWeekViews || Math.round((lv.views || 0) * 0.25),
                likes: lv.likes || 0,
                spotifyViews: lv.spotifyViews || 0,
                isOnSpotify: Boolean(lv.isOnSpotify),
                releaseYear: lv.releaseDate?.year || date.year,
                releaseWeek: lv.releaseDate?.week || date.week,
                createdAtMs: Date.now()
            });
        }
    }

    const spotifyGlobalMusicVideos: VideoChartEntry[] = Array.from(mergedVideoMap.values())
        .filter(v => v.isOnSpotify || v.type === 'Music Video')
        .sort((a, b) => (b.weeklyViews || b.views) - (a.weeklyViews || a.views))
        .slice(0, 50)
        .map((v, idx) => {
            const rank = idx + 1;
            const prev = prevVideoChartHistory[v.id];
            const isPlayerVideo = Boolean(localUid && v.ownerUid === localUid);
            return {
                rank,
                lastWeek: prev?.lastRank ?? null,
                peak: prev ? Math.min(prev.peak || rank, rank) : rank,
                weeksOnChart: prev ? prev.weeksOnChart : 1,
                title: v.title,
                artist: v.artistName,
                thumbnail: v.thumbnail,
                isPlayerVideo,
                videoId: isPlayerVideo ? v.id : undefined,
                uniqueId: v.id,
                weeklyViews: Math.max(0, Math.round(v.weeklyViews || v.views || 0))
            };
        });
    const videoChartHistory = updateChartHistoryMap(prevVideoChartHistory, spotifyGlobalMusicVideos, date, 50);

    return {
        billboardHot100,
        billboardBubblingUnder25,
        billboardTopAlbums,
        spotifyGlobal,
        spotifyUS,
        spotifyUK,
        spotifyCanada,
        spotifyLatin,
        spotifyAsia,
        spotifyAfrica,
        spotifyGlobalMusicVideos,
        ukSinglesChart,
        ukAlbumsChart,
        hotPopSongs: popRes.entries,
        hotRapRnb: rapRnbRes.entries,
        electronicChart: elecRes.entries,
        countryChart: countryRes.entries,
        radioOverallChart,
        chartHistory,
        albumChartHistory,
        videoChartHistory,
        hotPopSongsHistory: popRes.history,
        hotRapRnbHistory: rapRnbRes.history,
        electronicChartHistory: elecRes.history,
        countryChartHistory: countryRes.history,
        ukSinglesChartHistory,
        ukAlbumsChartHistory
    };
}
