/// <reference types="vite/client" />
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import {
    getFirestore,
    doc,
    setDoc,
    getDoc,
    getDocFromServer,
    getDocs,
    deleteDoc,
    collection,
    serverTimestamp,
    query,
    orderBy,
    limit
} from 'firebase/firestore';
import firebaseConfig from './firebase-applet-config.json';
import type { GameState } from './types';

const activeConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || firebaseConfig.apiKey,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || firebaseConfig.authDomain,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || firebaseConfig.projectId,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || firebaseConfig.storageBucket,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseConfig.messagingSenderId,
    appId: import.meta.env.VITE_FIREBASE_APP_ID || firebaseConfig.appId,
    firestoreDatabaseId: import.meta.env.VITE_FIREBASE_DATABASE_ID || firebaseConfig.firestoreDatabaseId,
};

const app = initializeApp(activeConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, activeConfig.firestoreDatabaseId);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
    CREATE = 'create',
    UPDATE = 'update',
    DELETE = 'delete',
    LIST = 'list',
    GET = 'get',
    WRITE = 'write',
}

export interface FirestoreErrorInfo {
    error: string;
    operationType: OperationType;
    path: string | null;
    authInfo: {
        userId?: string | null;
        email?: string | null;
        emailVerified?: boolean | null;
        isAnonymous?: boolean | null;
        tenantId?: string | null;
        providerInfo?: {
            providerId?: string | null;
            email?: string | null;
        }[];
    };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
    const errInfo: FirestoreErrorInfo = {
        error: error instanceof Error ? error.message : String(error),
        authInfo: {
            userId: auth.currentUser?.uid,
            email: auth.currentUser?.email,
            emailVerified: auth.currentUser?.emailVerified,
            isAnonymous: auth.currentUser?.isAnonymous,
            tenantId: auth.currentUser?.tenantId,
            providerInfo: auth.currentUser?.providerData?.map(provider => ({
                providerId: provider.providerId,
                email: provider.email,
            })) || []
        },
        operationType,
        path
    };
    console.error('Firestore Error: ', JSON.stringify(errInfo));
    throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
    try {
        await getDocFromServer(doc(db, 'test', 'connection'));
    } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
            console.error('Please check your Firebase configuration.');
        }
    }
}
testConnection();

export const loginWithGoogle = async () => {
    try {
        const result = await signInWithPopup(auth, googleProvider);
        return result.user;
    } catch (error) {
        console.error('Error signing in with Google:', error);
        throw error;
    }
};

export const logout = async () => {
    try {
        await signOut(auth);
    } catch (error) {
        console.error('Error signing out:', error);
    }
};

/**
 * Strip heavy redundant chart archives and ensure image strings fit comfortably inside Firestore's 1MB document limit.
 */
function buildCloudSafeGameState(state: GameState): any {
    const stripHugeImages = (val: any, depth = 0): any => {
        if (depth > 8 || val === null || val === undefined) return val;
        if (typeof val === 'string') {
            if (val.startsWith('data:') && val.length > 160000) {
                return '';
            }
            return val;
        }
        if (Array.isArray(val)) {
            return val.slice(0, 500).map(item => stripHugeImages(item, depth + 1));
        }
        if (typeof val === 'object') {
            const out: any = {};
            for (const key of Object.keys(val)) {
                out[key] = stripHugeImages(val[key], depth + 1);
            }
            return out;
        }
        return val;
    };

    const compact: any = {
        ...state,
        npcs: [],
        npcAlbums: [],
        npcImages: {},
        activeSuperstarHits: {},
        billboardHot100WeeklyArchive: (state.billboardHot100WeeklyArchive || []).slice(-12),
        ukSinglesChartWeeklyArchive: (state.ukSinglesChartWeeklyArchive || []).slice(-12),
        billboardHot100: (state.billboardHot100 || []).slice(0, 100),
        billboard200: undefined,
        billboardTopAlbums: (state.billboardTopAlbums || []).slice(0, 100),
        spotifyGlobal: (state.spotifyGlobal || []).slice(0, 100),
        offlineMode: false,
    };

    return stripHugeImages(JSON.parse(JSON.stringify(compact)));
}

export const saveCareerToCloud = async (userId: string, state: GameState): Promise<void> => {
    if (!userId || !state.careerMode) return;
    const path = `saves/${userId}`;
    try {
        const cloudSafeState = buildCloudSafeGameState(state);
        const payload = {
            userId,
            gameState: cloudSafeState,
            updatedAt: Date.now()
        };
        // Check approximate serialized size
        const serialized = JSON.stringify(payload);
        if (serialized.length > 900000) {
            // Trim chart histories if close to 1MB
            payload.gameState.billboardHot100WeeklyArchive = [];
            payload.gameState.ukSinglesChartWeeklyArchive = [];
            if (payload.gameState.artistsData) {
                for (const aid of Object.keys(payload.gameState.artistsData)) {
                    const ad = payload.gameState.artistsData[aid];
                    if (ad?.xPosts && ad.xPosts.length > 60) {
                        ad.xPosts = ad.xPosts.slice(0, 60);
                    }
                    if (ad?.inbox && ad.inbox.length > 40) {
                        ad.inbox = ad.inbox.slice(0, 40);
                    }
                }
            }
        }
        await setDoc(doc(db, 'saves', userId), payload);
    } catch (error) {
        console.warn('Cloud career save skipped/error:', error);
    }
};

export const loadCareerFromCloud = async (userId: string): Promise<GameState | null> => {
    if (!userId) return null;
    const path = `saves/${userId}`;
    try {
        const snap = await getDoc(doc(db, 'saves', userId));
        if (!snap.exists()) return null;
        const data = snap.data();
        if (data?.gameState && data.gameState.careerMode) {
            return {
                ...data.gameState,
                npcs: [],
                npcAlbums: [],
                offlineMode: false,
            } as GameState;
        }
        return null;
    } catch (error) {
        handleFirestoreError(error, OperationType.GET, path);
    }
};

export const deleteCareerFromCloud = async (userId: string): Promise<void> => {
    if (!userId) return;
    const path = `saves/${userId}`;
    try {
        await deleteDoc(doc(db, 'saves', userId));
    } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, path);
    }
};

export const uploadLeaderboardStats = async (
    userId: string,
    mode: string,
    category: string,
    score: number,
    artistName: string,
    itemName: string,
    imageUrl: string
) => {
    const colName = `leaderboards_${mode}_${category}`;
    try {
        const safeImg = imageUrl && imageUrl.length <= 2000
            ? imageUrl
            : `https://ui-avatars.com/api/?name=${encodeURIComponent(artistName)}&background=random`;
        await setDoc(doc(db, colName, userId), {
            userId,
            score: Math.max(0, Number(score) || 0),
            artistName: (artistName || 'Artist').slice(0, 120),
            itemName: (itemName || artistName || 'Career').slice(0, 200),
            imageUrl: safeImg,
            updatedAt: serverTimestamp()
        });
    } catch (error) {
        console.error('Error uploading leaderboard stat:', error);
    }
};

export const getLeaderboard = async (mode: string, category: string) => {
    const colName = `leaderboards_${mode}_${category}`;
    try {
        const q = query(
            collection(db, colName),
            orderBy('score', 'desc'),
            limit(50)
        );
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (error) {
        console.error('Error fetching leaderboard:', error);
        return [];
    }
};
