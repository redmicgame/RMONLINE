import React, { useState, useRef, useEffect } from 'react';
import { useGame } from '../context/GameContext';
import { useFirebase } from '../context/FirebaseContext';
import { useOnline, OnlineChatMessage, OnlineArtist } from '../context/OnlineContext';
import ArrowLeftIcon from './icons/ArrowLeftIcon';

const DEFAULT_AVATAR = 'https://ui-avatars.com/api/?background=27272a&color=fff&name=Artist';

const XChatView: React.FC = () => {
    const { gameState, dispatch, activeArtistData, activeArtist } = useGame();
    const { user } = useFirebase();
    const {
        onlineChats,
        onlineArtists,
        sendOnlineDM,
        subscribeOnlineChatMessages,
        setSelectedOnlineArtistUid,
    } = useOnline();

    const { selectedXChatId } = gameState;
    const [messageText, setMessageText] = useState('');
    const [messages, setMessages] = useState<OnlineChatMessage[]>([]);
    const [isSending, setIsSending] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const chat = onlineChats.find(c => c.id === selectedXChatId);
    const otherUid = chat?.participantUids.find(uid => uid !== user?.uid) || '';
    const otherArtist: OnlineArtist | undefined = onlineArtists.find(a => a.uid === otherUid);

    const otherName =
        otherArtist?.name ||
        (otherUid ? chat?.participantNames?.[otherUid] : '') ||
        'Online Artist';
    const otherHandle =
        otherArtist?.handle ||
        (otherUid ? chat?.participantHandles?.[otherUid] : '') ||
        'artist';
    const otherAvatar =
        otherArtist?.avatar ||
        (otherUid ? chat?.participantAvatars?.[otherUid] : '') ||
        DEFAULT_AVATAR;

    const playerXUser = activeArtistData?.selectedPlayerXUserId
        ? activeArtistData.xUsers.find(u => u.id === activeArtistData.selectedPlayerXUserId)
        : activeArtistData?.xUsers.find(u => u.isPlayer);

    useEffect(() => {
        if (!selectedXChatId || !user) {
            setMessages([]);
            return;
        }
        const unsub = subscribeOnlineChatMessages(selectedXChatId, (msgs) => {
            setMessages(msgs);
        });
        return () => unsub();
    }, [selectedXChatId, user, subscribeOnlineChatMessages]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedXChatId || !user || !messageText.trim() || isSending) return;

        const textToSend = messageText.trim();
        setMessageText('');
        setIsSending(true);
        try {
            await sendOnlineDM(
                selectedXChatId,
                textToSend,
                {
                    uid: user.uid,
                    name: playerXUser?.name || activeArtist?.name || user.displayName || 'Artist',
                    handle: playerXUser?.username || 'artist',
                    avatar: playerXUser?.avatar || activeArtist?.image || DEFAULT_AVATAR,
                },
                gameState.date
            );
        } finally {
            setIsSending(false);
        }
    };

    const openPartnerProfile = () => {
        if (!otherUid) return;
        setSelectedOnlineArtistUid(otherUid);
        dispatch({ type: 'VIEW_X_PROFILE', payload: otherUid });
    };

    if (!selectedXChatId || !user) {
        return (
            <div className="bg-black text-white h-full flex flex-col items-center justify-center p-6 text-center">
                <p className="text-zinc-400 mb-4">Conversation not found.</p>
                <button
                    onClick={() => dispatch({ type: 'CHANGE_VIEW', payload: 'x' })}
                    className="px-5 py-2 bg-blue-500 rounded-full font-bold text-sm"
                >
                    Back to X
                </button>
            </div>
        );
    }

    return (
        <div className="bg-black text-white h-full flex flex-col pb-16">
            <header className="sticky top-0 bg-black/90 backdrop-blur-md z-20 p-3 flex items-center gap-3 border-b border-zinc-800">
                <button
                    onClick={() => dispatch({ type: 'CHANGE_VIEW', payload: 'x' })}
                    className="p-2 rounded-full hover:bg-zinc-800 transition-colors"
                >
                    <ArrowLeftIcon className="w-5 h-5" />
                </button>
                <button
                    onClick={openPartnerProfile}
                    className="flex items-center gap-3 text-left min-w-0 flex-1"
                >
                    <img
                        src={otherAvatar}
                        alt={otherName}
                        className="w-9 h-9 rounded-full object-cover border border-zinc-700 flex-shrink-0"
                    />
                    <div className="min-w-0">
                        <h2 className="font-bold text-base leading-tight truncate">{otherName}</h2>
                        <p className="text-xs text-zinc-400 truncate">@{otherHandle}</p>
                    </div>
                </button>
            </header>

            <main className="flex-1 p-4 overflow-y-auto space-y-3">
                {messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center text-zinc-500 py-12">
                        <img
                            src={otherAvatar}
                            alt={otherName}
                            className="w-16 h-16 rounded-full object-cover mb-3 border border-zinc-800"
                        />
                        <p className="font-bold text-white text-base">{otherName}</p>
                        <p className="text-xs text-zinc-400 mb-3">@{otherHandle}</p>
                        <p className="text-xs text-zinc-500 max-w-xs">
                            Send a real-time message directly to {otherName}.
                        </p>
                    </div>
                ) : (
                    messages.map((msg) => {
                        const isMine = msg.senderUid === user.uid;
                        return (
                            <div
                                key={msg.id}
                                className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                            >
                                <div className={`flex items-end gap-2 max-w-[82%] ${isMine ? 'flex-row-reverse' : ''}`}>
                                    {!isMine && (
                                        <img
                                            src={msg.senderAvatar || otherAvatar}
                                            alt={msg.senderName}
                                            className="w-7 h-7 rounded-full object-cover flex-shrink-0"
                                        />
                                    )}
                                    <div
                                        className={`rounded-2xl px-4 py-2 text-sm break-words ${
                                            isMine
                                                ? 'bg-blue-500 text-white rounded-br-sm'
                                                : 'bg-zinc-800 text-zinc-100 rounded-bl-sm'
                                        }`}
                                    >
                                        {msg.text}
                                    </div>
                                </div>
                                <span className="text-[10px] text-zinc-600 mt-1 px-1">
                                    W{msg.gameWeek}, {msg.gameYear}
                                </span>
                            </div>
                        );
                    })
                )}
                <div ref={messagesEndRef} />
            </main>

            <footer className="sticky bottom-0 bg-black p-3 border-t border-zinc-800">
                <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                    <input
                        type="text"
                        value={messageText}
                        onChange={(e) => setMessageText(e.target.value)}
                        placeholder={`Message @${otherHandle}`}
                        className="flex-grow bg-zinc-900 border border-zinc-700 rounded-full h-10 px-4 text-sm focus:outline-none focus:border-blue-500"
                    />
                    <button
                        type="submit"
                        disabled={isSending || !messageText.trim()}
                        className="px-4 h-10 bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-white font-bold text-sm rounded-full transition-colors"
                    >
                        Send
                    </button>
                </form>
            </footer>
        </div>
    );
};

export default XChatView;