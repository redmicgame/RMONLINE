import {
  ArtistData,
  GameState,
  XPost,
  XUser,
  XTrend,
  Song,
  Video,
  XChat,
  XMessage,
  XComment,
  GrammyAward,
} from "../types";
import { formatNumber } from "../context/GameContext";
import { LABELS } from "../constants";

export function calculateKalshiOdds<T extends { name: string; artistName?: string; score: number }>(
  nominees: T[],
  week: number,
  tieScore: number = 2
): { nominee: T; percent: number }[] {
  const noise = Math.sin(week * 1.5) * 0.2; // +/- 20% based on week
  
  const getDeterministicNoise = (name: string) => {
    let hash = 0;
    const str = `${name}-${week}`;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(Math.sin(hash)) * 0.08; // 0% to 8% subtle variation
  };

  const scores = nominees.map((n) => {
    const nomineeNoise = getDeterministicNoise(n.name);
    const noisyScore = Math.max(0, n.score * (1 + nomineeNoise + noise));
    return { nominee: n, noisyScore };
  });

  const total = scores.reduce((sum, item) => sum + item.noisyScore, 0) + tieScore;

  return scores
    .map(({ nominee, noisyScore }) => ({
      nominee,
      percent: total > 0 ? Math.round((noisyScore / total) * 100) : 0,
    }))
    .sort((a, b) => b.percent - a.percent);
}

export type PlayerSongWithChart = Song & {
  chartRank?: number;
  lastWeekRank?: number | null;
  peak?: number;
  weeksOnChart?: number;
};

export function formatChartDataHot100Post(params: {
  rank: number;
  lastWeekRank?: number | null;
  peak?: number;
  weeksOnChart?: number;
  title: string;
  artist: string;
  handle?: string;
}): string {
  const { rank, lastWeekRank, title, handle } = params;
  const artistName = params.artist && params.artist !== "undefined" ? params.artist : "Artist";
  const weeksOnChart = params.weeksOnChart ?? 1;
  const peak = params.peak ?? rank;

  let movement = "";
  if (lastWeekRank === null || lastWeekRank === undefined) {
    if (weeksOnChart > 1) {
      movement = "(re-entry)";
    } else {
      movement = "(debut)";
    }
  } else if (lastWeekRank === rank) {
    movement = "(=)";
  } else if (lastWeekRank > rank) {
    // Rose in position (e.g. from #25 to #15 is +10)
    movement = `(+${lastWeekRank - rank})`;
  } else {
    // Fell in position (e.g. from #25 to #34 is -9)
    movement = `(-${rank - lastWeekRank})`;
  }

  const cleanHandle = handle && handle !== "undefined" ? handle.replace(/^@/, "").trim() : "";
  const artistHandleStr = cleanHandle ? ` (@${cleanHandle})` : "";
  const weeksStr = `[${weeksOnChart} ${weeksOnChart === 1 ? "week" : "weeks"}].`;
  const peakStr = `*peak: #${peak}*`;

  return `Billboard Hot 100: #${rank}${movement} ${title}, ${artistName}${artistHandleStr} ${weeksStr} ${peakStr}`;
}

const pickRandom = <T>(arr: T[]): T =>
  arr[Math.floor(Math.random() * arr.length)];

