import React, { useState, useMemo } from 'react';
import { useGame, formatNumber } from '../context/GameContext';
import { useFirebase } from '../context/FirebaseContext';
import { useOnline, OnlineXPost } from '../context/OnlineContext';
import { XPost, XUser } from '../types';
import ArrowLeftIcon from './icons/ArrowLeftIcon';
import UserVerifiedBadge from './icons/UserVerifiedBadge';
import MessageIcon from './icons/MessageIcon';
import HeartIcon from './icons/HeartIcon';
import { ComposeXPostModal, Post } from './XView';
import { compressImageForCloud } from '../utils/imageCompression';

const DEFAULT_AVATAR = 'https://ui-avatars.com/api/?background=27272a&color=fff&name=Artist';

function onlinePostToXPost(p: OnlineXPost): XPost {
    return {
        id: p.id,
        authorId: p.ownerUid,
        content: p.content,
        image: p.image,
        likes: p.likes || 0,
        retweets: p.retweets || 0,
        views: p.views || 1,
        date: { week: p.gameWeek || 1, year: p.gameYear || 2018 },
        replyToId: p.replyToId,
        quoteOf: p.quoteOfId
            ? {
                  id: p.quoteOfId,
                  authorId: p.quoteOfId,
                  content: p.quoteContent || '',
                  likes: 0,
                  retweets: 0,
                  views: 0,
                  date: { week: p.gameWeek || 1, year: p.gameYear || 2018 },
              }
            : undefined,
    };
}

