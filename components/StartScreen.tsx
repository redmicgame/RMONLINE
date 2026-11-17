import React, { useState } from 'react';
import { useGame } from '../context/GameContext';
import { useFirebase } from '../context/FirebaseContext';
import { useOnline } from '../context/OnlineContext';
import { compressImageForCloud } from '../utils/imageCompression';
import type { Artist, Group } from '../types';

type Mode = 'solo' | 'group';

interface MemberState {
    name: string;
    image: string | null;
}

const StartScreen: React.FC = () => {
    const { dispatch } = useGame();
    const { user, isLoading: isAuthLoading, login, logout } = useFirebase();
    const { globalDate, formattedCountdown, onlineArtists } = useOnline();
    const [mode, setMode] = useState<Mode>('solo');
    const [isSigningIn, setIsSigningIn] = useState(false);

    // Solo state
    const [soloName, setSoloName] = useState('');
    const [soloAge, setSoloAge] = useState(18);
    const [soloCountry, setSoloCountry] = useState<string>('US');
    const [soloImage, setSoloImage] = useState<string | null>(null);
    const [soloFandomName, setSoloFandomName] = useState('');
    const [soloPronouns, setSoloPronouns] = useState<'he/him' | 'she/her' | 'they/them'>('they/them');
    const [difficulty, setDifficulty] = useState<'easy' | 'original' | 'normal' | 'hard' | 'extreme'>('normal');

    // Group state
    const [groupName, setGroupName] = useState('');
    const [groupFandomName, setGroupFandomName] = useState('');
    const [groupImage, setGroupImage] = useState<string | null>(null);
    const [memberCount, setMemberCount] = useState(2);
    const [members, setMembers] = useState<MemberState[]>(Array(2).fill({ name: '', image: null }));

    const [error, setError] = useState('');

    const handleGoogleSignIn = async () => {
        setError('');
        setIsSigningIn(true);
        try {
            await login();
        } catch (err: any) {
            const msg = err?.message || 'Google Sign-In was cancelled or failed. Please try again.';
            setError(msg);
        } finally {
            setIsSigningIn(false);
        }
    };

    const handleMemberCountChange = (count: number) => {
        const newCount = Math.max(2, Math.min(6, count));
        setMemberCount(newCount);
        const newMembers = [...members];
        while (newMembers.length < newCount) {
            newMembers.push({ name: '', image: null });
        }
        setMembers(newMembers.slice(0, newCount));
    };

    const handleMemberChange = (index: number, field: keyof MemberState, value: string | null) => {
        const newMembers = [...members];
        newMembers[index] = { ...newMembers[index], [field]: value };
        setMembers(newMembers);
    };

    const handleImageUpload = (setter: (value: string | null) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onloadend = async () => {
                const raw = reader.result as string;
                const compressed = await compressImageForCloud(raw, 400, 0.72);
                setter(compressed);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!user) {
            setError('Please sign in with Google first.');
            return;
        }

        const startYear = Math.max(2018, globalDate.year || 2018);
        const startWeek = Math.max(1, globalDate.week || 1);

        if (mode === 'solo') {
            if (!soloName.trim() || !soloImage || !soloFandomName.trim()) {
                setError('Artist name, image, and fandom name are required.');
                return;
            }
            if (soloAge < 16) {
                setError('Artist must be at least 16 years old.');
                return;
            }
            const newArtist: Artist = {
                id: crypto.randomUUID(),
                name: soloName.trim(),
                age: soloAge,
                country: soloCountry,
                image: soloImage,
                pronouns: soloPronouns,
                fandomName: soloFandomName.trim(),
            };
            dispatch({
                type: 'START_SOLO_GAME',
                payload: {
                    artist: newArtist,
                    startYear,
                    startWeek,
                    difficultyMode: difficulty,
                    timeMode: 'weekly',
                },
            });
        } else {
            if (!groupName.trim() || !groupImage || !groupFandomName.trim()) {
                setError('Group name, image, and fandom name are required.');
                return;
            }
            if (members.some(m => !m.name.trim() || !m.image)) {
                setError('All group members must have a name and image.');
                return;
            }

            const newGroup: Group = {
                id: crypto.randomUUID(),
                name: groupName.trim(),
                image: groupImage,
                fandomName: groupFandomName.trim(),
                members: members.map(m => ({
                    id: crypto.randomUUID(),
                    name: m.name.trim(),
                    image: m.image!,
                    age: Math.floor(Math.random() * 5) + 18,
                    country: soloCountry || 'US',
                    pronouns: 'they/them',
                    fandomName: groupFandomName.trim(),
                })),
            };
            dispatch({
                type: 'START_GROUP_GAME',
                payload: {
                    group: newGroup,
                    startYear,
                    startWeek,
                    difficultyMode: difficulty,
                    timeMode: 'weekly',
                },
            });
        }
    };

    // Step 1: Online Google Sign Up / Sign In Gate
    if (!user) {
        return (
            <div className="min-h-[100dvh] bg-zinc-950 text-white flex items-center justify-center p-4">
                <div className="w-full max-w-md bg-zinc-900 rounded-2xl shadow-2xl overflow-hidden border border-zinc-800 p-8">
                    <div className="flex flex-col items-center text-center mb-8">
                        <div className="w-16 h-16 rounded-2xl bg-red-600/15 border border-red-500/30 flex items-center justify-center mb-4">
                            <svg viewBox="0 0 24 24" className="w-9 h-9 fill-current text-red-500" xmlns="http://www.w3.org/2000/svg">
                                <path d="M12 1a4 4 0 0 0-4 4v6a4 4 0 0 0 8 0V5a4 4 0 0 0-4-4zm-6 9a1 1 0 1 0-2 0 8 8 0 0 0 7 7.93V21H8a1 1 0 1 0 0 2h8a1 1 0 1 0 0-2h-3v-3.07A8 8 0 0 0 20 10a1 1 0 1 0-2 0 6 6 0 0 1-12 0z" />
                            </svg>
                        </div>
                        <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-red-400 mb-1">
                            Real-Time Online Multiplayer
                        </span>
                        <h1 className="text-4xl font-black text-white tracking-tighter">RED MIC ONLINE</h1>
                        <p className="text-zinc-400 text-sm mt-2">
                            Sign in with Google to create your artist or resume your live career.
                        </p>
                    </div>

                    <div className="bg-zinc-950/70 border border-zinc-800 rounded-xl p-4 space-y-2.5 mb-6 text-xs text-zinc-300">
                        <div className="flex items-center justify-between">
                            <span className="text-zinc-400">Starting Era</span>
                            <span className="font-bold text-white">2018 (Synchronized World)</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-zinc-400">Real-Time Pace</span>
                            <span className="font-bold text-red-400">1 Game Week = 15 Minutes</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-zinc-400">Competition</span>
                            <span className="font-bold text-emerald-400">100% Real Users • Zero NPCs</span>
                        </div>
                    </div>

                    {error && (
                        <div className="mb-4 p-3 rounded-lg bg-red-950/60 border border-red-700/60 text-red-300 text-xs text-center">
                            {error}
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={handleGoogleSignIn}
                        disabled={isSigningIn || isAuthLoading}
                        className="w-full h-12 bg-white hover:bg-zinc-100 disabled:opacity-60 text-zinc-900 font-bold px-4 rounded-xl transition-colors flex items-center justify-center gap-3 shadow-lg"
                    >
                        {isSigningIn || isAuthLoading ? (
                            <>
                                <div className="w-5 h-5 border-2 border-zinc-800 border-t-transparent rounded-full animate-spin" />
                                <span>Connecting...</span>
                            </>
                        ) : (
                            <>
                                <svg className="w-5 h-5" viewBox="0 0 24 24">
                                    <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z" />
                                    <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z" />
                                    <path fill="#FBBC05" d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z" />
                                    <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z" />
                                </svg>
                                <span>Continue with Google</span>
                            </>
                        )}
                    </button>

                    <p className="text-[11px] text-zinc-500 text-center mt-5 leading-relaxed">
                        Your career, discography, X profile, DMs, YouTube channel, and chart positions sync live across all online players.
                    </p>
                </div>
            </div>
        );
    }

    // Step 2: Authenticated Online Artist Creation
    return (
        <div className="min-h-[100dvh] bg-zinc-950 text-white flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-zinc-900 rounded-2xl shadow-2xl overflow-hidden border border-zinc-800 my-4">
                <div className="px-4 py-2.5 bg-zinc-950 border-b border-zinc-800 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                        {user.photoURL && (
                            <img src={user.photoURL} alt="" className="w-6 h-6 rounded-full object-cover" />
                        )}
                        <span className="text-zinc-300 font-medium truncate">
                            {user.displayName || user.email}
                        </span>
                    </div>
                    <button
                        type="button"
                        onClick={() => logout()}
                        className="text-zinc-400 hover:text-red-400 font-semibold flex-shrink-0 ml-2"
                    >
                        Sign Out
                    </button>
                </div>

                <div className="flex bg-zinc-800">
                    <button
                        type="button"
                        onClick={() => setMode('solo')}
                        className={`flex-1 py-3.5 font-bold text-sm transition-colors ${mode === 'solo' ? 'bg-red-600 text-white' : 'text-zinc-400 hover:bg-zinc-700 hover:text-white'}`}
                    >
                        SOLO ARTIST
                    </button>
                    <button
                        type="button"
                        onClick={() => setMode('group')}
                        className={`flex-1 py-3.5 font-bold text-sm transition-colors ${mode === 'group' ? 'bg-red-600 text-white' : 'text-zinc-400 hover:bg-zinc-700 hover:text-white'}`}
                    >
                        GROUP / BAND
                    </button>
                </div>

                <div className="p-6 sm:p-8">
                    <h1 className="text-3xl font-black text-center text-red-500 mb-1 tracking-tighter">RED MIC ONLINE</h1>
                    <p className="text-center text-zinc-400 text-sm mb-5 font-medium">
                        Create your artist profile to enter the charts
                    </p>

                    <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-3 mb-5 flex items-center justify-between text-xs">
                        <div>
                            <p className="text-zinc-400 uppercase tracking-wider text-[10px] font-bold">Live World Clock</p>
                            <p className="text-white font-bold">
                                Week {globalDate.week}, {Math.max(2018, globalDate.year)}
                            </p>
                        </div>
                        <div className="text-right">
                            <p className="text-emerald-400 font-bold">
                                {onlineArtists.length} {onlineArtists.length === 1 ? 'artist' : 'artists'} online
                            </p>
                            <p className="text-zinc-400">Next week in {formattedCountdown}</p>
                        </div>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {mode === 'solo' ? (
                            <>
                                <div className="flex justify-center">
                                    <label htmlFor="artist-image" className="cursor-pointer">
                                        <div className="w-28 h-28 rounded-full bg-zinc-800 border-2 border-dashed border-zinc-600 flex items-center justify-center hover:border-red-500 transition-colors overflow-hidden">
                                            {soloImage ? (
                                                <img src={soloImage} alt="Artist" className="w-full h-full rounded-full object-cover" />
                                            ) : (
                                                <span className="text-zinc-400 text-xs text-center px-2">Upload Photo</span>
                                            )}
                                        </div>
                                    </label>
                                    <input id="artist-image" type="file" accept="image/*" className="hidden" onChange={handleImageUpload(setSoloImage)} />
                                </div>
                                <div>
                                    <label htmlFor="artist-name" className="block text-sm font-medium text-zinc-300">Artist Name</label>
                                    <input
                                        type="text"
                                        id="artist-name"
                                        value={soloName}
                                        onChange={e => setSoloName(e.target.value)}
                                        placeholder="Stage name"
                                        className="mt-1 block w-full bg-zinc-800 border border-zinc-700 rounded-lg text-sm h-10 px-3 focus:outline-none focus:border-red-500"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="fandom-name" className="block text-sm font-medium text-zinc-300">Fandom Name</label>
                                    <input
                                        type="text"
                                        id="fandom-name"
                                        value={soloFandomName}
                                        onChange={e => setSoloFandomName(e.target.value)}
                                        placeholder="e.g. Swifties, The Hive"
                                        className="mt-1 block w-full bg-zinc-800 border border-zinc-700 rounded-lg text-sm h-10 px-3 focus:outline-none focus:border-red-500"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label htmlFor="artist-age" className="block text-sm font-medium text-zinc-300">Age</label>
                                        <input
                                            type="number"
                                            id="artist-age"
                                            value={soloAge || ''}
                                            onChange={e => setSoloAge(parseInt(e.target.value) || 0)}
                                            className="mt-1 block w-full bg-zinc-800 border border-zinc-700 rounded-lg text-sm h-10 px-3 focus:outline-none focus:border-red-500"
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor="pronouns" className="block text-sm font-medium text-zinc-300">Pronouns</label>
                                        <select
                                            id="pronouns"
                                            value={soloPronouns}
                                            onChange={e => setSoloPronouns(e.target.value as any)}
                                            className="mt-1 block w-full bg-zinc-800 border border-zinc-700 rounded-lg text-sm h-10 px-3 focus:outline-none focus:border-red-500"
                                        >
                                            <option>they/them</option>
                                            <option>she/her</option>
                                            <option>he/him</option>
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label htmlFor="country" className="block text-sm font-medium text-zinc-300">Country / Region</label>
                                    <select
                                        id="country"
                                        value={soloCountry}
                                        onChange={e => setSoloCountry(e.target.value)}
                                        className="mt-1 block w-full bg-zinc-800 border border-zinc-700 rounded-lg text-sm h-10 px-3 focus:outline-none focus:border-red-500"
                                    >
                                        <option value="US">US</option>
                                        <option value="UK">UK</option>
                                        <option value="Canada">Canada</option>
                                        <option value="Latin America">Latin America</option>
                                        <option value="Asia">Asia</option>
                                        <option value="Africa">Africa</option>
                                    </select>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="flex justify-center">
                                    <label htmlFor="group-image" className="cursor-pointer">
                                        <div className="w-28 h-28 rounded-xl bg-zinc-800 border-2 border-dashed border-zinc-600 flex items-center justify-center hover:border-red-500 transition-colors overflow-hidden">
                                            {groupImage ? (
                                                <img src={groupImage} alt="Group" className="w-full h-full object-cover" />
                                            ) : (
                                                <span className="text-zinc-400 text-xs text-center px-2">Upload Group Image</span>
                                            )}
                                        </div>
                                    </label>
                                    <input id="group-image" type="file" accept="image/*" className="hidden" onChange={handleImageUpload(setGroupImage)} />
                                </div>
                                <div>
                                    <label htmlFor="group-name" className="block text-sm font-medium text-zinc-300">Group Name</label>
                                    <input
                                        type="text"
                                        id="group-name"
                                        value={groupName}
                                        onChange={e => setGroupName(e.target.value)}
                                        className="mt-1 block w-full bg-zinc-800 border border-zinc-700 rounded-lg text-sm h-10 px-3 focus:outline-none focus:border-red-500"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="group-fandom-name" className="block text-sm font-medium text-zinc-300">Fandom Name</label>
                                    <input
                                        type="text"
                                        id="group-fandom-name"
                                        value={groupFandomName}
                                        onChange={e => setGroupFandomName(e.target.value)}
                                        placeholder="e.g. The Army, Directioners"
                                        className="mt-1 block w-full bg-zinc-800 border border-zinc-700 rounded-lg text-sm h-10 px-3 focus:outline-none focus:border-red-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-zinc-300">Members</label>
                                    <div className="mt-1 grid grid-cols-5 gap-2">
                                        {[2, 3, 4, 5, 6].map(count => (
                                            <button
                                                type="button"
                                                key={count}
                                                onClick={() => handleMemberCountChange(count)}
                                                className={`py-2 rounded-lg font-bold text-sm transition-colors ${memberCount === count ? 'bg-red-600' : 'bg-zinc-800 hover:bg-zinc-700'}`}
                                            >
                                                {count}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-3 max-h-44 overflow-y-auto pr-1">
                                    {members.map((member, index) => (
                                        <div key={index} className="flex items-center gap-3">
                                            <label htmlFor={`member-image-${index}`} className="cursor-pointer flex-shrink-0">
                                                <div className="w-11 h-11 rounded-full bg-zinc-800 border-2 border-dashed border-zinc-600 flex items-center justify-center hover:border-red-500 transition-colors overflow-hidden">
                                                    {member.image ? (
                                                        <img src={member.image} alt={`Member ${index + 1}`} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <span className="text-zinc-400 text-[10px]">Img</span>
                                                    )}
                                                </div>
                                            </label>
                                            <input
                                                id={`member-image-${index}`}
                                                type="file"
                                                accept="image/*"
                                                className="hidden"
                                                onChange={handleImageUpload(val => handleMemberChange(index, 'image', val))}
                                            />
                                            <input
                                                type="text"
                                                placeholder={`Member ${index + 1} Name`}
                                                value={member.name}
                                                onChange={e => handleMemberChange(index, 'name', e.target.value)}
                                                className="block w-full bg-zinc-800 border border-zinc-700 rounded-lg text-sm h-10 px-3 focus:outline-none focus:border-red-500"
                                            />
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}

                        <div>
                            <label htmlFor="difficulty" className="block text-sm font-medium text-zinc-300">Difficulty</label>
                            <select
                                id="difficulty"
                                value={difficulty}
                                onChange={e => setDifficulty(e.target.value as any)}
                                className="mt-1 block w-full bg-zinc-800 border border-zinc-700 rounded-lg text-sm h-10 px-3 focus:outline-none focus:border-red-500"
                            >
                                <option value="easy">Easy</option>
                                <option value="original">Original</option>
                                <option value="normal">Normal</option>
                                <option value="hard">Hard</option>
                                <option value="extreme">Extreme</option>
                            </select>
                        </div>

                        {error && <p className="text-red-400 text-sm text-center">{error}</p>}

                        <button
                            type="submit"
                            className="w-full h-12 bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-xl transition-colors shadow-lg shadow-red-600/20"
                        >
                            ENTER ONLINE WORLD
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default StartScreen;