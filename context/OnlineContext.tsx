import React, { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
    collection,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    deleteDoc,
    onSnapshot,
    query,
    where,
    orderBy,
    limit,
    serverTimestamp,
    increment
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useFirebase } from './FirebaseContext';
import { compressImageForCloud, syncCompressImageString } from '../utils/imageCompression';
import type { ArtistData, GameDate, GameState } from '../types';
import type { OnlineSongDoc, OnlineReleaseDoc, OnlineVideoDoc } from '../services/onlineCharts';

export const WEEK_DURATION_MS = 15 * 60 * 1000; // 15 minutes real-time = 1 game week
export const ONLINE_START_YEAR = 2018;
export const ONLINE_START_WEEK = 1;

export interface WorldClock {
    id: string;
    epochStartMs: number;
    weekDurationMs: number;
    startYear: number;
    startWeek: number;
    initializedBy: string;
}

export interface OnlineArtist {
    uid: string;
    artistId: string;
    name: string;
    handle: string;
    avatar: string;
    headerImage?: string;
    bio?: string;
    country: string;
    careerMode: 'solo' | 'group';
    fandomName: string;
    genre?: string;
    isVerified?: boolean;
    isGoldTheme?: boolean;
    followers: number;
    monthlyListeners: number;
    totalStreams: number;
    youtubeSubscribers: number;
    instagramFollowers?: number;
    tiktokFollowers?: number;
    popularity: number;
    hype: number;
    netWorth?: number;
    lastActiveAtMs: number;
}

export interface OnlineXPost {
    id: string;
    ownerUid: string;
    authorId: string;
    authorName: string;
    authorUsername: string;
    authorAvatar: string;
    authorVerified?: boolean;
    authorGoldVerified?: boolean;
    content: string;
    image?: string;
    likes: number;
    retweets: number;
    views: number;
    replyToId?: string;
    quoteOfId?: string;
    quoteAuthorName?: string;
    quoteAuthorUsername?: string;
    quoteContent?: string;
    gameYear: number;
    gameWeek: number;
    createdAtMs: number;
}

export interface OnlineFollow {
    id: string;
    followerUid: string;
    targetUid: string;
}

export interface OnlineChat {
    id: string;
    participantUids: string[];
    participantNames: Record<string, string>;
    participantHandles: Record<string, string>;
    participantAvatars: Record<string, string>;
    lastMessageText: string;
    lastMessageAtMs: number;
    lastSenderUid: string;
}

export interface OnlineChatMessage {
    id: string;
    chatId: string;
    participantUids: string[];
    senderUid: string;
    senderName: string;
    senderAvatar: string;
    text: string;
    gameYear: number;
    gameWeek: number;
    createdAtMs: number;
}

interface OnlineContextValue {
    worldClock: WorldClock | null;
    globalDate: GameDate;
    msUntilNextWeek: number;
    formattedCountdown: string;
    onlineArtists: OnlineArtist[];
    activeOnlineArtistsCount: number;
    onlineSongs: OnlineSongDoc[];
    onlineReleases: OnlineReleaseDoc[];
    onlineVideos: OnlineVideoDoc[];
    onlineXPosts: OnlineXPost[];
    onlineFollows: OnlineFollow[];
    onlineChats: OnlineChat[];
    selectedOnlineArtistUid: string | null;
    setSelectedOnlineArtistUid: (uid: string | null) => void;
    syncMyArtistAndCatalog: (state: GameState, activeArtistData: ArtistData | null) => Promise<void>;
    createOnlineXPost: (params: {
        content: string;
        image?: string;
        replyToId?: string;
        quotePost?: { id: string; authorName: string; authorUsername: string; content: string };
        authorId: string;
        authorName: string;
        authorUsername: string;
        authorAvatar: string;
        authorVerified?: boolean;
        authorGoldVerified?: boolean;
        gameYear: number;
        gameWeek: number;
    }) => Promise<string | null>;
    toggleLikeOnlineXPost: (postId: string, currentlyLiked: boolean) => Promise<void>;
    toggleRepostOnlineXPost: (postId: string, currentlyReposted: boolean) => Promise<void>;
    deleteOnlineXPost: (postId: string) => Promise<void>;
    toggleFollowOnlineArtist: (targetUid: string) => Promise<void>;
    isFollowingUid: (targetUid: string) => boolean;
    getFollowerCountDelta: (targetUid: string) => number;
    startOrOpenOnlineDM: (targetArtist: OnlineArtist, myArtist: OnlineArtist) => Promise<string | null>;
    sendOnlineDM: (chatId: string, text: string, senderArtist: { uid: string; name: string; handle: string; avatar: string }, gameDate: GameDate) => Promise<void>;
    subscribeOnlineChatMessages: (chatId: string, callback: (messages: OnlineChatMessage[]) => void) => () => void;
    preSaveOnlineRelease: (releaseId: string) => Promise<void>;
    recordOnlineVideoView: (videoId: string) => Promise<void>;
    toggleLikeOnlineVideo: (videoId: string) => Promise<void>;
    clearMyOnlinePresence: (uid: string) => Promise<void>;
}