const XProfileView: React.FC = () => {
    const { gameState, dispatch, activeArtistData, activeArtist } = useGame();
    const { user } = useFirebase();
    const {
        onlineArtists,
        onlineXPosts,
        selectedOnlineArtistUid,
        setSelectedOnlineArtistUid,
        isFollowingUid,
        toggleFollowOnlineArtist,
        getFollowerCountDelta,
        startOrOpenOnlineDM,
        createOnlineXPost,
    } = useOnline();

    const [quotePostTarget, setQuotePostTarget] = useState<XPost | null>(null);
    const [showAbout, setShowAbout] = useState(false);
    const [showPremiumModal, setShowPremiumModal] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState('');
    const [editBio, setEditBio] = useState('');
    const [editHeader, setEditHeader] = useState('');
    const [editAvatar, setEditAvatar] = useState('');
    const [activeTab, setActiveTab] = useState<'posts' | 'replies' | 'media'>('posts');

    const { selectedXUserId } = gameState;
    const xUsers = activeArtistData?.xUsers || [];
    const selectedPlayerXUserId = activeArtistData?.selectedPlayerXUserId;
    const playerUser = selectedPlayerXUserId
        ? xUsers.find(u => u.id === selectedPlayerXUserId)
        : xUsers.find(u => u.isPlayer);

    const targetOnlineArtist = useMemo(() => {
        const lookupUid = selectedOnlineArtistUid || selectedXUserId;
        if (!lookupUid) return onlineArtists.find(a => a.uid === user?.uid);
        return (
            onlineArtists.find(a => a.uid === lookupUid) ||
            onlineArtists.find(a => a.artistId === lookupUid) ||
            (playerUser && lookupUid === playerUser.id ? onlineArtists.find(a => a.uid === user?.uid) : undefined)
        );
    }, [onlineArtists, selectedOnlineArtistUid, selectedXUserId, user?.uid, playerUser]);

    const isOwnProfile = Boolean(
        (targetOnlineArtist && user?.uid && targetOnlineArtist.uid === user.uid) ||
        (!targetOnlineArtist && playerUser && (!selectedXUserId || selectedXUserId === playerUser.id))
    );

    const displayProfile: XUser | null = useMemo(() => {
        if (targetOnlineArtist) {
            return {
                id: targetOnlineArtist.uid,
                name: targetOnlineArtist.name,
                username: targetOnlineArtist.handle,
                avatar: targetOnlineArtist.avatar || DEFAULT_AVATAR,
                headerImage: targetOnlineArtist.headerImage,
                bio: targetOnlineArtist.bio,
                isVerified: targetOnlineArtist.isVerified,
                isPlayer: isOwnProfile,
                followersCount: (targetOnlineArtist.followers || 0) + getFollowerCountDelta(targetOnlineArtist.uid),
                followingCount: 0,
                country: targetOnlineArtist.country,
            };
        }
        if (isOwnProfile && playerUser) {
            return playerUser;
        }
        return null;
    }, [targetOnlineArtist, isOwnProfile, playerUser, getFollowerCountDelta]);

    const targetUid = targetOnlineArtist?.uid || (isOwnProfile ? user?.uid : undefined);

    const profileOnlinePosts = useMemo(() => {
        if (!targetUid) return [];
        return onlineXPosts
            .filter(p => p.ownerUid === targetUid)
            .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
    }, [onlineXPosts, targetUid]);

    const topLevelPosts = useMemo(
        () => profileOnlinePosts.filter(p => !p.replyToId).map(onlinePostToXPost),
        [profileOnlinePosts]
    );
    const replyPosts = useMemo(
        () => profileOnlinePosts.filter(p => Boolean(p.replyToId)).map(onlinePostToXPost),
        [profileOnlinePosts]
    );
    const mediaPosts = useMemo(
        () => profileOnlinePosts.filter(p => Boolean(p.image)).map(onlinePostToXPost),
        [profileOnlinePosts]
    );

    const followingThisArtist = targetUid ? isFollowingUid(targetUid) : false;

    const handleBack = () => {
        setSelectedOnlineArtistUid(null);
        dispatch({ type: 'CHANGE_VIEW', payload: 'x' });
    };

    const handleFollow = async () => {
        if (!targetUid || isOwnProfile) return;
        await toggleFollowOnlineArtist(targetUid);
    };

    const handleMessage = async () => {
        if (!targetOnlineArtist || !user || isOwnProfile) return;
        const myOnline = onlineArtists.find(a => a.uid === user.uid) || {
            uid: user.uid,
            artistId: activeArtist?.id || user.uid,
            name: playerUser?.name || activeArtist?.name || 'Artist',
            handle: playerUser?.username || 'artist',
            avatar: playerUser?.avatar || activeArtist?.image || DEFAULT_AVATAR,
            country: 'US',
            careerMode: (gameState.careerMode || 'solo') as 'solo' | 'group',
            fandomName: activeArtist?.fandomName || 'Fans',
            followers: playerUser?.followersCount || 0,
            monthlyListeners: activeArtistData?.monthlyListeners || 0,
            totalStreams: 0,
            youtubeSubscribers: activeArtistData?.youtubeSubscribers || 0,
            popularity: activeArtistData?.popularity || 0,
            hype: activeArtistData?.hype || 0,
            lastActiveAtMs: Date.now(),
        };
        const chatId = await startOrOpenOnlineDM(targetOnlineArtist, myOnline);
        if (chatId) {
            dispatch({ type: 'VIEW_X_CHAT', payload: chatId });
        }
    };

    const handleEditProfile = () => {
        if (!displayProfile) return;
        setEditName(displayProfile.name);
        setEditBio(displayProfile.bio || '');
        setEditHeader(displayProfile.headerImage || '');
        setEditAvatar(displayProfile.avatar || '');
        setIsEditing(true);
    };

    const handleSaveProfile = () => {
        if (!playerUser) return;
        dispatch({
            type: 'EDIT_X_PROFILE',
            payload: {
                userId: playerUser.id,
                name: editName,
                bio: editBio,
                headerImage: editHeader,
                avatar: editAvatar,
            },
        });
        setIsEditing(false);
    };

    const resolvePostAuthor = (authorUid: string): XUser => {
        const oa = onlineArtists.find(a => a.uid === authorUid);
        if (oa) {
            return {
                id: oa.uid,
                name: oa.name,
                username: oa.handle,
                avatar: oa.avatar || DEFAULT_AVATAR,
                isVerified: oa.isVerified,
                isPlayer: oa.uid === user?.uid,
            };
        }
        return displayProfile || {
            id: authorUid,
            name: 'Artist',
            username: 'artist',
            avatar: DEFAULT_AVATAR,
            isVerified: false,
        };
    };

    if (!displayProfile) {
        return (
            <div className="bg-black text-white h-full flex flex-col items-center justify-center p-6 text-center">
                <p className="text-zinc-400 mb-4">Artist profile not found.</p>
                <button
                    onClick={handleBack}
                    className="px-5 py-2 bg-blue-500 rounded-full font-bold text-sm"
                >
                    Back to X
                </button>
            </div>
        );
    }

    const displayedPosts =
        activeTab === 'posts' ? topLevelPosts : activeTab === 'replies' ? replyPosts : mediaPosts;

    return (
        <div className="bg-black text-white h-full overflow-y-auto w-full pb-28 relative select-none">
            <header className="sticky top-0 bg-black/80 backdrop-blur-md z-30 p-3 flex items-center gap-4 border-b border-zinc-900">
                <button
                    onClick={handleBack}
                    className="p-2 rounded-full hover:bg-zinc-800 transition-colors"
                >
                    <ArrowLeftIcon className="w-5 h-5" />
                </button>
                <div className="min-w-0">
                    <h2 className="font-bold text-lg leading-tight flex items-center gap-1.5 truncate">
                        {displayProfile.name}
                        <UserVerifiedBadge isVerified={displayProfile.isVerified} className="w-4 h-4 flex-shrink-0" />
                    </h2>
                    <p className="text-xs text-zinc-500">{profileOnlinePosts.length} posts</p>
                </div>
            </header>

            <div
                className="h-32 sm:h-40 bg-zinc-800 relative bg-cover bg-center"
                style={{
                    backgroundImage: displayProfile.headerImage
                        ? `url(${displayProfile.headerImage})`
                        : undefined,
                }}
            />

            <div className="p-3">
                <div className="flex justify-between items-start -mt-14">
                    <img
                        src={displayProfile.avatar}
                        alt={displayProfile.name}
                        className="w-28 h-28 rounded-full object-cover border-4 border-black relative z-10 bg-zinc-900"
                    />
                    <div className="flex items-center gap-2 pt-14">
                        {!isOwnProfile ? (
                            <>
                                <button
                                    onClick={handleMessage}
                                    title="Direct Message"
                                    className="border border-zinc-600 rounded-full p-2 hover:bg-zinc-800 transition-colors"
                                >
                                    <MessageIcon className="w-5 h-5" />
                                </button>
                                <button
                                    onClick={handleFollow}
                                    className={`font-bold px-4 py-1.5 rounded-full text-sm transition-colors ${
                                        followingThisArtist
                                            ? 'bg-transparent text-white border border-zinc-600 hover:border-red-500'
                                            : 'bg-white text-black hover:bg-zinc-200'
                                    }`}
                                >
                                    {followingThisArtist ? 'Following' : 'Follow'}
                                </button>
                            </>
                        ) : (
                            <>
                                <button
                                    onClick={handleEditProfile}
                                    className="border border-zinc-600 rounded-full px-4 py-1.5 font-bold text-sm hover:bg-zinc-800 transition-colors"
                                >
                                    Edit Profile
                                </button>
                                {!displayProfile.isVerified && playerUser && (
                                    <button
                                        onClick={() => setShowPremiumModal(true)}
                                        className="font-bold px-4 py-1.5 rounded-full text-sm text-black bg-white hover:bg-zinc-200 transition-colors"
                                    >
                                        Get Verified
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                </div>

                <div className="mt-3">
                    <div className="flex items-center gap-1">
                        <h1 className="text-xl font-bold">{displayProfile.name}</h1>
                        <UserVerifiedBadge isVerified={displayProfile.isVerified} className="w-5 h-5 flex-shrink-0" />
                    </div>
                    <button
                        onClick={() => setShowAbout(true)}
                        className="text-zinc-500 hover:text-white transition-colors text-sm"
                    >
                        @{displayProfile.username}
                    </button>
                    {displayProfile.bio && (
                        <p className="mt-2 text-sm leading-relaxed">{displayProfile.bio}</p>
                    )}

                    {targetOnlineArtist && (
                        <div className="flex flex-wrap gap-3 text-xs text-zinc-400 mt-2">
                            <span>🎵 {formatNumber(targetOnlineArtist.monthlyListeners)} monthly listeners</span>
                            <span>🎤 Fandom: {targetOnlineArtist.fandomName}</span>
                            <span>🌍 {targetOnlineArtist.country}</span>
                        </div>
                    )}

                    <div className="flex gap-4 text-sm text-zinc-500 mt-2">
                        <p>
                            <span className="font-bold text-white">
                                {formatNumber(displayProfile.followersCount || 0)}
                            </span>{' '}
                            Followers
                        </p>
                    </div>

                    {isOwnProfile && (
                        <div className="flex gap-2 mt-3">
                            <button
                                onClick={() => dispatch({ type: 'CHANGE_VIEW', payload: 'xAnalytics' })}
                                className="flex-1 flex items-center justify-center gap-2 border border-zinc-700 py-1.5 rounded-full text-sm font-bold hover:bg-zinc-900 transition-colors"
                            >
                                Analytics
                            </button>
                            <button
                                onClick={() => dispatch({ type: 'CHANGE_VIEW', payload: 'xCreatorStudio' })}
                                className="flex-1 flex items-center justify-center gap-2 border border-zinc-700 py-1.5 rounded-full text-sm font-bold hover:bg-zinc-900 transition-colors"
                            >
                                Monetization
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <div className="border-b border-zinc-800 mt-2 flex">
                {(['posts', 'replies', 'media'] as const).map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`flex-1 py-3 text-sm font-bold capitalize relative transition-colors ${
                            activeTab === tab ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                    >
                        {tab}
                        {activeTab === tab && (
                            <div className="absolute bottom-0 left-8 right-8 h-1 bg-blue-500 rounded-full" />
                        )}
                    </button>
                ))}
            </div>

            <div>
                {displayedPosts.length > 0 ? (
                    displayedPosts.map((post) => (
                        <Post
                            key={post.id}
                            post={post}
                            author={resolvePostAuthor(post.authorId)}
                            onQuote={setQuotePostTarget}
                        />
                    ))
                ) : (
                    <div className="p-8 text-center text-zinc-500 text-sm">
                        No {activeTab} yet.
                    </div>
                )}
            </div>

            {quotePostTarget && playerUser && (
                <ComposeXPostModal
                    user={playerUser}
                    quotePost={quotePostTarget}
                    onClose={() => setQuotePostTarget(null)}
                    onPost={async (payload) => {
                        dispatch({ type: 'POST_ON_X', payload });
                        await createOnlineXPost({
                            content: payload.content,
                            image: payload.image,
                            quotePost: payload.quoteOf
                                ? {
                                      id: payload.quoteOf.id,
                                      authorName: resolvePostAuthor(payload.quoteOf.authorId).name,
                                      authorUsername: resolvePostAuthor(payload.quoteOf.authorId).username,
                                      content: payload.quoteOf.content,
                                  }
                                : undefined,
                            authorId: playerUser.id,
                            authorName: playerUser.name,
                            authorUsername: playerUser.username,
                            authorAvatar: playerUser.avatar,
                            authorVerified: Boolean(playerUser.isVerified),
                            authorGoldVerified: playerUser.isVerified === 'gold',
                            gameYear: gameState.date.year,
                            gameWeek: gameState.date.week,
                        });
                        setQuotePostTarget(null);
                    }}
                />
            )}

            {showAbout && (
                <div className="fixed inset-0 bg-black/80 flex justify-center items-center p-4 z-50">
                    <div className="bg-black border border-zinc-800 rounded-3xl w-full max-w-sm flex flex-col p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="font-bold text-lg">About this artist</h2>
                            <button
                                onClick={() => setShowAbout(false)}
                                className="text-zinc-400 hover:text-white font-bold"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="flex flex-col items-center text-center space-y-2">
                            <img
                                src={displayProfile.avatar}
                                className="w-20 h-20 rounded-full object-cover"
                                alt={displayProfile.name}
                            />
                            <h3 className="font-bold text-lg flex items-center gap-1">
                                {displayProfile.name}
                                <UserVerifiedBadge isVerified={displayProfile.isVerified} className="w-5 h-5" />
                            </h3>
                            <p className="text-zinc-500">@{displayProfile.username}</p>
                            <p className="text-xs text-zinc-400 pt-2">
                                Verified online artist on Red Mic
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {showPremiumModal && playerUser && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-sm p-6 text-center">
                        <h2 className="text-2xl font-bold mb-2">Upgrade to Premium</h2>
                        <p className="text-zinc-400 mb-6">Choose your verification tier.</p>

                        <div className="space-y-4">
                            <button
                                onClick={() => {
                                    if (activeArtistData && activeArtistData.money >= 25000) {
                                        dispatch({
                                            type: 'BUY_X_VERIFICATION',
                                            payload: { accountId: playerUser.id, tier: 'blue', cost: 25000 },
                                        });
                                        setShowPremiumModal(false);
                                    }
                                }}
                                className="w-full bg-[#1DA1F2]/10 hover:bg-[#1DA1F2]/20 border border-[#1DA1F2] p-4 rounded-2xl flex flex-col items-center transition-colors"
                            >
                                <UserVerifiedBadge isVerified="blue" className="w-10 h-10 mb-2" />
                                <span className="font-bold text-lg text-[#1DA1F2]">Blue</span>
                                <span className="text-zinc-300 text-sm">$25K</span>
                            </button>

                            <button
                                onClick={() => {
                                    if (activeArtistData && activeArtistData.money >= 250000) {
                                        dispatch({
                                            type: 'BUY_X_VERIFICATION',
                                            payload: { accountId: playerUser.id, tier: 'gold', cost: 250000 },
                                        });
                                        setShowPremiumModal(false);
                                    }
                                }}
                                className="w-full bg-yellow-400/10 hover:bg-yellow-400/20 border border-yellow-400 p-4 rounded-2xl flex flex-col items-center transition-colors"
                            >
                                <UserVerifiedBadge isVerified="gold" className="w-10 h-10 mb-2" />
                                <span className="font-bold text-lg text-yellow-400">Gold</span>
                                <span className="text-zinc-300 text-sm">$250K</span>
                            </button>
                        </div>

                        <button
                            onClick={() => setShowPremiumModal(false)}
                            className="mt-6 font-bold text-zinc-500 hover:text-white"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {isEditing && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
                    <div className="bg-black w-full max-w-md rounded-2xl overflow-hidden border border-zinc-800 flex flex-col max-h-[90vh]">
                        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
                            <div className="flex items-center gap-4">
                                <button
                                    onClick={() => setIsEditing(false)}
                                    className="text-white hover:bg-zinc-800 p-2 rounded-full"
                                >
                                    <ArrowLeftIcon className="w-5 h-5" />
                                </button>
                                <h2 className="text-xl font-bold">Edit profile</h2>
                            </div>
                            <button
                                onClick={handleSaveProfile}
                                className="bg-white text-black font-bold px-4 py-1.5 rounded-full text-sm"
                            >
                                Save
                            </button>
                        </div>
                        <div className="p-4 overflow-y-auto space-y-4">
                            <div>
                                <label className="text-xs text-zinc-500 block">Name</label>
                                <input
                                    type="text"
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    className="w-full bg-black border-b border-zinc-700 text-white p-2 focus:border-blue-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-zinc-500 block">Bio</label>
                                <textarea
                                    value={editBio}
                                    onChange={(e) => setEditBio(e.target.value)}
                                    className="w-full bg-black border-b border-zinc-700 text-white p-2 focus:border-blue-500 outline-none resize-none h-20"
                                    maxLength={160}
                                />
                            </div>
                            <div>
                                <label className="text-xs text-zinc-500 block mb-2">Header Image</label>
                                {editHeader && (
                                    <img
                                        src={editHeader}
                                        className="w-full h-24 object-cover mb-2 rounded-md"
                                        alt="Header Preview"
                                    />
                                )}
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) => {
                                        if (e.target.files?.[0]) {
                                            const reader = new FileReader();
                                            reader.onloadend = async () => {
                                                const c = await compressImageForCloud(reader.result as string, 600, 0.7);
                                                setEditHeader(c);
                                            };
                                            reader.readAsDataURL(e.target.files[0]);
                                        }
                                    }}
                                    className="w-full text-sm text-zinc-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-zinc-800 file:text-white hover:file:bg-zinc-700"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-zinc-500 block mb-2">Avatar Image</label>
                                {editAvatar && (
                                    <img
                                        src={editAvatar}
                                        className="w-16 h-16 object-cover mb-2 rounded-full border border-zinc-700"
                                        alt="Avatar Preview"
                                    />
                                )}
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) => {
                                        if (e.target.files?.[0]) {
                                            const reader = new FileReader();
                                            reader.onloadend = async () => {
                                                const c = await compressImageForCloud(reader.result as string, 400, 0.72);
                                                setEditAvatar(c);
                                            };
                                            reader.readAsDataURL(e.target.files[0]);
                                        }
                                    }}
                                    className="w-full text-sm text-zinc-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-zinc-800 file:text-white hover:file:bg-zinc-700"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default XProfileView;