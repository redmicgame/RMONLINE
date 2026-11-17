import React, { useState, useRef, useMemo, useEffect } from "react";
import { useGame, formatNumber } from "../context/GameContext";
import { useFirebase } from "../context/FirebaseContext";
import { useOnline, OnlineArtist, OnlineXPost } from "../context/OnlineContext";
import XIcon from "./icons/XIcon";
import HomeIcon from "./icons/HomeIcon";
import SearchIcon from "./icons/SearchIcon";
import EnvelopeIcon from "./icons/EnvelopeIcon";
import PlusIcon from "./icons/PlusIcon";
import { XPost, XUser } from "../types";
import { getDateFromGameWeek } from "./CalendarDatePicker";
import CommentIcon from "./icons/CommentIcon";
import RetweetIcon from "./icons/RetweetIcon";
import HeartIcon from "./icons/HeartIcon";
import UserVerifiedBadge from "./icons/UserVerifiedBadge";
import ChartBarIcon from "./icons/ChartBarIcon";
import UserGroupIcon from "./icons/UserGroupIcon";
import ArrowLeftIcon from "./icons/ArrowLeftIcon";
import ImageIcon from "./icons/ImageIcon";
import ConfirmationModal from "./ConfirmationModal";
import XPremiumModal from "./XPremiumModal";
import { SpotifySnapshotCard } from "./SpotifySnapshotCard";
import { ForYourConsiderationBanner } from "./ForYourConsiderationBanner";
import { GrammyWinnerCard } from "./GrammyWinnerCard";
import { compressImageForCloud } from "../utils/imageCompression";

const DEFAULT_AVATAR = "https://ui-avatars.com/api/?background=27272a&color=fff&name=Artist";

const renderContentWithHighlights = (text: string) => {
  return text.split(/(\$[a-zA-Z0-9]+|@[a-zA-Z0-9_]+|#[a-zA-Z0-9_]+)/g).map((part, i) => {
    if (part.startsWith("$")) {
      return <span key={i} className="text-purple-400 font-semibold">{part}</span>;
    }
    if (part.startsWith("@") || part.startsWith("#")) {
      return <span key={i} className="text-[#1D9BF0]">{part}</span>;
    }
    return part;
  });
};