const getGameDateString = (gameDate: { week: number; year: number }) => {
  const date = new Date(gameDate.year, 0, (gameDate.week - 1) * 7 + 1);
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

export const generateWeeklyXContent = (
  artistData: ArtistData,
  gameState: GameState,
  artistName: string,
  playerSongs: PlayerSongWithChart[],
  leakedSong: Song | null,
): {
  newPosts: XPost[];
  newUsers: XUser[];
  newTrends: XTrend[];
  newChats: XChat[];
  newMessages: { chatId: string; message: XMessage }[];
  newComments?: { postId: string; comment: XComment }[];
  newKalshiChance: number;
} => {
  const newPosts: XPost[] = [];
  const newUsers: XUser[] = [];
  const newTrends: XTrend[] = [];
  const newChats: XChat[] = [];
  const newMessages: { chatId: string; message: XMessage }[] = [];
  const { date } = gameState;
  const {
    artistImages: rawArtistImages,
    artistVideoThumbnails: rawArtistVideoThumbnails,
    releases,
    streamsRemovedThisWeek,
    paparazziPhotos,
    tours,
    voguePhotoshoots,
    songs,
    tourPhotos,
    popularity,
    xChats,
  } = artistData;

  const artistImages = (rawArtistImages || []).map((img: any) => typeof img === 'string' ? img : img.url);
  const artistVideoThumbnails = (rawArtistVideoThumbnails || []).map((img: any) => typeof img === 'string' ? img : img.url);

  const artistProfile = [
    gameState.soloArtist,
    ...(gameState.group?.members || []),
    gameState.group,
    ...(gameState.extraPlayableArtists || []),
  ].find((a) => a?.id === gameState.activeArtistId);
  // @ts-ignore
  const pronouns = artistProfile?.pronouns || "they/them";
  const pronounNominative =
    pronouns === "he/him" ? "he" : pronouns === "she/her" ? "she" : "they";
  const pronounPossessive =
    pronouns === "he/him" ? "his" : pronouns === "she/her" ? "her" : "their";
  const pronounObjective =
    pronouns === "he/him" ? "him" : pronouns === "she/her" ? "her" : "them";
  const isAre = pronouns === "they/them" ? "are" : "is";
  const hasHave = pronouns === "they/them" ? "have" : "has";

  // --- GRAMMY PREDICTION POST (WEEK 50) ---
  if (date.week === 50 && gameState.grammyCurrentYearNominations && gameState.grammyCurrentYearNominations.length > 0) {
    const chartDataUser = artistData.xUsers.find((u) => u.id === "chartdata");
    const authorId = chartDataUser ? chartDataUser.id : "chartdata";

    const targetCategories: GrammyAward["category"][] = [
      "Record of the Year",
      "Song of the Year",
      "Album of the Year",
      "Best New Artist",
    ];

    for (const catName of targetCategories) {
      const category = gameState.grammyCurrentYearNominations.find((c) => c.name === catName);
      if (!category || !category.nominees || category.nominees.length < 2) continue;

      // Matches Kalshi odds: nominee with highest probability is predicted to win
      const kalshiOdds = calculateKalshiOdds(category.nominees, date.week);
      if (kalshiOdds.length < 2) continue;

      const predictedWinner = kalshiOdds[0].nominee;

      // Choose who they want to win ("should" win) at random from the other nominees
      const otherNominees = category.nominees.filter((n) => n.id !== predictedWinner.id);
      const shouldWin =
        otherNominees.length > 0
          ? otherNominees[Math.floor(Math.random() * otherNominees.length)]
          : predictedWinner;

      if (predictedWinner && shouldWin) {
        const formatContender = (contender: { name: string; artistName?: string }) => {
          if (catName === "Best New Artist") {
            return contender.artistName || contender.name;
          }
          const artist = contender.artistName || "Artist";
          const possessive = artist.endsWith("s") ? `${artist}'` : `${artist}'s`;
          return `${possessive} "${contender.name}"`;
        };

        const content = `Rolling Stone predicts ${formatContender(predictedWinner)} will win '${catName}' at this year's #GRAMMYs.\n\nThe publication states ${formatContender(shouldWin)} "should" win.`;

        const image =
          shouldWin.coverArt ||
          predictedWinner.coverArt;

        newPosts.push({
          id: crypto.randomUUID(),
          authorId,
          content,
          image,
          likes: Math.floor(Math.random() * 25000) + 10000,
          retweets: Math.floor(Math.random() * 6000) + 2000,
          views: Math.floor(Math.random() * 600000) + 200000,
          date,
        });
      }
    }
  }

  // --- UNRELEASED SONG TOUR DEBUT TWEET ---
  const activeTour = tours.find(
    (t) => t.status === "active" && t.currentVenueIndex === 1,
  );
  if (activeTour) {
    const unreleasedSongsOnSetlist = activeTour.setlist
      .map((songId) => songs.find((s) => s.id === songId))
      .filter((song): song is Song => !!song && !song.isReleased);

    if (unreleasedSongsOnSetlist.length > 0 && tourPhotos.length > 0) {
      const featuredSong = pickRandom(unreleasedSongsOnSetlist);
      const tourPhoto = pickRandom(tourPhotos);
      const venue = activeTour.venues[0];

      const content = `${artistName} performs her unreleased song ‘${featuredSong.title}’ at her concert in ${venue.city}.`;

      newPosts.push({
        id: crypto.randomUUID(),
        authorId: "popbase",
        content,
        image: tourPhoto,
        likes: Math.floor(Math.random() * 150000) + 80000, // 80k-230k likes
        retweets: Math.floor(Math.random() * 12000) + 5000,
        views: Math.floor(Math.random() * 2000000) + 500000,
        date,
      });
    }
  }

  // --- TOURING DATA LOGIC ---
  const touringDataUser: XUser = {
    id: "touringdata",
    name: "Touring Data",
    username: "touringdata",
    avatar:
      "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIzMiIgY3k9IjMyIiByPSIzMiIgZmlsbD0iIzAwMCIvPjxwYXRoIGQ9Ik00NCAxOEwyMCA0NE0yMCAxOEw0NCA0NCIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSI0IiBzdHJva2UtbGluZWNhcD0icm91bmQiLz48cGF0aCBkPSJNMzIgMTZMMzIgNDgiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS13aWR0aD0iNCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PC9zdmc+", // Stylized light/spotlight icon
    isVerified: true,
    bio: "The most comprehensive source for concert touring data.",
    followersCount: 150000,
    followingCount: 50,
  };

  // Add Touring Data to new users if not already present (checked in main loop usually, but safe to add)
  newUsers.push(touringDataUser);

  const activeOrFinishedTours = tours.filter(
    (t) =>
      t.status === "active" ||
      (t.status === "finished" && t.currentVenueIndex === t.venues.length),
  );

  activeOrFinishedTours.forEach((tour) => {
    const lastVenueIndex = tour.currentVenueIndex - 1;

    // 1. Single Venue Report (If a show just happened this week)
    // We simulate "just happened" if there is a completed venue
    if (lastVenueIndex >= 0 && tour.status === "active") {
      const venue = tour.venues[lastVenueIndex];
      // Only post if it was a good show (sold out or high capacity) to avoid spamming every small gig
      if (venue.soldOut || venue.capacity > 2000) {
        const isHighestGrossing = Math.random() > 0.5;
        const typeText = isHighestGrossing
          ? "highest-grossing"
          : "most-attended";
        const dateString = getGameDateString(date);

        let content = "";
        if (isHighestGrossing) {
          content = `${artistName} earned their highest-grossing concert of all time on ${dateString}, with $${venue.revenue.toLocaleString()} at ${venue.name} in ${venue.city} as part of the "${tour.name}".`;
        } else {
          content = `${artistName} earned their most-attended concert of all time on ${dateString}, with ${venue.ticketsSold.toLocaleString()} tickets sold at ${venue.name} in ${venue.city} as part of the "${tour.name}".`;
        }

        newPosts.push({
          id: crypto.randomUUID(),
          authorId: touringDataUser.id,
          content: content,
          likes: Math.floor(Math.random() * 5000) + 1000,
          retweets: Math.floor(Math.random() * 1500) + 200,
          views: Math.floor(Math.random() * 100000) + 20000,
          date,
        });
      }
    }

    // 2. Box Office Summary (Periodic or End of Tour)
    // Chance to post summary: High if tour finished this week, Low if active
    const isTourFinishedThisWeek =
      tour.status === "finished" &&
      tour.currentVenueIndex === tour.venues.length; // Simplified check
    const shouldPostSummary =
      isTourFinishedThisWeek ||
      (tour.status === "active" &&
        Math.random() < 0.25 &&
        tour.currentVenueIndex > 0);

    if (shouldPostSummary) {
      const reportedShows = tour.currentVenueIndex;
      const totalRevenue = tour.totalRevenue;
      const totalTickets = tour.ticketsSold;

      if (reportedShows > 0) {
        const avgRevenue = Math.floor(totalRevenue / reportedShows);
        const avgTickets = Math.floor(totalTickets / reportedShows);
        const avgPrice = Math.floor(totalRevenue / totalTickets);

        const summaryContent = `${tour.name.toUpperCase()}, ${artistName}\n$${totalRevenue.toLocaleString()} Revenue ($${avgRevenue.toLocaleString()} avg.)\n${totalTickets.toLocaleString()} Tickets Sold (${avgTickets.toLocaleString()} avg.)\n$${avgPrice.toFixed(2)} Average Price\n${reportedShows}/${tour.venues.length} Reported Shows\n#BoxOffice`;

        newPosts.push({
          id: crypto.randomUUID(),
          authorId: touringDataUser.id,
          content: summaryContent,
          likes: Math.floor(Math.random() * 8000) + 2000,
          retweets: Math.floor(Math.random() * 2000) + 500,
          views: Math.floor(Math.random() * 150000) + 40000,
          date,
        });
      }
    }
  });

  // --- LEAK POSTS ---
  if (leakedSong) {
    // PopBase Post
    newPosts.push({
      id: crypto.randomUUID(),
      authorId: "popbase",
      content: `${artistName}'s unreleased song "${leakedSong.title}" has reportedly leaked online.`,
      image: leakedSong.coverArt,
      likes: Math.floor(Math.random() * 20000) + 10000,
      retweets: Math.floor(Math.random() * 5000) + 2000,
      views: Math.floor(Math.random() * 400000) + 100000,
      date,
    });

    // TMZ post for leak
    const tmzAccount = artistData.xUsers.find((u) => u.id === "tmz");
    const playerUser = artistData.xUsers.find((u) => u.isPlayer);
    if (tmzAccount && playerUser) {
      newPosts.push({
        id: crypto.randomUUID(),
        authorId: tmzAccount.id,
        content: `LEAKED: ${artistName}'s highly anticipated track "${leakedSong.title}" has surfaced online ahead of its official release.`,
        image: playerUser.avatar,
        likes: Math.floor(Math.random() * 4000) + 800,
        retweets: Math.floor(Math.random() * 1500) + 200,
        views: Math.floor(Math.random() * 300000) + 50000,
        date,
      });
    }
  }

  const releasedSongs = playerSongs.filter((s) => s.isReleased);
  const topSong = [...releasedSongs].sort(
    (a, b) => b.lastWeekStreams - a.lastWeekStreams,
  )[0];

  // PopBase Post for stream removal
  if (streamsRemovedThisWeek && streamsRemovedThisWeek > 0) {
    const totalRemoved = songs.reduce((sum, song) => sum + (song.removedStreams || 0), 0);
    
    if (totalRemoved > 10000000) {
      newPosts.push({
        id: crypto.randomUUID(),
        authorId: "popbase",
        content: `${artistName} is now the most fraudulent artist in history with over 10 MILLION streams removed from their discography`,
        image: artistImages.length > 0 ? pickRandom(artistImages) : undefined,
        likes: Math.floor(Math.random() * 50000) + 20000,
        retweets: Math.floor(Math.random() * 10000) + 5000,
        views: Math.floor(Math.random() * 500000) + 100000,
        date,
      });
    } else {
      newPosts.push({
        id: crypto.randomUUID(),
        authorId: "popbase",
        content: `Spotify has reportedly removed approximately ${formatNumber(streamsRemovedThisWeek)} artificial streams from ${artistName}'s catalog following a routine review.`,
        image: undefined,
        likes: Math.floor(Math.random() * 8000) + 3000,
        retweets: Math.floor(Math.random() * 2000) + 500,
        views: Math.floor(Math.random() * 150000) + 40000,
        date,
      });
    }
    delete artistData.streamsRemovedThisWeek;
  }

  // Online-only world: celebrity follow/unfollow events come from real online artists only.

  // PopBase Brand Ambassador Deal Post
  if (artistData.activeBrandDeals && artistData.activeBrandDeals.length > 0) {
      // Find a deal that hasn't been announced yet? Or just announce randomly? Let's assume we announce deals signed this week.
      // A simple way is to check if we haven't posted about this deal. We can use a property or just random chance if a deal exists.
      // But we probably want to trigger this when SIGN_BRAND_DEAL happens. It's better to add the post directly in the SIGN_BRAND_DEAL reducer.
  }

  // (artist name) Stats post
  const statsAccount = artistData.xUsers.find(
    (u) => u.username === `${artistName.replace(/\s/g, "").toLowerCase()}stats`,
  );

  if (statsAccount && releasedSongs.length > 0 && Math.random() < 0.8) {
    // 80% chance each week to post
    const topSongsForPost = [...releasedSongs]
      .sort((a, b) => b.lastWeekStreams - a.lastWeekStreams)
      .slice(0, 10);

    let postContent = `${artistName}'s most streamed songs on Spotify this week:\n\n`;

    topSongsForPost.forEach((song) => {
      let changeDisplay = "";
      if (song.prevWeekStreams > 0) {
        const change =
          ((song.lastWeekStreams - song.prevWeekStreams) /
            song.prevWeekStreams) *
          100;
        changeDisplay = ` (+${change.toFixed(2)}%)`;
      }

      postContent += `"${song.title}" — ${formatNumber(song.lastWeekStreams)}${changeDisplay}\n`;
    });

    let image: string | undefined = undefined;
    let video: string | undefined = undefined;

    if (topSongsForPost[0] && topSongsForPost[0].canvasVideo) {
      video = topSongsForPost[0].canvasVideo;
    } else if (artistImages.length > 0 && Math.random() > 0.3) {
      image = pickRandom(artistImages);
    }

    newPosts.push({
      id: crypto.randomUUID(),
      authorId: statsAccount.id,
      content: postContent.trim(),
      image: image,
      video: video,
      likes: Math.floor(Math.random() * 20000) + 5000,
      retweets: Math.floor(Math.random() * 5000) + 1000,
      views: Math.floor(Math.random() * 300000) + 80000,
      date,
    });
  }


  // Spotify Snapshot Weekly / Daily Top Albums
  const isDailySnapshot = gameState.spotifySnapshotTimeframe === "daily" || gameState.timeMode === "daily";
  if ((isDailySnapshot || date.week % 2 === 0) && gameState.billboardTopAlbums && gameState.billboardTopAlbums.length >= 15) {
    const topAlbums = gameState.billboardTopAlbums.slice(0, 15);
    const spotifySnapshotAlbums = topAlbums.map(album => {
      const fullStreams = Math.floor((album.weeklySES || (album.weeklyActivity * 0.85)) * 1500);
      const streams = isDailySnapshot ? Math.floor(fullStreams / 7) : fullStreams;
      const percentChange = (Math.random() * 20 - 10).toFixed(2);
      let move: string | number = '-';
      if (album.lastWeek) {
          const m = album.lastWeek - album.rank;
          move = m > 0 ? `+${m}` : m < 0 ? `${m}` : '-';
      } else {
          move = 'NEW';
      }
      return {
         rank: album.rank,
         title: album.title,
         streams: streams,
         dailyStreams: isDailySnapshot ? streams : Math.floor(streams / 7),
         coverArt: album.coverArt || `https://api.dicebear.com/7.x/shapes/svg?seed=${album.title.replace(/ /g, '')}`,
         move: move,
         percentChange: parseFloat(percentChange)
      }
    });

    newPosts.push({
      id: `spotify_snapshot_${date.year}_${date.week}`,
      authorId: "spotify_snapshot",
      content: isDailySnapshot
        ? `Daily Top Albums Update (${date.week}w ${date.year}) 🔥\n\nWho are you streaming the most today? 👇`
        : `Weekly Top Albums Update (${date.week}w ${date.year}) 🔥\n\nWho are you streaming the most this week? 👇`,
      date: date,
      likes: Math.floor(Math.random() * 50000) + 10000,
      retweets: Math.floor(Math.random() * 10000) + 5000,
      views: Math.floor(Math.random() * 500000) + 100000,
      spotifySnapshotAlbums: spotifySnapshotAlbums
    });

    const hasUser = artistData.xUsers?.find(u => u.id === "spotify_snapshot");
    if (!hasUser) {
      newUsers.push({
         id: "spotify_snapshot",
         username: "SpotifySnapshot",
         name: "Spotify Snapshot",
         isPlayer: false,
         isVerified: true,
         followersCount: 5400000,
         followingCount: 120,
         avatar: "https://api.dicebear.com/7.x/identicon/svg?seed=spotify"
      });
    }
  }

  // Check for Debut Release this week
  const debutRelease = releases.find(
    (r) =>
      r.releaseDate.week === date.week &&
      r.releaseDate.year === date.year &&
      releases.filter((rel) => rel.artistId === r.artistId).length === 1, // It's a debut if it's the first release for this artist
  );

  if (debutRelease) {
    newPosts.push({
      id: crypto.randomUUID(),
      authorId: "popbase",
      content: `${artistName} has officially released their debut ${debutRelease.type.toLowerCase()} "${debutRelease.title}".`,
      image: debutRelease.coverArt,
      likes: Math.floor(Math.random() * 30000) + 10000,
      retweets: Math.floor(Math.random() * 8000) + 3000,
      views: Math.floor(Math.random() * 500000) + 150000,
      date,
    });
  }

  const isDaily = gameState.timeMode === "daily";

  // Daily / Weekly stream gain post for top song (if not debut week)
  const topSongStreamCount = isDaily
    ? (topSong?.lastDayStreams || (topSong ? Math.round(topSong.lastWeekStreams / 7) : 0))
    : (topSong?.lastWeekStreams || 0);
  const streamThreshold = isDaily ? 150_000 : 1_000_000;

  if (topSong && !debutRelease && topSongStreamCount > streamThreshold) {
    if (Math.random() > 0.4) {
      // 60% chance of this post
      newPosts.push({
        id: crypto.randomUUID(),
        authorId: "chartdata",
        content: isDaily
          ? `${artistName}'s "${topSong.title}" earned ${formatNumber(topSongStreamCount)} streams in the US today.`
          : `${artistName}'s "${topSong.title}" earned ${formatNumber(topSongStreamCount)} streams in the US this week.`,
        likes: Math.floor(Math.random() * 12000) + 4000,
        retweets: Math.floor(Math.random() * 3000) + 800,
        views: Math.floor(Math.random() * 180000) + 40000,
        date,
      });
    }
  }

  // Pre-order / Expected Debut Post
  const upcomingAlbums =
    artistData.labelSubmissions?.filter(
      (sub) =>
        sub.status === "scheduled" &&
        sub.isProjectAnnounced &&
        sub.release.type === "Album" &&
        sub.projectReleaseDate &&
        sub.projectReleaseDate.year * 52 + sub.projectReleaseDate.week >
          date.year * 52 + date.week,
    ) || [];

  for (const sub of upcomingAlbums) {
    const preorders = sub.preorderSales || 0;
    if (preorders > 0) {
      // Units range
      const minUnits = Math.max(1, Math.floor(preorders * 0.95));
      const maxUnits = Math.floor(preorders * 1.1) + 1000;
      const avgUnits = (minUnits + maxUnits) / 2;

      // Find chart position
      let expectedPos = 200;
      if (gameState.billboardTopAlbums) {
        const chart = [...(gameState.billboardTopAlbums || [])].sort(
          (a, b) => b.weeklyActivity - a.weeklyActivity,
        );
        const posIndex = chart.findIndex(
          (entry) => entry.weeklyActivity < avgUnits,
        );
        expectedPos =
          posIndex === -1
            ? chart.length < 200
              ? chart.length + 1
              : 200
            : posIndex + 1;
      }

      // format units
      const formatUnits = (num: number) => {
        if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
        if (num >= 1000) return `${Math.floor(num / 1000)}K`;
        return `${num}`;
      };

      const unitsText = `${formatUnits(minUnits)}-${formatUnits(maxUnits)}`;

      // Check biggest debut
      const currentBiggestSales = gameState.biggestSalesWeekByYear?.[date.year];
      const isBiggest =
        !currentBiggestSales || maxUnits > currentBiggestSales.sales;
      const biggestText = isBiggest
        ? `\n\nIt will be the biggest debut of the year.`
        : "";

      newPosts.push({
        id: crypto.randomUUID(),
        authorId: "chartdata",
        content: `${artistName}'s '${sub.release.title}' aiming for #${expectedPos} debut on the Billboard 200 with ${unitsText} units first week (via @HITSDD).${biggestText}`,
        image: sub.release.coverArt,
        image2:
          (artistProfile as any)?.image || (artistProfile as any)?.imageUrl ||
          "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&q=80&w=3470",
        likes: Math.floor(Math.random() * 20000) + 10000,
        retweets: Math.floor(Math.random() * 5000) + 1000,
        views: Math.floor(Math.random() * 500000) + 100000,
        date,
      });
    }
  }

  // --- CHARTDATA: AIMING FOR FIRST BILLBOARD HOT 100 ENTRY (TWEETED THE WEEK BEFORE) - USER ONLY (IMG_8478) ---
  const hasEverChartedHot100 =
    !!artistData.firstChartEntry ||
    (gameState.billboardHot100 || []).some((entry) => entry.isPlayerSong) ||
    Object.values(gameState.chartHistory || {}).some(
      (h) => (h as any).isPlayerSong,
    );

  if (!hasEverChartedHot100 && !artistData.hasAimingFirstHot100Tweeted) {
    const upcomingSingle = artistData.labelSubmissions?.find(
      (sub: any) =>
        sub.status === "scheduled" &&
        sub.projectReleaseDate &&
        (sub.release?.type === "Single" || (sub.singles && sub.singles.length > 0)),
    );
    const unchargedReleasedSingle = artistData.songs?.find(
      (s) =>
        s.isReleased &&
        (!gameState.chartHistory || !gameState.chartHistory[s.id]),
    );

    const targetSong = upcomingSingle
      ? ((upcomingSingle as any).singles?.[0] || upcomingSingle.release)
      : unchargedReleasedSingle;

    if (targetSong) {
      artistData.hasAimingFirstHot100Tweeted = true;
      const targetTitle = (targetSong as any).title || "debut single";
      const pronounPossessive =
        (artistProfile as any)?.pronouns === "he/him"
          ? "his"
          : (artistProfile as any)?.pronouns === "she/her"
          ? "her"
          : "their";
      const aimingPostContent = `${artistName} aiming for ${pronounPossessive} first ever charting single on the Billboard Hot 100 next week with "${targetTitle}".`;
      const artistPic =
        (artistProfile as any)?.image ||
        (artistProfile as any)?.imageUrl ||
        (artistData as any).avatar ||
        (targetSong as any).coverArt;

      newPosts.push({
        id: crypto.randomUUID(),
        authorId: "chartdata",
        content: aimingPostContent,
        image: artistPic,
        likes: Math.floor(Math.random() * 35000) + 12000,
        retweets: Math.floor(Math.random() * 9000) + 2000,
        views: Math.floor(Math.random() * 450000) + 100000,
        date,
      });
    }
  }

  // TMZ Post Logic
  const tmzAccount = artistData.xUsers.find((u) => u.id === "tmz");
  if (tmzAccount && paparazziPhotos.length > 0 && Math.random() < 0.5) {
    // 50% chance
    const photo = pickRandom(paparazziPhotos);
    let content = "";
    switch (photo.category) {
      case "Scandal":
        content = `EXCLUSIVE: ${artistName} seen in a heated argument in downtown LA. Is there trouble in paradise?`;
        break;
      case "Fashion":
        content = `${artistName} turns heads with a stunning new look while out shopping today.`;
        break;
      case "Candid":
        content = `${artistName} enjoys some downtime, spotted grabbing coffee this morning.`;
        break;
      case "Spotted":
      default:
        content = `${artistName} was spotted out and about in New York City earlier today.`;
        break;
    }

    newPosts.push({
      id: crypto.randomUUID(),
      authorId: tmzAccount.id,
      content: content,
      image: photo.image,
      likes: Math.floor(Math.random() * 4000) + 800,
      retweets: Math.floor(Math.random() * 1500) + 200,
      views: Math.floor(Math.random() * 3000000) + 500000,
      date,
    });
  }

  // Online-only world: real call-outs & rivalries occur directly between online users on X.

  // --- PUSH CAMPAIGN LOGIC ---
  const playerUser = artistData.xUsers.find((u) => u.isPlayer);
  const recentPushPost = playerUser
    ? artistData.xPosts.find(
        (p) =>
          p.authorId === playerUser.id &&
          p.content.toLowerCase().startsWith("push "),
      )
    : undefined;

  if (recentPushPost) {
    const postAge =
      date.year * 52 +
      date.week -
      (recentPushPost.date.year * 52 + recentPushPost.date.week);
    if (postAge <= 1) {
      // Check if post is from this week or last week
      const chartFanAccount = artistData.xUsers.find((u) =>
        u.username.endsWith("charts"),
      );
      if (chartFanAccount) {
        const playerFandomName =
          gameState.soloArtist?.fandomName ||
          gameState.group?.fandomName ||
          `${artistName} Fans`;
        newPosts.push({
          id: crypto.randomUUID(),
          authorId: chartFanAccount.id,
          content: `${playerFandomName.toUpperCase()}!! ${artistName} said it! ${recentPushPost.content.toUpperCase()}!!! LET'S GO!`,
          likes: Math.floor(Math.random() * 15000) + 5000,
          retweets: Math.floor(Math.random() * 4000) + 1500,
          views: Math.floor(Math.random() * 200000) + 70000,
          date,
        });
      }
    }
  }

  // --- TAKEDOWN POP BASE TWEETS ---
  const takenDownSongs = songs.filter(
    (s) => s.isTakenDown && s.prevWeekStreams > 0,
  );
  for (const song of takenDownSongs) {
    let isPettyLabel = false;
    let labelName = "";
    if (song.releaseId) {
      const release = releases.find((r) => r.id === song.releaseId);
      if (release && release.releasingLabel) {
        const label = LABELS.find(
          (l) => l.name === release.releasingLabel?.name,
        );
        if (label && label.contractType === "petty") {
          isPettyLabel = true;
          labelName = label.name;
        }
      }
    }

    let content = "";
    if (isPettyLabel) {
      content = `${artistName}'s song "${song.title}" has been removed from all streaming platforms by their former label, ${labelName}.`;
    } else {
      content = `${artistName}'s song "${song.title}" has been taken down from all streaming platforms.`;
    }

    newPosts.push({
      id: crypto.randomUUID(),
      authorId: "popbase",
      content,
      image: song.coverArt,
      likes: Math.floor(Math.random() * 30000) + 10000,
      retweets: Math.floor(Math.random() * 5000) + 2000,
      views: Math.floor(Math.random() * 500000) + 100000,
      date,
    });
  }

  // Online-only world: zero NPC artist diss posts, zero synthetic fan/hater posts or comments.
  const newComments: { postId: string; comment: XComment }[] = [];

  // 2. Chart Post if applicable
  const chartedSongs = playerSongs
    .filter((s) => s.chartRank && s.chartRank <= 100)
    .sort((a, b) => (a.chartRank || 100) - (b.chartRank || 100));

  const playerXUser = artistData.xUsers.find((u) => u.isPlayer);
  const playerHandle = playerXUser?.username || artistName.toLowerCase().replace(/[^a-z0-9]/g, "");

  chartedSongs.slice(0, 3).forEach((chartedSong) => {
    if (!chartedSong.chartRank) return;
    const postContent = formatChartDataHot100Post({
      rank: chartedSong.chartRank,
      lastWeekRank: chartedSong.lastWeekRank,
      peak: chartedSong.peak ?? chartedSong.chartRank,
      weeksOnChart: chartedSong.weeksOnChart ?? 1,
      title: chartedSong.title,
      artist: artistName,
      handle: playerHandle,
    });

    newPosts.push({
      id: crypto.randomUUID(),
      authorId: "chartdata",
      content: postContent,
      image: chartedSong.coverArt,
      likes: Math.floor(Math.random() * 25000) + 8000,
      retweets: Math.floor(Math.random() * 6000) + 1500,
      views: Math.floor(Math.random() * 300000) + 80000,
      date,
    });
  });

  // 2.5 Spotify Global #1 Post from Chart Data
  const spotifyNumberOne = gameState.spotifyGlobal[0];
  if (
    spotifyNumberOne &&
    spotifyNumberOne.isPlayerSong &&
    spotifyNumberOne.songId
  ) {
    const matchingPlayerSong = playerSongs.find(
      (s) => s.id === spotifyNumberOne.songId,
    );
    const matchSongStreams = isDaily
      ? (matchingPlayerSong?.lastDayStreams || (matchingPlayerSong ? Math.round(matchingPlayerSong.lastWeekStreams / 7) : 0))
      : (matchingPlayerSong?.lastWeekStreams || 0);

    if (matchingPlayerSong && matchSongStreams > 0) {
      newPosts.push({
        id: crypto.randomUUID(),
        authorId: "chartdata",
        content: isDaily
          ? `${artistName}'s "${matchingPlayerSong.title}" is #1 on Global Spotify today with ${formatNumber(matchSongStreams)} daily streams.`
          : `${artistName}'s "${matchingPlayerSong.title}" is #1 on Global Spotify this week with ${formatNumber(matchSongStreams)} streams.`,
        image: matchingPlayerSong.coverArt,
        likes: Math.floor(Math.random() * 45000) + 15000,
        retweets: Math.floor(Math.random() * 12000) + 3000,
        views: Math.floor(Math.random() * 700000) + 200000,
        date,
      });
    }
  }

  // 2.6 1 Billion Streams for a single song
  for (const song of artistData.songs) {
    if (song.streams >= 1_000_000_000 && !song.hasTweetedBillionStreams) {
      song.hasTweetedBillionStreams = true;
      newPosts.push({
        id: crypto.randomUUID(),
        authorId: "chartdata",
        content: `${artistName}'s "${song.title}" has now surpassed 1 billion streams on Spotify.`,
        image: song.coverArt,
        likes: Math.floor(Math.random() * 60000) + 20000,
        retweets: Math.floor(Math.random() * 15000) + 5000,
        views: Math.floor(Math.random() * 800000) + 200000,
        date,
      });
    }
  }

  // 2.7 1 Billion Streams Total Across All Credits
  const totalArtistStreams = artistData.songs.reduce(
    (acc, s) => acc + s.streams,
    0,
  );
  if (
    totalArtistStreams >= 1_000_000_000 &&
    !artistData.hasTweetedBillionTotalStreams
  ) {
    artistData.hasTweetedBillionTotalStreams = true;
    newPosts.push({
      id: crypto.randomUUID(),
      authorId: "chartdata",
      content: `${artistName} has now surpassed 1 billion streams worldwide.`,
      image:
        (artistProfile as any)?.image || (artistProfile as any)?.imageUrl ||
        "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&q=80&w=3470",
      likes: Math.floor(Math.random() * 80000) + 30000,
      retweets: Math.floor(Math.random() * 20000) + 5000,
      views: Math.floor(Math.random() * 1000000) + 300000,
      date,
    });
  }

  // 3. PopBase post if song is doing well (and not a debut, to avoid duplicate posts)
  const popBaseThreshold = isDaily ? 700_000 : 5_000_000;
  if (topSong && !debutRelease && topSongStreamCount > popBaseThreshold) {
    if (Math.random() > 0.5) {
      // 50% chance
      newPosts.push({
        id: crypto.randomUUID(),
        authorId: "popbase",
        content: isDaily
          ? `${artistName}'s new single "${topSong.title}" is gaining major traction, racking up over ${formatNumber(topSongStreamCount)} streams today.`
          : `${artistName}'s new single "${topSong.title}" is gaining major traction, racking up over ${formatNumber(topSongStreamCount)} streams this week alone.`,
        image: topSong.coverArt,
        likes: Math.floor(Math.random() * 25000) + 8000,
        retweets: Math.floor(Math.random() * 7000) + 2000,
        views: Math.floor(Math.random() * 400000) + 100000,
        date,
      });
    }
  }

  // 4. Generate Trends
  const potentialTrends = [
    {
      category: "Trending in United States",
      title: artistName,
      postCount: Math.floor(Math.random() * 50000) + 10000,
    },
  ];
  if (leakedSong) {
    potentialTrends.unshift({
      category: "Music · Trending",
      title: `${leakedSong.title} Leak`,
      postCount: Math.floor(Math.random() * 100000) + 45000,
    });
  }
  if (topSong && topSong.lastWeekStreams > 1_000_000) {
    potentialTrends.push({
      category: "Music · Trending",
      title: `#${topSong.title.replace(/\W/g, "")}`,
      postCount: Math.floor(Math.random() * 80000) + 20000,
    });
    if (Math.random() > 0.5)
      potentialTrends.push({
        category: "Music · Trending",
        title: `WE LOVE ${artistName.toUpperCase()}`,
        postCount: Math.floor(Math.random() * 40000) + 15000,
      });
  }
  if (artistData.tours.some((t) => t.status === "active")) {
    potentialTrends.push({
      category: "Music · Trending",
      title: `${artistName} Tour`,
      postCount: Math.floor(Math.random() * 60000) + 20000,
    });
  }
  const latestRelease = artistData.releases.sort(
    (a, b) =>
      b.releaseDate.year * 52 +
      b.releaseDate.week -
      (a.releaseDate.year * 52 + a.releaseDate.week),
  )[0];
  if (latestRelease && latestRelease.review && latestRelease.review.score < 5) {
    potentialTrends.push({
      category: "Music · Trending",
      title: `${artistName.replace(/\W/g, "")}IsOverParty`,
      postCount: Math.floor(Math.random() * 30000) + 10000,
    });
  }

  // Online event & platform trends (no hardcoded NPC artist names)
  const realisticPlaceholders = [
    {
      category: "Entertainment · Trending",
      title: "Pop Crave",
      postCount: Math.floor(Math.random() * 80000) + 15000,
    },
    {
      category: "Entertainment · Trending",
      title: "Pop Base",
      postCount: Math.floor(Math.random() * 60000) + 10000,
    },
    {
      category: "Music · Trending",
      title: "Spotify",
      postCount: Math.floor(Math.random() * 200000) + 50000,
    },
    {
      category: "Music · Trending",
      title: "Billboard",
      postCount: Math.floor(Math.random() * 50000) + 10000,
    },
  ];

  if (date.week >= 48) {
    realisticPlaceholders.push({
      category: "Music · Trending",
      title: "#SpotifyWrapped",
      postCount: Math.floor(Math.random() * 1500000) + 500000,
    });
  }
  if (date.week === 6) {
    // near Grammys
    realisticPlaceholders.push({
      category: "Music · Trending",
      title: "#GRAMMYs",
      postCount: Math.floor(Math.random() * 1000000) + 200000,
    });
  }
  if (date.week === 15) {
    // near Coachella
    realisticPlaceholders.push({
      category: "Music · Trending",
      title: "Coachella",
      postCount: Math.floor(Math.random() * 800000) + 100000,
    });
  }
  if (date.week === 35) {
    // near VMAs
    realisticPlaceholders.push({
      category: "Music · Trending",
      title: "#VMAs",
      postCount: Math.floor(Math.random() * 600000) + 100000,
    });
  }
  if (date.week === 18) {
    // near Met Gala
    realisticPlaceholders.push({
      category: "Entertainment · Trending",
      title: "Met Gala",
      postCount: Math.floor(Math.random() * 900000) + 200000,
    });
  }

  const generalPlaceholders = [
    {
      category: "Entertainment · Trending",
      title: "Netflix",
      postCount: Math.floor(Math.random() * 300000) + 50000,
    },
    {
      category: "Trending in United States",
      title: "BREAKING",
      postCount: Math.floor(Math.random() * 500000) + 100000,
    },
    {
      category: "Gaming · Trending",
      title: "GTA VI",
      postCount: Math.floor(Math.random() * 500000) + 100000,
    },
  ];

  const placeholders = [...realisticPlaceholders, ...generalPlaceholders];

  // Shuffle and pick
  const shuffledTrends = [...potentialTrends, ...placeholders].sort(
    () => 0.5 - Math.random(),
  );
  for (let i = 0; i < 5 && i < shuffledTrends.length; i++) {
    // Avoid duplicate trends
    if (!newTrends.some((t) => t.title === shuffledTrends[i].title)) {
      newTrends.push({ id: crypto.randomUUID(), ...shuffledTrends[i] });
    }
  }

  // 5. Generate Posts from Chart Fan Account
  const playerUsername =
    artistData.xUsers.find((u) => u.isPlayer)?.username ||
    artistName.replace(/\s/g, "").toLowerCase();
  const chartFanAccount = artistData.xUsers.find((u) =>
    u.username.endsWith("charts"),
  );

  if (chartFanAccount) {
    // Monthly Listeners Post
    const shouldPostListeners =
      (date.week % 4 === 1 && Math.random() < 0.75) || Math.random() < 0.25;
    if (artistData.monthlyListeners > 1000 && shouldPostListeners) {
      const change = Math.floor(
        artistData.monthlyListeners * (Math.random() * 0.03 + 0.005),
      );
      const postContent = `Spotify Update — Monthly Listeners:\n\n• @${playerUsername} — ${formatNumber(artistData.monthlyListeners)} (+${formatNumber(change)})`;
      const image =
        artistImages.length > 0
          ? pickRandom(artistImages)
          : artistVideoThumbnails.length > 0
            ? pickRandom(artistVideoThumbnails)
            : undefined;

      newPosts.push({
        id: crypto.randomUUID(),
        authorId: chartFanAccount.id,
        content: postContent,
        image,
        likes: Math.floor(Math.random() * 5000) + 1000,
        retweets: Math.floor(Math.random() * 1000) + 200,
        views: Math.floor(Math.random() * 80000) + 20000,
        date,
      });
    }

    // Milestone Post
    if (Math.random() < 0.4) {
      const milestones = [
        1e8, 2e8, 3e8, 4e8, 5e8, 6e8, 7e8, 8e8, 9e8, 1e9, 1.5e9, 2e9,
      ];
      const songsNearMilestone: Song[] = [];
      for (const song of releasedSongs) {
        const nextMilestone = milestones.find((m) => m > song.streams);
        if (
          nextMilestone &&
          song.streams / nextMilestone > 0.95 &&
          song.streams / nextMilestone < 1.0
        ) {
          songsNearMilestone.push(song);
        }
      }

      if (songsNearMilestone.length > 0) {
        let postContent = `${artistName}'s next songs to reach a milestone on Spotify:\n\n`;
        songsNearMilestone
          .sort((a, b) => b.streams - a.streams)
          .slice(0, 4)
          .forEach((song) => {
            postContent += `${song.title}: ${formatNumber(song.streams)} streams\n`;
          });
        postContent += `\n🚀 Keep streaming to these songs on Spotify.`;
        const image =
          artistImages.length > 0 ? pickRandom(artistImages) : undefined;

        newPosts.push({
          id: crypto.randomUUID(),
          authorId: chartFanAccount.id,
          content: postContent.trim(),
          image,
          likes: Math.floor(Math.random() * 3000) + 500,
          retweets: Math.floor(Math.random() * 800) + 100,
          views: Math.floor(Math.random() * 60000) + 10000,
          date,
        });
      }
    }

    // Upcoming Release Post
    const scheduledSubmissions = artistData.labelSubmissions.filter(
      (s) => s.status === "scheduled",
    );
    if (scheduledSubmissions.length > 0) {
      const upcomingReleases: {
        name: string;
        cover: string;
        weeks: number;
        type: string;
      }[] = [];
      const toTotalWeeks = (d: GameState["date"]) => d.year * 52 + d.week;
      const nowTotalWeeks = toTotalWeeks(date);

      scheduledSubmissions.forEach((sub) => {
        if (sub.projectReleaseDate) {
          const weeksUntil =
            toTotalWeeks(sub.projectReleaseDate) - nowTotalWeeks;
          if (weeksUntil > 0 && weeksUntil <= 4) {
            upcomingReleases.push({
              name: sub.release.title,
              cover: sub.release.coverArt,
              weeks: weeksUntil,
              type: sub.release.type,
            });
          }
        }
        sub.singlesToRelease?.forEach((single) => {
          const weeksUntil = toTotalWeeks(single.releaseDate) - nowTotalWeeks;
          const song = playerSongs.find((s) => s.id === single.songId);
          if (weeksUntil > 0 && weeksUntil <= 4 && song) {
            upcomingReleases.push({
              name: song.title,
              cover: song.coverArt,
              weeks: weeksUntil,
              type: "Single",
            });
          }
        });
      });

      if (upcomingReleases.length > 0) {
        const soonest = upcomingReleases.sort((a, b) => a.weeks - b.weeks)[0];
        const daysUntil = soonest.weeks * 7 - Math.floor(Math.random() * 4);
        const postContent = `.@${playerUsername}’s “${soonest.name}” will be released in ${daysUntil} days.`;

        newPosts.push({
          id: crypto.randomUUID(),
          authorId: chartFanAccount.id,
          content: postContent,
          image: soonest.cover,
          likes: Math.floor(Math.random() * 40000) + 15000,
          retweets: Math.floor(Math.random() * 10000) + 4000,
          views: Math.floor(Math.random() * 800000) + 300000,
          date,
        });
      }
    }
  }

  // Online-only world: X DMs & group chats occur strictly between real online users in Firestore.

  let newKalshiChance = gameState.kalshiAlbumChance || 10;

  // Decrease slowly over time to simulate market decay
  newKalshiChance = Math.max(5, newKalshiChance - 2);

  if (leakedSong) {
    newKalshiChance += 25; // Big boost for leak
  }

  const playerUserObj = artistData.xUsers.find((u) => u.isPlayer);
  if (playerUserObj) {
    const recentAlbumTweets = artistData.xPosts.filter(
      (p) =>
        p.authorId === playerUserObj.id &&
        (p.content.toLowerCase().includes("album") ||
          p.content.toLowerCase().includes("single")) &&
        date.year * 52 + date.week - (p.date.year * 52 + p.date.week) <= 1,
    );
    if (recentAlbumTweets.length > 0) {
      newKalshiChance += 10 * recentAlbumTweets.length;
    }
  }

  newKalshiChance = Math.min(99, newKalshiChance);

  // Chartdata tweets Kalshi predictions when it rises big
  if (newKalshiChance - (gameState.kalshiAlbumChance || 10) >= 15) {
    if (chartFanAccount) {
      newPosts.push({
        id: crypto.randomUUID(),
        authorId: chartFanAccount.id,
        content: `${artistName} has a ${newKalshiChance}% chance of announcing a new album in ${date.year}, according to @Kalshi betting markets.`,
        image: artistImages.length > 0 ? pickRandom(artistImages) : undefined,
        likes: Math.floor(Math.random() * 30000) + 10000,
        retweets: Math.floor(Math.random() * 8000) + 2000,
        views: Math.floor(Math.random() * 500000) + 100000,
        date,
      });
    }
  }

  // Apple Music most streamed songs / artists reveals
  if (chartFanAccount) {
    const yearsOfChartData = Math.max(1, date.year - 2023);
    if (date.week >= 1 && date.week <= 10) {
      const rank = 11 - date.week; // Week 1 = #10, Week 10 = #1
      const allSongs = [...artistData.songs];
      const sortedSongs = allSongs.sort((a, b) => b.streams - a.streams);
      const targetSong = sortedSongs[rank - 1];

      if (targetSong) {
        if (date.week === 1) {
          newPosts.push({
            id: crypto.randomUUID(),
            authorId: chartFanAccount.id,
            content: `${artistName}'s top 10 most streamed songs as a lead artist of all-time on Apple Music will exclusively be revealed today at 6PM ET.\n\nConcluding coverage in celebration of ${yearsOfChartData} years of Chart Data.`,
            image:
              artistImages.length > 0 ? pickRandom(artistImages) : undefined,
            likes: Math.floor(Math.random() * 20000) + 5000,
            retweets: Math.floor(Math.random() * 5000) + 1000,
            views: Math.floor(Math.random() * 300000) + 50000,
            date,
          });
        }

        newPosts.push({
          id: crypto.randomUUID(),
          authorId: chartFanAccount.id,
          content: `"${targetSong.title}" is ${artistName}'s #${rank} most streamed song as a lead artist of all-time on Apple Music.`,
          image: targetSong.coverArt,
          image2: `https://ui-avatars.com/api/?name=${rank}&background=000&color=fff&size=512`,
          likes: Math.floor(Math.random() * 30000) + 5000,
          retweets: Math.floor(Math.random() * 8000) + 1000,
          views: Math.floor(Math.random() * 400000) + 60000,
          date,
        });
      }
    }
  }

  return {
    newPosts,
    newUsers,
    newTrends,
    newChats,
    newMessages,
    newComments,
    newKalshiChance,
  };
};