const OnlineContext = createContext<OnlineContextValue | undefined>(undefined);

export function computeGlobalDateFromClock(clock: WorldClock | null, nowMs: number): {
    date: GameDate;
    msUntilNextWeek: number;
    formattedCountdown: string;
} {
    if (!clock) {
        return {
            date: { year: ONLINE_START_YEAR, week: ONLINE_START_WEEK },
            msUntilNextWeek: WEEK_DURATION_MS,
            formattedCountdown: '15:00'
        };
    }
    const elapsed = Math.max(0, nowMs - clock.epochStartMs);
    const duration = clock.weekDurationMs || WEEK_DURATION_MS;
    const elapsedWeeks = Math.floor(elapsed / duration);
    const year = (clock.startYear || ONLINE_START_YEAR) + Math.floor(elapsedWeeks / 52);
    const week = ((elapsedWeeks + (clock.startWeek || ONLINE_START_WEEK) - 1) % 52) + 1;
    const msUntilNextWeek = Math.max(0, duration - (elapsed % duration));
    const totalSeconds = Math.ceil(msUntilNextWeek / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    const formattedCountdown = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    return { date: { year, week }, msUntilNextWeek, formattedCountdown };
}

export const OnlineProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user, isLoading: authLoading } = useFirebase();
    const [worldClock, setWorldClock] = useState<WorldClock | null>(null);
    const [nowMs, setNowMs] = useState<number>(() => Date.now());
    const [onlineArtists, setOnlineArtists] = useState<OnlineArtist[]>([]);
    const [onlineSongs, setOnlineSongs] = useState<OnlineSongDoc[]>([]);
    const [onlineReleases, setOnlineReleases] = useState<OnlineReleaseDoc[]>([]);
    const [onlineVideos, setOnlineVideos] = useState<OnlineVideoDoc[]>([]);
    const [onlineXPosts, setOnlineXPosts] = useState<OnlineXPost[]>([]);
    const [onlineFollows, setOnlineFollows] = useState<OnlineFollow[]>([]);
    const [onlineChats, setOnlineChats] = useState<OnlineChat[]>([]);
    const [selectedOnlineArtistUid, setSelectedOnlineArtistUid] = useState<string | null>(null);

    const lastSyncHashRef = useRef<string>('');
    const lastHeartbeatRef = useRef<number>(0);

    // 1-second local ticker for the 15-minute synchronized week countdown
    useEffect(() => {
        const interval = setInterval(() => {
            setNowMs(Date.now());
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    // World clock subscription & initialization
    useEffect(() => {
        if (authLoading || !user) {
            setWorldClock(null);
            return;
        }

        const clockRef = doc(db, 'world', 'clock');
        const unsubscribe = onSnapshot(
            clockRef,
            async (snap) => {
                if (snap.exists()) {
                    setWorldClock(snap.data() as WorldClock);
                } else if (user.emailVerified) {
                    const initialClock: WorldClock = {
                        id: 'clock',
                        epochStartMs: Date.now(),
                        weekDurationMs: WEEK_DURATION_MS,
                        startYear: ONLINE_START_YEAR,
                        startWeek: ONLINE_START_WEEK,
                        initializedBy: user.uid
                    };
                    try {
                        await setDoc(clockRef, {
                            ...initialClock,
                            createdAt: serverTimestamp(),
                            updatedAt: serverTimestamp()
                        });
                    } catch (err) {
                        // Another client may have initialized simultaneously
                        const check = await getDoc(clockRef);
                        if (check.exists()) {
                            setWorldClock(check.data() as WorldClock);
                        } else {
                            console.warn('Could not initialize world clock:', err);
                        }
                    }
                }
            },
            (err) => handleFirestoreError(err, OperationType.GET, 'world/clock')
        );

        return () => unsubscribe();
    }, [user, authLoading]);

    // Real-time public & user-scoped multiplayer collections
    useEffect(() => {
        if (authLoading || !user) {
            setOnlineArtists([]);
            setOnlineSongs([]);
            setOnlineReleases([]);
            setOnlineVideos([]);
            setOnlineXPosts([]);
            setOnlineFollows([]);
            setOnlineChats([]);
            return;
        }

        const unsubArtists = onSnapshot(
            query(collection(db, 'onlineArtists'), where('isPublic', '==', true), limit(200)),
            (snap) => {
                setOnlineArtists(snap.docs.map(d => d.data() as OnlineArtist));
            },
            (err) => handleFirestoreError(err, OperationType.LIST, 'onlineArtists')
        );

        const unsubSongs = onSnapshot(
            query(collection(db, 'onlineSongs'), where('isPublic', '==', true), limit(400)),
            (snap) => {
                setOnlineSongs(snap.docs.map(d => d.data() as OnlineSongDoc));
            },
            (err) => handleFirestoreError(err, OperationType.LIST, 'onlineSongs')
        );

        const unsubReleases = onSnapshot(
            query(collection(db, 'onlineReleases'), where('isPublic', '==', true), limit(250)),
            (snap) => {
                setOnlineReleases(snap.docs.map(d => d.data() as OnlineReleaseDoc));
            },
            (err) => handleFirestoreError(err, OperationType.LIST, 'onlineReleases')
        );

        const unsubVideos = onSnapshot(
            query(collection(db, 'onlineVideos'), where('isPublic', '==', true), limit(250)),
            (snap) => {
                setOnlineVideos(snap.docs.map(d => d.data() as OnlineVideoDoc));
            },
            (err) => handleFirestoreError(err, OperationType.LIST, 'onlineVideos')
        );

        const unsubPosts = onSnapshot(
            query(collection(db, 'onlineXPosts'), where('isPublic', '==', true), limit(200)),
            (snap) => {
                const list = snap.docs.map(d => d.data() as OnlineXPost);
                list.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
                setOnlineXPosts(list);
            },
            (err) => handleFirestoreError(err, OperationType.LIST, 'onlineXPosts')
        );

        const unsubFollows = onSnapshot(
            query(collection(db, 'onlineFollows'), where('isPublic', '==', true), limit(500)),
            (snap) => {
                setOnlineFollows(snap.docs.map(d => d.data() as OnlineFollow));
            },
            (err) => handleFirestoreError(err, OperationType.LIST, 'onlineFollows')
        );

        const unsubChats = onSnapshot(
            query(collection(db, 'onlineChats'), where('participantUids', 'array-contains', user.uid), limit(100)),
            (snap) => {
                const list = snap.docs.map(d => d.data() as OnlineChat);
                list.sort((a, b) => (b.lastMessageAtMs || 0) - (a.lastMessageAtMs || 0));
                setOnlineChats(list);
            },
            (err) => handleFirestoreError(err, OperationType.LIST, 'onlineChats')
        );

        return () => {
            unsubArtists();
            unsubSongs();
            unsubReleases();
            unsubVideos();
            unsubPosts();
            unsubFollows();
            unsubChats();
        };
    }, [user, authLoading]);

    const { date: globalDate, msUntilNextWeek, formattedCountdown } = useMemo(
        () => computeGlobalDateFromClock(worldClock, nowMs),
        [worldClock, nowMs]
    );

    const activeOnlineArtistsCount = useMemo(() => {
        const cutoff = nowMs - 5 * 60 * 1000;
        return onlineArtists.filter(a => (a.lastActiveAtMs || 0) >= cutoff).length;
    }, [onlineArtists, nowMs]);

    const syncMyArtistAndCatalog = useCallback(async (state: GameState, activeArtistData: ArtistData | null) => {
        if (!user || !user.emailVerified || !state.careerMode || !activeArtistData) return;

        const artistObj = state.careerMode === 'solo' ? state.soloArtist : state.group;
        if (!artistObj) return;

        const artistName = (artistObj.name || 'Artist').trim().slice(0, 120) || 'Artist';
        const fandomName = (artistObj.fandomName || 'Fans').trim().slice(0, 100) || 'Fans';
        const playerXUser = activeArtistData.selectedPlayerXUserId
            ? activeArtistData.xUsers?.find(u => u.id === activeArtistData.selectedPlayerXUserId)
            : activeArtistData.xUsers?.find(u => u.isPlayer);

        const rawHandle = playerXUser?.username || artistName.toLowerCase().replace(/[^a-z0-9_]/g, '') || 'artist';
        const handle = rawHandle.replace(/^@/, '').slice(0, 64) || 'artist';
        const country = state.careerMode === 'solo'
            ? (state.soloArtist?.country || 'US')
            : (state.group?.members?.[0]?.country || 'US');
        const primaryGenre = (activeArtistData.songs || [])[0]?.genre || 'Pop';

        const releasedSongs = (activeArtistData.songs || []).filter(s => s.isReleased && !s.isTakenDown);
        const totalStreams = releasedSongs.reduce((acc, s) => acc + (s.streams || 0), 0);

        const safeAvatar = await compressImageForCloud(playerXUser?.avatar || artistObj.image, artistName);
        const safeHeader = playerXUser?.headerImage
            ? await compressImageForCloud(playerXUser.headerImage, artistName)
            : undefined;

        const artistPayloadHash = JSON.stringify({
            name: artistName,
            handle,
            followers: playerXUser?.followersCount || 0,
            ml: activeArtistData.monthlyListeners || 0,
            ts: totalStreams,
            yt: activeArtistData.youtubeSubscribers || 0,
            pop: activeArtistData.popularity || 0,
            hype: activeArtistData.hype || 0,
            songs: releasedSongs.map(s => `${s.id}:${s.streams}:${s.lastWeekStreams}:${s.sales}:${s.radioImpressions}`).join('|'),
            rels: (activeArtistData.releases || []).map(r => `${r.id}:${r.isScheduled}:${r.copiesSold}`).join('|'),
            vids: (activeArtistData.videos || []).map(v => `${v.id}:${v.views}:${v.likes}`).join('|'),
            weekKey: state.date.year * 100 + state.date.week
        });

        const now = Date.now();
        const shouldHeartbeat = now - lastHeartbeatRef.current > 90000;
        if (artistPayloadHash === lastSyncHashRef.current && !shouldHeartbeat) {
            return;
        }
        lastSyncHashRef.current = artistPayloadHash;
        lastHeartbeatRef.current = now;

        // 1. Upsert onlineArtists/{uid}
        const artistRef = doc(db, 'onlineArtists', user.uid);
        try {
            const existingSnap = await getDoc(artistRef);
            const artistFields: Record<string, any> = {
                uid: user.uid,
                artistId: artistObj.id.replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 128) || user.uid,
                name: artistName,
                handle,
                avatar: safeAvatar,
                bio: (playerXUser?.bio || activeArtistData.aboutBio || '').slice(0, 500),
                country: country.slice(0, 64),
                careerMode: state.careerMode,
                fandomName,
                genre: primaryGenre,
                isVerified: Boolean(playerXUser?.isVerified || (activeArtistData.popularity || 0) >= 40),
                isGoldTheme: Boolean(activeArtistData.isGoldTheme),
                followers: Math.max(0, Math.round(playerXUser?.followersCount || 0)),
                monthlyListeners: Math.max(0, Math.round(activeArtistData.monthlyListeners || 0)),
                totalStreams: Math.max(0, Math.round(totalStreams)),
                youtubeSubscribers: Math.max(0, Math.round(activeArtistData.youtubeSubscribers || 0)),
                instagramFollowers: Math.max(0, Math.round(activeArtistData.instagramFollowers || 0)),
                tiktokFollowers: Math.max(0, Math.round(activeArtistData.tiktokFollowers || 0)),
                popularity: Math.max(0, Math.round(activeArtistData.popularity || 0)),
                hype: Math.max(0, Math.round(activeArtistData.hype || 0)),
                netWorth: Math.round(activeArtistData.money || 0),
                isPublic: true,
                lastActiveAtMs: now,
                updatedAt: serverTimestamp()
            };
            if (safeHeader) artistFields.headerImage = safeHeader;

            if (existingSnap.exists()) {
                const updateFields = { ...artistFields };
                delete updateFields.uid;
                delete updateFields.isPublic;
                await updateDoc(artistRef, updateFields);
            } else {
                await setDoc(artistRef, {
                    ...artistFields,
                    createdAt: serverTimestamp()
                });
            }
        } catch (err) {
            console.warn('Failed syncing onlineArtists doc:', err);
        }

        // 2. Sync released songs (latest 30 songs to keep Firestore writes crisp)
        const weekKey = state.date.year * 100 + state.date.week;
        const songsToSync = [...releasedSongs].slice(-30);
        for (const s of songsToSync) {
            const cleanSongId = s.id.replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 128);
            if (!cleanSongId) continue;
            const songRef = doc(db, 'onlineSongs', cleanSongId);
            const weeklyStreams = Math.max(0, Math.round(s.actualLastWeekStreams || s.lastWeekStreams || s.weeklyStreams || 0));
            const weeklySales = Math.max(0, Math.round(s.actualLastWeekSales || s.itunesSalesWeek || 0));
            const radioImp = Math.max(0, Math.round(s.radioImpressions || 0));
            const hot100Points = Math.max(0, Math.round(weeklyStreams / 150 + weeklySales * 1.2 + radioImp / 50000));
            const ukPoints = Math.max(0, Math.round(((s.regionalStreams?.UK ?? weeklyStreams * 0.22) / 100) + weeklySales * 0.6));
            const safeCover = syncCompressImageString(s.coverArt, s.title);

            const songBase: Record<string, any> = {
                artistName,
                artistAvatar: safeAvatar,
                title: (s.title || 'Untitled').slice(0, 200),
                genre: (s.genre || 'Pop').slice(0, 80),
                coverArt: safeCover,
                explicit: Boolean(s.explicit),
                duration: Math.max(0, Math.round(s.duration || 180)),
                releaseYear: Math.max(ONLINE_START_YEAR, s.releaseDate?.year || state.date.year),
                releaseWeek: Math.min(52, Math.max(1, s.releaseDate?.week || state.date.week)),
                totalStreams: Math.max(0, Math.round(s.streams || 0)),
                weeklyStreams,
                weeklySales,
                totalSales: Math.max(0, Math.round(s.sales || 0)),
                radioImpressions: radioImp,
                radioPlays: Math.max(0, Math.round(s.radioPlays || 0)),
                hot100Points,
                ukPoints,
                isAvailableOnStreaming: s.isAvailableOnStreaming !== false,
                exclusiveTo: s.exclusiveTo || 'none',
                features: (s.features || []).slice(0, 10).map(f => String(f).slice(0, 80)),
                regionalStreams: s.regionalStreams || {
                    US: Math.round(weeklyStreams * 0.35),
                    UK: Math.round(weeklyStreams * 0.14),
                    Canada: Math.round(weeklyStreams * 0.08),
                    'Latin America': Math.round(weeklyStreams * 0.18),
                    Asia: Math.round(weeklyStreams * 0.17),
                    Africa: Math.round(weeklyStreams * 0.08)
                },
                lastUpdatedWeekKey: weekKey,
                updatedAt: serverTimestamp()
            };

            try {
                const snap = await getDoc(songRef);
                if (snap.exists()) {
                    await updateDoc(songRef, songBase);
                } else {
                    await setDoc(songRef, {
                        ...songBase,
                        id: cleanSongId,
                        ownerUid: user.uid,
                        artistId: artistFieldsArtistId(artistObj.id, user.uid),
                        isPublic: true,
                        createdAt: serverTimestamp()
                    });
                }
            } catch (err) {
                console.warn('Failed syncing song:', s.title, err);
            }
        }

        // 3. Sync releases (albums, EPs, scheduled countdowns)
        const releasesToSync = [...(activeArtistData.releases || [])].filter(r => !r.isTakenDown).slice(-20);
        for (const r of releasesToSync) {
            const cleanRelId = r.id.replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 128);
            if (!cleanRelId) continue;
            const relRef = doc(db, 'onlineReleases', cleanRelId);
            const relSongs = (activeArtistData.songs || []).filter(s => r.songIds.includes(s.id));
            const weeklyStreams = relSongs.reduce((sum, s) => sum + (s.actualLastWeekStreams || s.lastWeekStreams || s.weeklyStreams || 0), 0);
            const weeklySES = Math.round(weeklyStreams / 1500);
            const weeklyPureSales = Math.round(relSongs.reduce((sum, s) => sum + (s.actualLastWeekSales || 0), 0) / 10 + (r.preorderSales || 0));
            const weeklyActivity = Math.max(0, weeklySES + weeklyPureSales);
            const safeCover = syncCompressImageString(r.coverArt, r.title);

            const relBase: Record<string, any> = {
                artistName,
                artistAvatar: safeAvatar,
                title: (r.title || 'Untitled').slice(0, 200),
                type: (r.type || 'Album').slice(0, 40),
                coverArt: safeCover,
                releaseYear: Math.max(ONLINE_START_YEAR, r.releaseDate?.year || state.date.year),
                releaseWeek: Math.min(52, Math.max(1, r.releaseDate?.week || state.date.week)),
                isScheduled: Boolean(r.isScheduled),
                preSaves: Math.max(0, Math.round(r.preorderSales || 0)),
                weeklyActivity,
                weeklyPureSales,
                weeklySES,
                totalSales: Math.max(0, Math.round(r.copiesSold || r.sales || 0)),
                totalStreams: Math.max(0, Math.round(relSongs.reduce((sum, s) => sum + (s.streams || 0), 0))),
                songIds: (r.songIds || []).slice(0, 60),
                songTitles: relSongs.slice(0, 60).map(s => s.title.slice(0, 120)),
                labelName: (r.releasingLabel?.name || 'Independent').slice(0, 120),
                lastUpdatedWeekKey: weekKey,
                updatedAt: serverTimestamp()
            };

            try {
                const snap = await getDoc(relRef);
                if (snap.exists()) {
                    await updateDoc(relRef, relBase);
                } else {
                    await setDoc(relRef, {
                        ...relBase,
                        id: cleanRelId,
                        ownerUid: user.uid,
                        artistId: artistFieldsArtistId(artistObj.id, user.uid),
                        isPublic: true,
                        createdAt: serverTimestamp()
                    });
                }
            } catch (err) {
                console.warn('Failed syncing release:', r.title, err);
            }
        }

        // 4. Sync videos (YouTube & Spotify)
        const videosToSync = [...(activeArtistData.videos || [])].slice(-25);
        for (const v of videosToSync) {
            const cleanVidId = v.id.replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 128);
            if (!cleanVidId) continue;
            const vidRef = doc(db, 'onlineVideos', cleanVidId);
            const safeThumb = syncCompressImageString(v.thumbnail, v.title);
            const matchedSong = (activeArtistData.songs || []).find(s => s.id === v.songId);

            const vidBase: Record<string, any> = {
                artistName,
                artistAvatar: safeAvatar,
                title: (v.title || 'Video').slice(0, 200),
                type: (v.type || 'Music Video').slice(0, 60),
                thumbnail: safeThumb,
                description: (v.description || '').slice(0, 1000),
                views: Math.max(0, Math.round(v.views || 0)),
                weeklyViews: Math.max(0, Math.round(v.lastWeekViews || Math.round((v.views || 0) * 0.25))),
                likes: Math.max(0, Math.round(v.likes || 0)),
                spotifyViews: Math.max(0, Math.round(v.spotifyViews || 0)),
                isOnSpotify: Boolean(v.isOnSpotify),
                updatedAt: serverTimestamp()
            };

            try {
                const snap = await getDoc(vidRef);
                if (snap.exists()) {
                    await updateDoc(vidRef, vidBase);
                } else {
                    await setDoc(vidRef, {
                        ...vidBase,
                        id: cleanVidId,
                        ownerUid: user.uid,
                        artistId: artistFieldsArtistId(artistObj.id, user.uid),
                        songId: (v.songId || '').replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 128),
                        songTitle: (matchedSong?.title || '').slice(0, 200),
                        releaseYear: Math.max(ONLINE_START_YEAR, v.releaseDate?.year || state.date.year),
                        releaseWeek: Math.min(52, Math.max(1, v.releaseDate?.week || state.date.week)),
                        createdAtMs: now,
                        isPublic: true,
                        createdAt: serverTimestamp()
                    });
                }
            } catch (err) {
                console.warn('Failed syncing video:', v.title, err);
            }
        }
    }, [user]);

    const createOnlineXPost = useCallback<OnlineContextValue['createOnlineXPost']>(async (params) => {
        if (!user || !user.emailVerified) return null;
        const postId = `xp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const safeAvatar = await compressImageForCloud(params.authorAvatar, params.authorName);
        const safeImage = params.image ? await compressImageForCloud(params.image, params.authorName) : undefined;
        const payload: Record<string, any> = {
            id: postId,
            ownerUid: user.uid,
            authorId: params.authorId.replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 128) || user.uid,
            authorName: (params.authorName || 'Artist').slice(0, 120),
            authorUsername: (params.authorUsername || 'artist').replace(/^@/, '').slice(0, 64) || 'artist',
            authorAvatar: safeAvatar,
            authorVerified: Boolean(params.authorVerified),
            authorGoldVerified: Boolean(params.authorGoldVerified),
            content: (params.content || '').slice(0, 1000),
            likes: 0,
            retweets: 0,
            views: 1,
            gameYear: Math.max(ONLINE_START_YEAR, params.gameYear || ONLINE_START_YEAR),
            gameWeek: Math.min(52, Math.max(1, params.gameWeek || 1)),
            createdAtMs: Date.now(),
            isPublic: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };
        if (safeImage) payload.image = safeImage;
        if (params.replyToId) payload.replyToId = params.replyToId.replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 128);
        if (params.quotePost) {
            payload.quoteOfId = params.quotePost.id.replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 128);
            payload.quoteAuthorName = params.quotePost.authorName.slice(0, 120);
            payload.quoteAuthorUsername = params.quotePost.authorUsername.slice(0, 64);
            payload.quoteContent = params.quotePost.content.slice(0, 500);
        }

        try {
            await setDoc(doc(db, 'onlineXPosts', postId), payload);
            return postId;
        } catch (err) {
            handleFirestoreError(err, OperationType.CREATE, `onlineXPosts/${postId}`);
        }
    }, [user]);

    const toggleLikeOnlineXPost = useCallback(async (postId: string, currentlyLiked: boolean) => {
        if (!user || !user.emailVerified) return;
        const postRef = doc(db, 'onlineXPosts', postId);
        const reactionRef = doc(db, 'onlineXPosts', postId, 'reactions', user.uid);
        try {
            const snap = await getDoc(postRef);
            if (!snap.exists()) return;
            const currLikes = snap.data()?.likes || 0;
            await updateDoc(postRef, {
                likes: Math.max(0, currLikes + (currentlyLiked ? -1 : 1)),
                updatedAt: serverTimestamp()
            });
            const reactSnap = await getDoc(reactionRef);
            if (reactSnap.exists()) {
                await updateDoc(reactionRef, {
                    liked: !currentlyLiked,
                    updatedAt: serverTimestamp()
                });
            } else {
                await setDoc(reactionRef, {
                    uid: user.uid,
                    liked: !currentlyLiked,
                    reposted: false,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                });
            }
        } catch (err) {
            console.warn('Failed toggling like on X post:', err);
        }
    }, [user]);

    const toggleRepostOnlineXPost = useCallback(async (postId: string, currentlyReposted: boolean) => {
        if (!user || !user.emailVerified) return;
        const postRef = doc(db, 'onlineXPosts', postId);
        const reactionRef = doc(db, 'onlineXPosts', postId, 'reactions', user.uid);
        try {
            const snap = await getDoc(postRef);
            if (!snap.exists()) return;
            const currRt = snap.data()?.retweets || 0;
            await updateDoc(postRef, {
                retweets: Math.max(0, currRt + (currentlyReposted ? -1 : 1)),
                updatedAt: serverTimestamp()
            });
            const reactSnap = await getDoc(reactionRef);
            if (reactSnap.exists()) {
                await updateDoc(reactionRef, {
                    reposted: !currentlyReposted,
                    updatedAt: serverTimestamp()
                });
            } else {
                await setDoc(reactionRef, {
                    uid: user.uid,
                    liked: false,
                    reposted: !currentlyReposted,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                });
            }
        } catch (err) {
            console.warn('Failed toggling repost on X post:', err);
        }
    }, [user]);

    const deleteOnlineXPost = useCallback(async (postId: string) => {
        if (!user || !user.emailVerified) return;
        try {
            await deleteDoc(doc(db, 'onlineXPosts', postId));
        } catch (err) {
            handleFirestoreError(err, OperationType.DELETE, `onlineXPosts/${postId}`);
        }
    }, [user]);

    const isFollowingUid = useCallback((targetUid: string) => {
        if (!user) return false;
        return onlineFollows.some(f => f.followerUid === user.uid && f.targetUid === targetUid);
    }, [user, onlineFollows]);

    const getFollowerCountDelta = useCallback((targetUid: string) => {
        return onlineFollows.filter(f => f.targetUid === targetUid).length;
    }, [onlineFollows]);

    const toggleFollowOnlineArtist = useCallback(async (targetUid: string) => {
        if (!user || !user.emailVerified || !targetUid || targetUid === user.uid) return;
        const followId = `${user.uid}_${targetUid}`;
        const followRef = doc(db, 'onlineFollows', followId);
        try {
            const existing = await getDoc(followRef);
            if (existing.exists()) {
                await deleteDoc(followRef);
            } else {
                await setDoc(followRef, {
                    id: followId,
                    followerUid: user.uid,
                    targetUid,
                    isPublic: true,
                    createdAt: serverTimestamp()
                });
            }
        } catch (err) {
            handleFirestoreError(err, OperationType.WRITE, `onlineFollows/${followId}`);
        }
    }, [user]);

    const startOrOpenOnlineDM = useCallback(async (targetArtist: OnlineArtist, myArtist: OnlineArtist): Promise<string | null> => {
        if (!user || !user.emailVerified || !targetArtist.uid || targetArtist.uid === user.uid) return null;
        const sortedUids = [user.uid, targetArtist.uid].sort();
        const chatId = `${sortedUids[0]}_${sortedUids[1]}`;
        const chatRef = doc(db, 'onlineChats', chatId);

        const mySafeAvatar = syncCompressImageString(myArtist.avatar, myArtist.name);
        const targetSafeAvatar = syncCompressImageString(targetArtist.avatar, targetArtist.name);

        try {
            const snap = await getDoc(chatRef);
            if (!snap.exists()) {
                await setDoc(chatRef, {
                    id: chatId,
                    participantUids: sortedUids,
                    participantNames: {
                        [user.uid]: myArtist.name.slice(0, 120),
                        [targetArtist.uid]: targetArtist.name.slice(0, 120)
                    },
                    participantHandles: {
                        [user.uid]: myArtist.handle.slice(0, 64),
                        [targetArtist.uid]: targetArtist.handle.slice(0, 64)
                    },
                    participantAvatars: {
                        [user.uid]: mySafeAvatar,
                        [targetArtist.uid]: targetSafeAvatar
                    },
                    lastMessageText: '',
                    lastMessageAtMs: Date.now(),
                    lastSenderUid: user.uid,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                });
            }
            return chatId;
        } catch (err) {
            handleFirestoreError(err, OperationType.WRITE, `onlineChats/${chatId}`);
        }
    }, [user]);

    const sendOnlineDM = useCallback(async (
        chatId: string,
        text: string,
        senderArtist: { uid: string; name: string; handle: string; avatar: string },
        gameDate: GameDate
    ) => {
        if (!user || !user.emailVerified || !text.trim()) return;
        const chatRef = doc(db, 'onlineChats', chatId);
        const chatSnap = await getDoc(chatRef);
        if (!chatSnap.exists()) return;
        const chatData = chatSnap.data() as OnlineChat;

        const msgId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const now = Date.now();
        const safeAvatar = syncCompressImageString(senderArtist.avatar, senderArtist.name);
        const trimmed = text.trim().slice(0, 2000);

        try {
            await setDoc(doc(db, 'onlineChats', chatId, 'messages', msgId), {
                id: msgId,
                chatId,
                participantUids: chatData.participantUids,
                senderUid: user.uid,
                senderName: (senderArtist.name || 'Artist').slice(0, 120),
                senderAvatar: safeAvatar,
                text: trimmed,
                gameYear: Math.max(ONLINE_START_YEAR, gameDate.year),
                gameWeek: Math.min(52, Math.max(1, gameDate.week)),
                createdAtMs: now,
                createdAt: serverTimestamp()
            });

            await updateDoc(chatRef, {
                lastMessageText: trimmed.slice(0, 1000),
                lastMessageAtMs: now,
                lastSenderUid: user.uid,
                updatedAt: serverTimestamp()
            });
        } catch (err) {
            handleFirestoreError(err, OperationType.WRITE, `onlineChats/${chatId}/messages/${msgId}`);
        }
    }, [user]);

    const subscribeOnlineChatMessages = useCallback((chatId: string, callback: (messages: OnlineChatMessage[]) => void) => {
        if (!user || !chatId) return () => {};
        const q = query(
            collection(db, 'onlineChats', chatId, 'messages'),
            where('participantUids', 'array-contains', user.uid),
            limit(200)
        );
        return onSnapshot(
            q,
            (snap) => {
                const msgs = snap.docs.map(d => d.data() as OnlineChatMessage);
                msgs.sort((a, b) => (a.createdAtMs || 0) - (b.createdAtMs || 0));
                callback(msgs);
            },
            (err) => handleFirestoreError(err, OperationType.LIST, `onlineChats/${chatId}/messages`)
        );
    }, [user]);

    const preSaveOnlineRelease = useCallback(async (releaseId: string) => {
        if (!user || !user.emailVerified || !releaseId) return;
        try {
            await updateDoc(doc(db, 'onlineReleases', releaseId), {
                preSaves: increment(1),
                updatedAt: serverTimestamp()
            });
        } catch (err) {
            console.warn('Pre-save failed:', err);
        }
    }, [user]);

    const recordOnlineVideoView = useCallback(async (videoId: string) => {
        if (!user || !user.emailVerified || !videoId) return;
        try {
            await updateDoc(doc(db, 'onlineVideos', videoId), {
                views: increment(1),
                updatedAt: serverTimestamp()
            });
        } catch (err) {
            console.warn('Video view update failed:', err);
        }
    }, [user]);

    const toggleLikeOnlineVideo = useCallback(async (videoId: string) => {
        if (!user || !user.emailVerified || !videoId) return;
        try {
            await updateDoc(doc(db, 'onlineVideos', videoId), {
                likes: increment(1),
                updatedAt: serverTimestamp()
            });
        } catch (err) {
            console.warn('Video like update failed:', err);
        }
    }, [user]);

    const clearMyOnlinePresence = useCallback(async (uid: string) => {
        if (!user || user.uid !== uid) return;
        try {
            await deleteDoc(doc(db, 'onlineArtists', uid));
            for (const s of onlineSongs.filter(s => s.ownerUid === uid)) {
                await deleteDoc(doc(db, 'onlineSongs', s.id));
            }
            for (const r of onlineReleases.filter(r => r.ownerUid === uid)) {
                await deleteDoc(doc(db, 'onlineReleases', r.id));
            }
            for (const v of onlineVideos.filter(v => v.ownerUid === uid)) {
                await deleteDoc(doc(db, 'onlineVideos', v.id));
            }
            for (const p of onlineXPosts.filter(p => p.ownerUid === uid)) {
                await deleteDoc(doc(db, 'onlineXPosts', p.id));
            }
        } catch (err) {
            console.warn('Error clearing online presence:', err);
        }
    }, [user, onlineSongs, onlineReleases, onlineVideos, onlineXPosts]);

    const value: OnlineContextValue = {
        worldClock,
        globalDate,
        msUntilNextWeek,
        formattedCountdown,
        onlineArtists,
        activeOnlineArtistsCount,
        onlineSongs,
        onlineReleases,
        onlineVideos,
        onlineXPosts,
        onlineFollows,
        onlineChats,
        selectedOnlineArtistUid,
        setSelectedOnlineArtistUid,
        syncMyArtistAndCatalog,
        createOnlineXPost,
        toggleLikeOnlineXPost,
        toggleRepostOnlineXPost,
        deleteOnlineXPost,
        toggleFollowOnlineArtist,
        isFollowingUid,
        getFollowerCountDelta,
        startOrOpenOnlineDM,
        sendOnlineDM,
        subscribeOnlineChatMessages,
        preSaveOnlineRelease,
        recordOnlineVideoView,
        toggleLikeOnlineVideo,
        clearMyOnlinePresence
    };

    return (
        <OnlineContext.Provider value={value}>
            {children}
        </OnlineContext.Provider>
    );
};

function artistFieldsArtistId(id: string, fallback: string): string {
    return (id || '').replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 128) || fallback;
}

export const useOnline = () => {
    const ctx = useContext(OnlineContext);
    if (!ctx) throw new Error('useOnline must be used within an OnlineProvider');
    return ctx;
};