export const Post: React.FC<{
  post: XPost & { ownerUid?: string };
  author: XUser | undefined;
  onQuote?: (post: XPost) => void;
  onQuoteHold?: (post: XPost) => void;
}> = ({ post, author, onQuote }) => {
  const { dispatch, activeArtistData, gameState, activeArtist } = useGame();
  const { user } = useFirebase();
  const {
    onlineArtists,
    onlineXPosts,
    createOnlineXPost,
    toggleLikeOnlineXPost,
    toggleRepostOnlineXPost,
    deleteOnlineXPost,
    setSelectedOnlineArtistUid,
  } = useOnline();

  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [showPostMenu, setShowPostMenu] = useState(false);
  const [showRepostMenu, setShowRepostMenu] = useState(false);
  const [likedLocal, setLikedLocal] = useState(false);
  const [repostedLocal, setRepostedLocal] = useState(false);

  if (!author) return null;

  const isOnlinePost = post.id.startsWith("xp_") || Boolean(post.ownerUid);
  const isOwner = Boolean(
    (user?.uid && (post.ownerUid === user.uid || post.authorId === user.uid)) ||
      author.isPlayer
  );

  const realReplies = useMemo(() => {
    return onlineXPosts
      .filter((r) => r.replyToId === post.id)
      .sort((a, b) => (a.createdAtMs || 0) - (b.createdAtMs || 0));
  }, [onlineXPosts, post.id]);

  const timeAgo = (postDate?: { week: number; year: number; day?: number }) => {
    if (!postDate) return "";
    const d = getDateFromGameWeek(postDate.year, postDate.week, postDate.day || 1);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const handleViewProfile = () => {
    const uid = post.ownerUid || onlineArtists.find((a) => a.uid === author.id)?.uid;
    if (uid) {
      setSelectedOnlineArtistUid(uid);
      dispatch({ type: "VIEW_X_PROFILE", payload: uid });
    } else if (author.isPlayer) {
      if (user?.uid) setSelectedOnlineArtistUid(user.uid);
      dispatch({ type: "VIEW_X_PROFILE", payload: author.id });
    }
  };

  const playerUser = activeArtistData?.selectedPlayerXUserId
    ? activeArtistData.xUsers.find((u) => u.id === activeArtistData.selectedPlayerXUserId)
    : activeArtistData?.xUsers.find((u) => u.isPlayer);

  const handleReply = async () => {
    if (!commentText.trim() || !playerUser) return;
    const text = commentText.trim();
    setCommentText("");
    await createOnlineXPost({
      content: text,
      replyToId: post.id,
      authorId: playerUser.id,
      authorName: playerUser.name || activeArtist?.name || "Artist",
      authorUsername: playerUser.username || "artist",
      authorAvatar: playerUser.avatar || activeArtist?.image || DEFAULT_AVATAR,
      authorVerified: Boolean(playerUser.isVerified),
      authorGoldVerified: playerUser.isVerified === "gold",
      gameYear: gameState.date.year,
      gameWeek: gameState.date.week,
    });
  };

  const handleLike = async () => {
    const next = !likedLocal;
    setLikedLocal(next);
    if (isOnlinePost) {
      await toggleLikeOnlineXPost(post.id, !next);
    }
  };

  const handleRepost = async () => {
    const next = !repostedLocal;
    setRepostedLocal(next);
    setShowRepostMenu(false);
    if (isOnlinePost) {
      await toggleRepostOnlineXPost(post.id, !next);
    }
  };

  const handleDelete = async () => {
    setShowPostMenu(false);
    if (isOnlinePost) {
      await deleteOnlineXPost(post.id);
    } else {
      dispatch({ type: "DELETE_X_POST", payload: { postId: post.id } });
    }
  };

  const isSnapshotPost = post.image && post.image.startsWith("snapshot:");
  const isFycPost = post.image && post.image.startsWith("fyc:");
  const isGrammyWinnerPost = post.image && post.image.startsWith("grammyWinner:");

  return (
    <div className="border-b border-zinc-800 relative">
      <div className="flex gap-3 p-3.5">
        <button onClick={handleViewProfile} className="flex-shrink-0 self-start">
          <img
            src={author.avatar || DEFAULT_AVATAR}
            alt={author.name}
            className="w-10 h-10 rounded-full object-cover bg-zinc-800"
          />
        </button>

        <div className="w-full min-w-0">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-1 min-w-0 truncate">
              <button
                onClick={handleViewProfile}
                className="font-bold hover:underline cursor-pointer truncate"
              >
                {author.name}
              </button>
              <UserVerifiedBadge
                isVerified={author.isVerified}
                className="w-4 h-4 flex-shrink-0"
              />
              <span className="text-zinc-500 truncate">@{author.username}</span>
              <span className="text-zinc-500 flex-shrink-0">·</span>
              <span className="text-zinc-500 flex-shrink-0">{timeAgo(post.date)}</span>
            </div>

            {isOwner && (
              <div className="relative flex-shrink-0 ml-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowPostMenu(!showPostMenu);
                  }}
                  className="text-zinc-500 hover:text-white p-1 rounded-full hover:bg-zinc-800 transition-colors"
                >
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                  </svg>
                </button>
                {showPostMenu && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 top-6 w-40 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl py-1 z-40 text-sm font-medium"
                  >
                    <button
                      onClick={handleDelete}
                      className="w-full text-left px-4 py-2 hover:bg-zinc-800 text-red-500"
                    >
                      Delete post
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <p className="text-white whitespace-pre-wrap break-words mt-1 text-[15px]">
            {renderContentWithHighlights(post.content)}
          </p>

          {isSnapshotPost ? (
            <SpotifySnapshotCard dataString={post.image!} style={gameState.spotifySnapshotStyle} />
          ) : isFycPost ? (
            <div className="mt-2">
              <ForYourConsiderationBanner dataString={post.image!} />
            </div>
          ) : isGrammyWinnerPost ? (
            <GrammyWinnerCard dataString={post.image!} />
          ) : post.image && !post.image.startsWith("chart:") && !post.image.startsWith("leaderboard:") ? (
            <img
              src={post.image}
              alt="Post media"
              className="mt-2 rounded-xl border border-zinc-800 max-w-full max-h-96 object-cover"
            />
          ) : null}

          {post.quoteOf && (
            <div className="mt-2 border border-zinc-800 rounded-xl p-3 bg-zinc-950/50">
              <div className="flex items-center gap-1.5 text-xs mb-1">
                <span className="font-bold text-white">
                  {(post.quoteOf as any).authorName || "Artist"}
                </span>
                <span className="text-zinc-500">
                  @{(post.quoteOf as any).authorUsername || "artist"}
                </span>
              </div>
              <p className="text-sm text-zinc-200 whitespace-pre-wrap">
                {post.quoteOf.content}
              </p>
            </div>
          )}

          <div className="flex justify-between items-center mt-3 text-zinc-500 max-w-sm">
            <button
              onClick={() => setShowComments(!showComments)}
              className="flex items-center gap-1 group hover:text-blue-500"
            >
              <CommentIcon className="w-4 h-4" />
              <span className="text-xs">{realReplies.length}</span>
            </button>

            <div className="relative flex items-center gap-1">
              <button
                onClick={() => setShowRepostMenu(!showRepostMenu)}
                className={`flex items-center gap-1 hover:text-green-500 ${
                  repostedLocal ? "text-green-500" : ""
                }`}
              >
                <RetweetIcon className="w-4 h-4" />
                <span className="text-xs">{formatNumber(post.retweets || 0)}</span>
              </button>
              {showRepostMenu && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute left-0 bottom-7 w-40 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl py-1 z-40 text-sm font-semibold"
                >
                  <button
                    onClick={handleRepost}
                    className="w-full text-left px-4 py-2 hover:bg-zinc-800 text-white"
                  >
                    {repostedLocal ? "Undo repost" : "Repost"}
                  </button>
                  {onQuote && (
                    <button
                      onClick={() => {
                        setShowRepostMenu(false);
                        onQuote(post);
                      }}
                      className="w-full text-left px-4 py-2 hover:bg-zinc-800 text-white"
                    >
                      Quote
                    </button>
                  )}
                </div>
              )}
            </div>

            <button
              onClick={handleLike}
              className={`flex items-center gap-1 hover:text-pink-500 ${
                likedLocal ? "text-pink-500" : ""
              }`}
            >
              <HeartIcon className="w-4 h-4" />
              <span className="text-xs">{formatNumber(post.likes || 0)}</span>
            </button>

            <div className="flex items-center gap-1">
              <ChartBarIcon className="w-4 h-4" />
              <span className="text-xs">{formatNumber(post.views || 1)}</span>
            </div>
          </div>

          {showComments && (
            <div className="mt-3 pt-3 border-t border-zinc-800 space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Post your reply"
                  className="flex-1 bg-zinc-900 border border-zinc-800 rounded-full px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500"
                />
                <button
                  onClick={handleReply}
                  disabled={!commentText.trim()}
                  className="bg-blue-500 text-white px-3.5 py-1.5 text-xs font-bold rounded-full disabled:opacity-40"
                >
                  Reply
                </button>
              </div>

              {realReplies.length === 0 ? (
                <p className="text-xs text-zinc-500">No replies yet. Be the first real artist to reply.</p>
              ) : (
                realReplies.map((r) => (
                  <div key={r.id} className="flex gap-2 text-sm pt-2 border-t border-zinc-900">
                    <img
                      src={r.authorAvatar || DEFAULT_AVATAR}
                      alt={r.authorName}
                      className="w-7 h-7 rounded-full object-cover flex-shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1 text-xs">
                        <span className="font-bold text-white">{r.authorName}</span>
                        <span className="text-zinc-500">@{r.authorUsername}</span>
                      </div>
                      <p className="text-zinc-200 text-sm mt-0.5 break-words">{r.content}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const ComposeXPostModal: React.FC<{
  user: XUser;
  onClose: () => void;
  onPost: (payload: {
    content: string;
    image?: string;
    postType: "normal" | "fanWar" | "push" | "announce" | "endorse" | "market_crypto";
    targetId?: string;
    songId?: string;
    quoteOf?: XPost;
    announceItem?: any;
  }) => void;
  quotePost?: XPost;
}> = ({ user, onClose, onPost, quotePost }) => {
  const { gameState, activeArtistData } = useGame();
  const { user: authUser } = useFirebase();
  const { onlineArtists } = useOnline();

  const [content, setContent] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [postType, setPostType] = useState<"normal" | "fanWar" | "push" | "market_crypto">("normal");
  const [targetId, setTargetId] = useState<string>("");
  const [songId, setSongId] = useState<string>("");
  const imageInputRef = useRef<HTMLInputElement>(null);
  const MAX_CHARS = 280;

  const rivalOnlineArtists = useMemo(() => {
    return onlineArtists
      .filter((a) => a.uid !== authUser?.uid)
      .sort((a, b) => (b.followers || 0) - (a.followers || 0));
  }, [onlineArtists, authUser?.uid]);

  const playerSongs = useMemo(() => {
    return (activeArtistData?.songs || []).filter((s) => s.isReleased);
  }, [activeArtistData]);

  useEffect(() => {
    setTargetId("");
    setSongId("");
    if (postType === "fanWar" && rivalOnlineArtists.length > 0) {
      setTargetId(rivalOnlineArtists[0].name);
      setContent(`@${rivalOnlineArtists[0].handle} charts aren't ready for this era 👀`);
    } else if (postType === "push" && playerSongs.length > 0) {
      setSongId(playerSongs[0].id);
      setContent(`Push ${playerSongs[0].title} on iTunes & Spotify! Link in bio 🔥`);
    } else {
      setContent("");
    }
  }, [postType]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const compressed = await compressImageForCloud(reader.result as string, 600, 0.72);
        setImage(compressed);
      };
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const handlePost = () => {
    if (!content.trim() && !image && !quotePost) return;
    onPost({
      content: content.trim(),
      image: image || undefined,
      postType,
      targetId: postType === "fanWar" ? targetId : undefined,
      songId: postType === "push" ? songId : undefined,
      quoteOf: quotePost,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex justify-center items-start pt-16 p-4" onClick={onClose}>
      <div className="bg-black border border-zinc-800 rounded-2xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="p-2 border-b border-zinc-800 flex items-center justify-between">
          <button onClick={onClose} className="p-2 rounded-full hover:bg-zinc-800">
            <ArrowLeftIcon className="w-5 h-5" />
          </button>
          <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
            New Online Post
          </span>
          <div className="w-9" />
        </div>

        <div className="p-4 space-y-3">
          <div className="flex gap-3">
            <img src={user.avatar || DEFAULT_AVATAR} alt={user.name} className="w-10 h-10 rounded-full object-cover" />
            <div className="w-full">
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="What is happening?!"
                className="w-full bg-transparent text-lg focus:outline-none resize-none"
                rows={4}
                maxLength={MAX_CHARS}
              />
              {image && (
                <div className="relative mt-2">
                  <img src={image} className="rounded-xl max-h-60 object-cover" />
                  <button
                    onClick={() => setImage(null)}
                    className="absolute top-2 right-2 bg-black/80 text-white rounded-full w-6 h-6 text-sm font-bold"
                  >
                    ✕
                  </button>
                </div>
              )}
              {quotePost && (
                <div className="mt-2 border border-zinc-800 rounded-xl p-3 text-sm text-zinc-300">
                  {quotePost.content}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2">
            <button
              onClick={() => setPostType("normal")}
              className={`py-2 text-xs font-semibold rounded-md ${postType === "normal" ? "bg-blue-500 text-white" : "bg-zinc-800"}`}
            >
              Normal
            </button>
            <button
              onClick={() => setPostType("fanWar")}
              disabled={rivalOnlineArtists.length === 0}
              className={`py-2 text-xs font-semibold rounded-md ${postType === "fanWar" ? "bg-red-500 text-white" : "bg-zinc-800"} disabled:opacity-40`}
            >
              Call Out
            </button>
            <button
              onClick={() => setPostType("push")}
              disabled={playerSongs.length === 0}
              className={`py-2 text-xs font-semibold rounded-md ${postType === "push" ? "bg-green-600 text-white" : "bg-zinc-800"} disabled:opacity-40`}
            >
              Push Song
            </button>
            <button
              onClick={() => setPostType("market_crypto")}
              disabled={!activeArtistData?.cryptoCoin}
              className={`py-2 text-xs font-semibold rounded-md ${postType === "market_crypto" ? "bg-amber-500 text-white" : "bg-zinc-800"} disabled:opacity-40`}
            >
              Market Coin
            </button>
          </div>

          {postType === "fanWar" && rivalOnlineArtists.length > 0 && (
            <select
              value={targetId}
              onChange={(e) => {
                setTargetId(e.target.value);
                const found = rivalOnlineArtists.find((a) => a.name === e.target.value);
                if (found) setContent(`@${found.handle} charts aren't ready for this era 👀`);
              }}
              className="w-full bg-zinc-900 border border-zinc-700 p-2 rounded-lg text-sm"
            >
              {rivalOnlineArtists.map((a) => (
                <option key={a.uid} value={a.name}>
                  @{a.handle} ({a.name})
                </option>
              ))}
            </select>
          )}

          {postType === "push" && playerSongs.length > 0 && (
            <select
              value={songId}
              onChange={(e) => setSongId(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 p-2 rounded-lg text-sm"
            >
              {playerSongs.map((song) => (
                <option key={song.id} value={song.id}>
                  Song: {song.title}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="p-4 flex justify-between items-center border-t border-zinc-800">
          <div>
            <input
              type="file"
              ref={imageInputRef}
              onChange={handleImageUpload}
              className="hidden"
              accept="image/*"
            />
            <button
              onClick={() => imageInputRef.current?.click()}
              className="p-2 text-blue-400 hover:bg-blue-500/10 rounded-full"
            >
              <ImageIcon className="w-6 h-6" />
            </button>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-500">{content.length}/{MAX_CHARS}</span>
            <button
              onClick={handlePost}
              disabled={!content.trim() && !image}
              className="bg-blue-500 hover:bg-blue-600 text-white font-bold px-5 py-2 rounded-full disabled:opacity-40"
            >
              Post
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const FeedView: React.FC<{
  onQuote?: (post: XPost) => void;
}> = ({ onQuote }) => {
  const { dispatch, activeArtistData, gameState } = useGame();
  const { user } = useFirebase();
  const { onlineArtists, onlineXPosts, isFollowingUid, setSelectedOnlineArtistUid } = useOnline();

  const [feedMode, setFeedMode] = useState<"foryou" | "following">("foryou");
  const [postsToShow, setPostsToShow] = useState(25);

  const authorMap = useMemo(() => {
    const map = new Map<string, OnlineArtist>();
    onlineArtists.forEach((a) => map.set(a.uid, a));
    return map;
  }, [onlineArtists]);

  const topLevelPosts = useMemo(() => {
    const base = onlineXPosts.filter((p) => !p.replyToId);
    const filtered =
      feedMode === "following"
        ? base.filter((p) => p.ownerUid === user?.uid || isFollowingUid(p.ownerUid))
        : base;
    return filtered;
  }, [onlineXPosts, feedMode, user?.uid, isFollowingUid]);

  const displayed = topLevelPosts.slice(0, postsToShow);

  const openOnlineProfile = (uid: string) => {
    setSelectedOnlineArtistUid(uid);
    dispatch({ type: "VIEW_X_PROFILE", payload: uid });
  };

  return (
    <div className="h-full overflow-y-auto pb-32">
      <div className="flex border-b border-zinc-800 sticky top-0 bg-black/90 backdrop-blur z-10">
        <button
          onClick={() => setFeedMode("foryou")}
          className={`flex-1 py-3 text-sm font-bold relative ${feedMode === "foryou" ? "text-white" : "text-zinc-500"}`}
        >
          For you
          {feedMode === "foryou" && <div className="absolute bottom-0 left-12 right-12 h-1 bg-blue-500 rounded-full" />}
        </button>
        <button
          onClick={() => setFeedMode("following")}
          className={`flex-1 py-3 text-sm font-bold relative ${feedMode === "following" ? "text-white" : "text-zinc-500"}`}
        >
          Following
          {feedMode === "following" && <div className="absolute bottom-0 left-12 right-12 h-1 bg-blue-500 rounded-full" />}
        </button>
      </div>

      {/* Live Online Artists Bar */}
      {onlineArtists.length > 0 && (
        <div className="flex gap-3 overflow-x-auto p-3 border-b border-zinc-800 scrollbar-hide">
          {onlineArtists.slice(0, 20).map((oa) => (
            <button
              key={oa.uid}
              onClick={() => openOnlineProfile(oa.uid)}
              className="flex flex-col items-center gap-1 flex-shrink-0 w-16"
            >
              <div className="w-14 h-14 rounded-full border-2 border-blue-500 p-[2px]">
                <img
                  src={oa.avatar || DEFAULT_AVATAR}
                  alt={oa.name}
                  className="w-full h-full rounded-full object-cover"
                />
              </div>
              <span className="text-[11px] text-zinc-300 w-16 truncate text-center font-medium">
                {oa.name}
              </span>
            </button>
          ))}
        </div>
      )}

      {displayed.length === 0 ? (
        <div className="p-10 text-center text-zinc-500 text-sm">
          {feedMode === "following"
            ? "Follow other online artists in Explore to see their posts here."
            : "No posts yet. Tap + to publish the first online post!"}
        </div>
      ) : (
        displayed.map((p) => {
          const oa = authorMap.get(p.ownerUid);
          const author: XUser = {
            id: p.ownerUid,
            name: oa?.name || p.authorName,
            username: oa?.handle || p.authorUsername,
            avatar: oa?.avatar || p.authorAvatar || DEFAULT_AVATAR,
            isVerified: oa?.isVerified ?? p.authorVerified,
            isPlayer: p.ownerUid === user?.uid,
          };
          const mappedPost: XPost & { ownerUid?: string } = {
            id: p.id,
            ownerUid: p.ownerUid,
            authorId: p.ownerUid,
            content: p.content,
            image: p.image,
            likes: p.likes || 0,
            retweets: p.retweets || 0,
            views: p.views || 1,
            date: { week: p.gameWeek || gameState.date.week, year: p.gameYear || gameState.date.year },
            quoteOf: p.quoteOfId
              ? ({
                  id: p.quoteOfId,
                  authorId: p.quoteOfId,
                  authorName: p.quoteAuthorName,
                  authorUsername: p.quoteAuthorUsername,
                  content: p.quoteContent || "",
                  likes: 0,
                  retweets: 0,
                  views: 0,
                  date: { week: p.gameWeek || 1, year: p.gameYear || 2018 },
                } as any)
              : undefined,
          };
          return <Post key={p.id} post={mappedPost} author={author} onQuote={onQuote} />;
        })
      )}

      {postsToShow < topLevelPosts.length && (
        <div className="p-4 flex justify-center">
          <button
            onClick={() => setPostsToShow((c) => c + 25)}
            className="px-6 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-full font-bold text-sm"
          >
            Load More
          </button>
        </div>
      )}
    </div>
  );
};

const ExploreView: React.FC<{ onQuote?: (post: XPost) => void }> = ({ onQuote }) => {
  const { dispatch, activeArtistData, activeArtist, gameState } = useGame();
  const { user } = useFirebase();
  const {
    onlineArtists,
    onlineSongs,
    onlineXPosts,
    isFollowingUid,
    toggleFollowOnlineArtist,
    getFollowerCountDelta,
    startOrOpenOnlineDM,
    setSelectedOnlineArtistUid,
  } = useOnline();

  const [searchQuery, setSearchQuery] = useState("");

  const q = searchQuery.trim().toLowerCase();
  const matchingArtists = useMemo(() => {
    const sorted = [...onlineArtists].sort(
      (a, b) => (b.monthlyListeners || 0) - (a.monthlyListeners || 0)
    );
    if (!q) return sorted;
    return sorted.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.handle.toLowerCase().includes(q) ||
        a.fandomName.toLowerCase().includes(q)
    );
  }, [onlineArtists, q]);

  const matchingPosts = useMemo(() => {
    if (!q) return [];
    return onlineXPosts.filter((p) => p.content.toLowerCase().includes(q)).slice(0, 20);
  }, [onlineXPosts, q]);

  const trendingSongs = useMemo(() => {
    return [...onlineSongs]
      .filter((s) => s.isAvailableOnStreaming !== false)
      .sort((a, b) => (b.hot100Points || 0) - (a.hot100Points || 0))
      .slice(0, 5);
  }, [onlineSongs]);

  const openProfile = (uid: string) => {
    setSelectedOnlineArtistUid(uid);
    dispatch({ type: "VIEW_X_PROFILE", payload: uid });
  };

  const openDM = async (target: OnlineArtist) => {
    if (!user) return;
    const myXUser = activeArtistData?.selectedPlayerXUserId
      ? activeArtistData.xUsers?.find((u) => u.id === activeArtistData.selectedPlayerXUserId)
      : activeArtistData?.xUsers?.find((u) => u.isPlayer);
    const myArtist = onlineArtists.find((a) => a.uid === user.uid) || {
      uid: user.uid,
      artistId: activeArtist?.id || user.uid,
      name: activeArtist?.name || "Artist",
      handle: myXUser?.username || "artist",
      avatar: myXUser?.avatar || activeArtist?.image || DEFAULT_AVATAR,
      country: "US",
      careerMode: (gameState.careerMode || "solo") as "solo" | "group",
      fandomName: activeArtist?.fandomName || "Fans",
      followers: 0,
      monthlyListeners: activeArtistData?.monthlyListeners || 0,
      totalStreams: 0,
      youtubeSubscribers: activeArtistData?.youtubeSubscribers || 0,
      popularity: activeArtistData?.popularity || 0,
      hype: activeArtistData?.hype || 0,
      lastActiveAtMs: Date.now(),
    };
    const chatId = await startOrOpenOnlineDM(target, myArtist);
    if (chatId) dispatch({ type: "VIEW_X_CHAT", payload: chatId });
  };

  return (
    <div className="h-full overflow-y-auto pb-32">
      <div className="p-3 sticky top-0 bg-black/90 backdrop-blur z-10 border-b border-zinc-800">
        <input
          type="text"
          placeholder="Search online artists & posts"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-700 focus:border-blue-500 rounded-full px-4 py-2 text-sm focus:outline-none"
        />
      </div>

      {!q && trendingSongs.length > 0 && (
        <div className="p-3 border-b border-zinc-800">
          <h2 className="text-base font-black mb-2">Trending Songs (Live Charts)</h2>
          <div className="space-y-2">
            {trendingSongs.map((s, idx) => (
              <div key={s.id} className="flex items-center justify-between bg-zinc-950 border border-zinc-800/80 rounded-xl p-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="font-black text-zinc-500 w-5 text-center">{idx + 1}</span>
                  <img src={s.coverArt || DEFAULT_AVATAR} alt={s.title} className="w-9 h-9 rounded object-cover" />
                  <div className="min-w-0">
                    <p className="font-bold text-sm truncate">{s.title}</p>
                    <p className="text-xs text-zinc-400 truncate">{s.artistName}</p>
                  </div>
                </div>
                <span className="text-xs font-mono text-emerald-400 flex-shrink-0 ml-2">
                  {formatNumber(s.weeklyStreams)} streams
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="p-3">
        <h2 className="text-base font-black mb-3">
          {q ? `Artists matching "${searchQuery}"` : `Online Artists (${matchingArtists.length})`}
        </h2>
        <div className="space-y-2">
          {matchingArtists.map((artist) => {
            const isMe = artist.uid === user?.uid;
            const following = isFollowingUid(artist.uid);
            return (
              <div
                key={artist.uid}
                className="flex items-center justify-between gap-3 p-3 rounded-xl bg-zinc-950 border border-zinc-800 hover:border-zinc-700 transition-colors"
              >
                <button
                  onClick={() => openProfile(artist.uid)}
                  className="flex items-center gap-3 min-w-0 flex-1 text-left"
                >
                  <img
                    src={artist.avatar || DEFAULT_AVATAR}
                    alt={artist.name}
                    className="w-11 h-11 rounded-full object-cover flex-shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="font-bold text-sm truncate">{artist.name}</span>
                      <UserVerifiedBadge isVerified={artist.isVerified} className="w-4 h-4 flex-shrink-0" />
                    </div>
                    <p className="text-xs text-zinc-400 truncate">
                      @{artist.handle} • {formatNumber((artist.followers || 0) + getFollowerCountDelta(artist.uid))} followers
                    </p>
                  </div>
                </button>
                {!isMe && (
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => openDM(artist)}
                      className="px-3 py-1.5 rounded-full text-xs font-bold border border-zinc-700 hover:bg-zinc-800"
                    >
                      DM
                    </button>
                    <button
                      onClick={() => toggleFollowOnlineArtist(artist.uid)}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors ${
                        following ? "border border-zinc-600 text-white" : "bg-white text-black"
                      }`}
                    >
                      {following ? "Following" : "Follow"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {matchingArtists.length === 0 && (
            <p className="text-sm text-zinc-500 text-center py-6">No matching online artists found.</p>
          )}
        </div>
      </div>

      {matchingPosts.length > 0 && (
        <div className="border-t border-zinc-800 mt-2">
          <h3 className="font-bold p-3 text-base">Matching Posts</h3>
          {matchingPosts.map((p) => (
            <Post
              key={p.id}
              post={{
                id: p.id,
                authorId: p.ownerUid,
                content: p.content,
                image: p.image,
                likes: p.likes || 0,
                retweets: p.retweets || 0,
                views: p.views || 1,
                date: { week: p.gameWeek || 1, year: p.gameYear || 2018 },
              }}
              author={{
                id: p.ownerUid,
                name: p.authorName,
                username: p.authorUsername,
                avatar: p.authorAvatar || DEFAULT_AVATAR,
                isVerified: p.authorVerified,
                isPlayer: p.ownerUid === user?.uid,
              }}
              onQuote={onQuote}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const MessagesView: React.FC = () => {
  const { dispatch, activeArtistData, activeArtist, gameState } = useGame();
  const { user } = useFirebase();
  const { onlineChats, onlineArtists, startOrOpenOnlineDM } = useOnline();
  const [search, setSearch] = useState("");
  const [showNewDm, setShowNewDm] = useState(false);

  const otherArtists = useMemo(() => {
    return onlineArtists
      .filter((a) => a.uid !== user?.uid)
      .filter(
        (a) =>
          !search.trim() ||
          a.name.toLowerCase().includes(search.toLowerCase()) ||
          a.handle.toLowerCase().includes(search.toLowerCase())
      );
  }, [onlineArtists, user?.uid, search]);

  const handleStartDM = async (target: OnlineArtist) => {
    if (!user) return;
    const myXUser = activeArtistData?.selectedPlayerXUserId
      ? activeArtistData.xUsers?.find((u) => u.id === activeArtistData.selectedPlayerXUserId)
      : activeArtistData?.xUsers?.find((u) => u.isPlayer);
    const myOnline = onlineArtists.find((a) => a.uid === user.uid) || {
      uid: user.uid,
      artistId: activeArtist?.id || user.uid,
      name: activeArtist?.name || "Artist",
      handle: myXUser?.username || "artist",
      avatar: myXUser?.avatar || activeArtist?.image || DEFAULT_AVATAR,
      country: "US",
      careerMode: (gameState.careerMode || "solo") as "solo" | "group",
      fandomName: activeArtist?.fandomName || "Fans",
      followers: 0,
      monthlyListeners: activeArtistData?.monthlyListeners || 0,
      totalStreams: 0,
      youtubeSubscribers: activeArtistData?.youtubeSubscribers || 0,
      popularity: activeArtistData?.popularity || 0,
      hype: activeArtistData?.hype || 0,
      lastActiveAtMs: Date.now(),
    };
    const chatId = await startOrOpenOnlineDM(target, myOnline);
    if (chatId) {
      setShowNewDm(false);
      dispatch({ type: "VIEW_X_CHAT", payload: chatId });
    }
  };

  return (
    <div className="text-white h-full overflow-y-auto pb-32">
      <div className="p-3 border-b border-zinc-800 flex items-center justify-between">
        <h1 className="text-xl font-bold">Direct Messages</h1>
        <button
          onClick={() => setShowNewDm(!showNewDm)}
          className="px-3.5 py-1.5 bg-blue-500 hover:bg-blue-600 rounded-full text-xs font-bold"
        >
          {showNewDm ? "Back to Inbox" : "+ New Message"}
        </button>
      </div>

      <div className="p-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={showNewDm ? "Find an online artist to message" : "Search conversations"}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-full px-4 py-2 text-sm focus:outline-none focus:border-blue-500"
        />
      </div>

      {showNewDm ? (
        <div className="divide-y divide-zinc-900">
          {otherArtists.length === 0 ? (
            <p className="text-center text-zinc-500 text-sm py-8">
              No other online artists available yet.
            </p>
          ) : (
            otherArtists.map((artist) => (
              <button
                key={artist.uid}
                onClick={() => handleStartDM(artist)}
                className="w-full flex items-center justify-between gap-3 p-3.5 hover:bg-zinc-900/70 transition-colors text-left"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={artist.avatar || DEFAULT_AVATAR}
                    alt={artist.name}
                    className="w-11 h-11 rounded-full object-cover flex-shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="font-bold text-sm truncate">{artist.name}</p>
                    <p className="text-xs text-zinc-400 truncate">@{artist.handle}</p>
                  </div>
                </div>
                <span className="text-xs font-bold text-blue-400">Message</span>
              </button>
            ))
          )}
        </div>
      ) : (
        <div className="divide-y divide-zinc-900">
          {onlineChats
            .filter((chat) => {
              if (!search.trim()) return true;
              const otherUid = chat.participantUids.find((u) => u !== user?.uid) || "";
              const name = (chat.participantNames?.[otherUid] || "").toLowerCase();
              return name.includes(search.toLowerCase());
            })
            .map((chat) => {
              const otherUid = chat.participantUids.find((u) => u !== user?.uid) || "";
              const oa = onlineArtists.find((a) => a.uid === otherUid);
              const name = oa?.name || chat.participantNames?.[otherUid] || "Online Artist";
              const avatar = oa?.avatar || chat.participantAvatars?.[otherUid] || DEFAULT_AVATAR;
              return (
                <button
                  key={chat.id}
                  onClick={() => dispatch({ type: "VIEW_X_CHAT", payload: chat.id })}
                  className="w-full flex gap-3 p-3.5 hover:bg-zinc-900/70 transition-colors"
                >
                  <img
                    src={avatar}
                    alt={name}
                    className="w-12 h-12 rounded-full flex-shrink-0 object-cover"
                  />
                  <div className="w-full overflow-hidden text-left">
                    <div className="flex justify-between items-baseline">
                      <p className="font-bold truncate">{name}</p>
                    </div>
                    <p className="text-sm text-zinc-400 truncate">
                      {chat.lastMessageText || "Tap to start chatting"}
                    </p>
                  </div>
                </button>
              );
            })}

          {onlineChats.length === 0 && (
            <div className="text-center py-10 px-6">
              <p className="text-zinc-400 text-sm mb-3">No direct messages yet.</p>
              <button
                onClick={() => setShowNewDm(true)}
                className="px-5 py-2 bg-blue-500 rounded-full text-sm font-bold"
              >
                Message an Online Artist
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const AccountsView: React.FC = () => {
  const { dispatch, activeArtistData } = useGame();
  const { user } = useFirebase();
  const { setSelectedOnlineArtistUid } = useOnline();
  if (!activeArtistData) return null;

  const playerAccounts = activeArtistData.xUsers.filter((u) => u.isPlayer);
  const activePlayerUser =
    playerAccounts.find((u) => u.id === activeArtistData.selectedPlayerXUserId) ||
    playerAccounts[0];

  return (
    <div className="text-white p-4 pb-32">
      <h1 className="text-xl font-bold mb-4">Your X Profile</h1>
      <div className="space-y-3">
        {playerAccounts.map((account) => (
          <div
            key={account.id}
            onClick={() => {
              if (user?.uid) setSelectedOnlineArtistUid(user.uid);
              dispatch({ type: "VIEW_X_PROFILE", payload: user?.uid || account.id });
            }}
            className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer ${
              activePlayerUser?.id === account.id
                ? "border-blue-500 bg-blue-500/10"
                : "border-zinc-800 bg-zinc-900"
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <img
                src={account.avatar || DEFAULT_AVATAR}
                alt={account.name}
                className="w-12 h-12 rounded-full object-cover"
              />
              <div className="min-w-0">
                <h3 className="font-bold flex items-center gap-1 truncate">
                  {account.name}
                  <UserVerifiedBadge isVerified={account.isVerified} className="w-4 h-4 flex-shrink-0" />
                </h3>
                <p className="text-zinc-400 text-sm truncate">@{account.username}</p>
              </div>
            </div>
            <span className="text-xs font-bold text-blue-400 flex-shrink-0">Open Profile →</span>
          </div>
        ))}
      </div>
    </div>
  );
};

type XViewTab = "For you" | "Explore" | "Messages" | "Accounts";

const XView: React.FC = () => {
  const { dispatch, activeArtistData, activeArtist, gameState } = useGame();
  const { createOnlineXPost } = useOnline();
  const [activeTab, setActiveTab] = useState<XViewTab>("For you");
  const [isComposeModalOpen, setIsComposeModalOpen] = useState(false);
  const [quotePostTarget, setQuotePostTarget] = useState<XPost | null>(null);
  const [showAppealConfirm, setShowAppealConfirm] = useState(false);
  const [showPremiumModal, setShowPremiumModal] = useState(false);

  if (!activeArtistData) return null;
  const { xUsers, xSuspensionStatus, selectedPlayerXUserId } = activeArtistData;
  const playerUser = selectedPlayerXUserId
    ? xUsers.find((u) => u.id === selectedPlayerXUserId)
    : xUsers.find((u) => u.isPlayer);

  const isActiveUserSuspended =
    xSuspensionStatus?.isSuspended &&
    xSuspensionStatus.accountId === playerUser?.id;

  const isAlreadyPremium =
    playerUser?.isVerified === true ||
    playerUser?.isVerified === "blue" ||
    playerUser?.isVerified === "gold";

  const handleQuote = (post: XPost) => {
    setQuotePostTarget(post);
    setIsComposeModalOpen(true);
  };

  return (
    <div className="bg-black text-white h-full flex flex-col pb-14">
      {showPremiumModal && <XPremiumModal onClose={() => setShowPremiumModal(false)} />}

      {isComposeModalOpen && playerUser && (
        <ComposeXPostModal
          user={playerUser}
          quotePost={quotePostTarget || undefined}
          onClose={() => {
            setIsComposeModalOpen(false);
            setQuotePostTarget(null);
          }}
          onPost={async (payload) => {
            dispatch({ type: "POST_ON_X", payload });
            await createOnlineXPost({
              content: payload.content,
              image: payload.image,
              quotePost: payload.quoteOf
                ? {
                    id: payload.quoteOf.id,
                    authorName: (payload.quoteOf as any).authorName || "Artist",
                    authorUsername: (payload.quoteOf as any).authorUsername || "artist",
                    content: payload.quoteOf.content,
                  }
                : undefined,
              authorId: playerUser.id,
              authorName: playerUser.name || activeArtist?.name || "Artist",
              authorUsername: playerUser.username || "artist",
              authorAvatar: playerUser.avatar || activeArtist?.image || DEFAULT_AVATAR,
              authorVerified: Boolean(playerUser.isVerified),
              authorGoldVerified: playerUser.isVerified === "gold",
              gameYear: gameState.date.year,
              gameWeek: gameState.date.week,
            });
            setIsComposeModalOpen(false);
            setQuotePostTarget(null);
          }}
        />
      )}

      <ConfirmationModal
        isOpen={showAppealConfirm}
        onClose={() => setShowAppealConfirm(false)}
        onConfirm={() => {
          dispatch({ type: "APPEAL_X_SUSPENSION" });
          setShowAppealConfirm(false);
        }}
        title="Submit an appeal?"
        message="Are you sure you want to appeal your suspension?"
        confirmText="Submit Appeal"
      />

      <header className="sticky top-0 bg-black/85 backdrop-blur-sm z-20 border-b border-zinc-800 p-3 flex items-center">
        <div className="w-1/3 flex justify-start">
          <button
            onClick={() => dispatch({ type: "CHANGE_VIEW", payload: "game" })}
            className="h-8 text-sm font-semibold text-zinc-300 border border-zinc-700 rounded-full px-4 flex items-center justify-center hover:bg-zinc-800 transition-colors"
          >
            Exit
          </button>
        </div>
        <div className="w-1/3 flex justify-center">
          <XIcon className="w-7 h-7" />
        </div>
        <div className="w-1/3 flex justify-end">
          {!isAlreadyPremium && !isActiveUserSuspended && playerUser && (
            <button
              onClick={() => setShowPremiumModal(true)}
              className="h-8 text-xs font-bold text-black bg-white rounded-full px-3 flex items-center justify-center hover:bg-zinc-200 transition-colors"
            >
              Premium
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-hidden w-full relative">
        {activeTab === "For you" && <FeedView onQuote={handleQuote} />}
        {activeTab === "Explore" && <ExploreView onQuote={handleQuote} />}
        {activeTab === "Messages" && <MessagesView />}
        {activeTab === "Accounts" && <AccountsView />}
      </main>

      <div className="fixed bottom-20 right-4 z-30 flex flex-col gap-3">
        <button
          onClick={() => setIsComposeModalOpen(true)}
          disabled={isActiveUserSuspended || !playerUser}
          className="w-14 h-14 bg-blue-500 rounded-full flex items-center justify-center shadow-lg hover:bg-blue-600 transition-colors disabled:bg-zinc-600"
        >
          <PlusIcon className="w-7 h-7" />
        </button>
      </div>

      <footer className="fixed bottom-0 left-0 right-0 h-14 bg-black border-t border-zinc-800 flex justify-around items-center z-30 pb-safe">
        <button
          onClick={() => setActiveTab("For you")}
          className={`p-2 ${activeTab === "For you" ? "text-white" : "text-zinc-500"}`}
        >
          <HomeIcon className="w-7 h-7" />
        </button>
        <button
          onClick={() => setActiveTab("Explore")}
          className={`p-2 ${activeTab === "Explore" ? "text-white" : "text-zinc-500"}`}
        >
          <SearchIcon className="w-7 h-7" />
        </button>
        <button
          onClick={() => setActiveTab("Accounts")}
          className={`p-2 ${activeTab === "Accounts" ? "text-white" : "text-zinc-500"}`}
        >
          <UserGroupIcon className="w-7 h-7" />
        </button>
        <button
          onClick={() => setActiveTab("Messages")}
          className={`p-2 ${activeTab === "Messages" ? "text-white" : "text-zinc-500"}`}
        >
          <EnvelopeIcon className="w-7 h-7" />
        </button>
      </footer>
    </div>
  );
};

export default XView;
