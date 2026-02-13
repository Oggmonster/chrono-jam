export type MockRound = {
  id: string;
  trackId: string;
  artistId: string;
  title: string;
  artist: string;
  year: number;
  spotifyUri: string;
  startMs: number;
};

export const mockRounds: MockRound[] = [
  {
    id: "r1",
    trackId: "0VjIjW4GlUZAMYd2vXMi3b",
    artistId: "1Xyo4u8uXC1ZmMpatF05PJ",
    title: "Blinding Lights",
    artist: "The Weeknd",
    year: 2019,
    spotifyUri: "spotify:track:0VjIjW4GlUZAMYd2vXMi3b",
    startMs: 42000,
  },
  {
    id: "r2",
    trackId: "2Fxmhks0bxGSBdJ92vM42m",
    artistId: "6qqNVTkY8uBg9cP3Jd7DAH",
    title: "bad guy",
    artist: "Billie Eilish",
    year: 2019,
    spotifyUri: "spotify:track:2Fxmhks0bxGSBdJ92vM42m",
    startMs: 28000,
  },
  {
    id: "r3",
    trackId: "7qiZfU4dY1lWllzX7mPBI3",
    artistId: "6eUKZXaKkcviH0Ku9w2n3V",
    title: "Shape of You",
    artist: "Ed Sheeran",
    year: 2017,
    spotifyUri: "spotify:track:7qiZfU4dY1lWllzX7mPBI3",
    startMs: 34000,
  },
  {
    id: "r4",
    trackId: "32OlwWuMpZ6b0aN2RZOeMS",
    artistId: "3hv9jJF3adDNsBSIQDqcjp",
    title: "Uptown Funk",
    artist: "Mark Ronson ft. Bruno Mars",
    year: 2014,
    spotifyUri: "spotify:track:32OlwWuMpZ6b0aN2RZOeMS",
    startMs: 41000,
  },
  {
    id: "r5",
    trackId: "69kOkLUCkxIZYexIgSG8rq",
    artistId: "4tZwfgrHOc3mvqYlEYSvVi",
    title: "Get Lucky",
    artist: "Daft Punk",
    year: 2013,
    spotifyUri: "spotify:track:69kOkLUCkxIZYexIgSG8rq",
    startMs: 50000,
  },
];

export const preloadChecks = [
  "Game pack loaded",
  "Autocomplete loaded",
  "Audio buffer ready",
];

export const leaderboard = [
  { playerId: "alex", points: 1200, place: "1st" },
  { playerId: "lena", points: 900, place: "2nd" },
  { playerId: "sam", points: 700, place: "3rd" },
  { playerId: "chris", points: 400, place: "4th" },
];
