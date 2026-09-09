# Platform trophies

Each installed game's main menu includes Trophies. The list shows every achievement returned
by the platform, its unlock state when available, and the percentage of that platform's players
who earned it. Selecting a row displays its full description and unlock date. Missing percentages
and private or unknown unlock states are explicitly unavailable. A real zero remains 0%.

Steam reads its public global achievements page and the currently selected Steam user's public
achievement XML. No API key is needed. The local binary stats schema and player cache provide a
fallback. A cache with an uninitialized CRC does not establish locked achievements. Login selection
uses Steam's MostRecent account flag, or a sole cached account; ambiguous accounts remain anonymous.
Network calls are bounded, and failures do not block launching games or entering Options.

GOG support reads the Galaxy client database in read-only mode. Only matching `gog_` releases are
included, using exact title/edition matching. Definitions, localized descriptions, rarity and known
user unlocks come from Galaxy's local cache. Open Galaxy to refresh that cache. Editions without
Galaxy achievements produce no GOG list. Other storefronts are not currently connected. Providers
share `AchievementSource`, so further platform readers can be added without replacing the menu.

Steam snapshots are cached under the hub data directory, partitioned by Steam root and account.
Refresh bypasses the five-minute freshness window. Offline results are marked cached. Images are
restricted to HTTPS platform image hosts and have a drawn fallback if unavailable. Platform metadata
and icons are fetched at runtime and are never committed as fixtures or packaged game assets.

Sources: [Steam statistics API](https://partner.steamgames.com/doc/webapi/ISteamUserStats),
[Steam community achievements](https://steamcommunity.com/stats/2131630/achievements/?l=english),
[GOG achievements](https://docs.gog.com/sdk-stats-and-achievements/),
[Node read-only SQLite access](https://nodejs.org/api/sqlite.html).
