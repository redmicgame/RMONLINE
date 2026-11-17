# Security Specification — Red Mic Online

## 1. Data Invariants
1. **Global World Clock (`/world/clock`)**: Single immutable anchor document (`epochStartMs`, `weekDurationMs == 900000`, `startYear == 2018`). Once created by a verified user, no client can modify or delete the clock.
2. **PII Isolation (`/saves/{userId}` vs `/onlineArtists/{uid}`)**: Private save data (`saves/{userId}`, `users/{userId}/saves/{saveId}`) is strictly readable and writable only by `request.auth.uid == userId`. Public collections (`onlineArtists`, `onlineSongs`, `onlineReleases`, `onlineVideos`, `onlineXPosts`, `onlineFollows`) contain **zero PII** (no email, phone, address).
3. **Ownership Integrity**: Every artist profile (`uid`), song (`ownerUid`), release (`ownerUid`), video (`ownerUid`), X post (`ownerUid`), and follow edge (`followerUid`) must strictly match `request.auth.uid` on creation and remain immutable on update.
4. **Master Gate for Direct Messages (`/onlineChats/{chatId}/messages/{messageId}`)**: A user can only create, get, or list DM threads and messages where their `request.auth.uid` is in the bounded 2-element `participantUids` list. Message creation additionally verifies the parent `/onlineChats/{chatId}` document exists and matches participants.
5. **Bounded Strings, Lists & IDs**: Every document ID passes `isValidId()` (`^[a-zA-Z0-9_\-]+$`, `<= 128` or `<= 260` for composite chat/follow IDs). Every string field enforces `.size() <= MAX`. Arrays are bounded (`<= 2` for DM participants, `<= 10` for song features, `<= 60` for release tracklists).
6. **Temporal Integrity**: All server timestamps (`createdAt`, `updatedAt`) must equal `request.time`.
7. **Verified Writes**: Every write operation requires `request.auth != null && request.auth.token.email_verified == true`.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Identity Spoofing (Artist)**: User B attempts to create `/onlineArtists/userA` with `{ uid: "userA", ... }`. Expected: `PERMISSION_DENIED`.
2. **Identity Spoofing (Song)**: User B attempts to create `/onlineSongs/song1` with `{ ownerUid: "userA", ... }`. Expected: `PERMISSION_DENIED`.
3. **Shadow Update / Ghost Field**: User A attempts to update `/onlineArtists/userA` adding `{ isSystemAdmin: true }`. Expected: `PERMISSION_DENIED`.
4. **ID Poisoning**: User A attempts to write `/onlineSongs/../../etc/passwd` or a 500-char ID. Expected: `PERMISSION_DENIED`.
5. **Value Poisoning (Oversized String)**: User A writes an `OnlineXPost` with `content` length > 1000 characters. Expected: `PERMISSION_DENIED`.
6. **Temporal Forgery**: User A writes an `OnlineXPost` with `createdAt: new Date(2010, 0, 1)` instead of `request.time`. Expected: `PERMISSION_DENIED`.
7. **Unverified Email Write**: An unverified account (`email_verified: false`) attempts to create an artist profile. Expected: `PERMISSION_DENIED`.
8. **Private Save Snooping**: User B attempts `get` or `list` on `/saves/userA`. Expected: `PERMISSION_DENIED`.
9. **DM Eavesdropping**: User C attempts to `get` or `list` `/onlineChats/userA_userB/messages` when `userC` is not in `participantUids`. Expected: `PERMISSION_DENIED`.
10. **Clock Tampering**: User A attempts to `update` `/world/clock` to skip ahead 100 years. Expected: `PERMISSION_DENIED`.
11. **Unbounded Array Attack**: User A attempts to create an `OnlineChat` with 25 `participantUids`. Expected: `PERMISSION_DENIED`.
12. **Blanket Query Scraping on Private Data**: User B runs an unfiltered `list` query on `/onlineChats` without matching `participantUids`. Expected: `PERMISSION_DENIED`.
