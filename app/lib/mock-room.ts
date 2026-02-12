export type MockPlayer = {
  id: string;
  name: string;
  color: string;
};

export const mockPlayers: MockPlayer[] = [
  { id: "alex", name: "Alex", color: "#4ec7e0" },
  { id: "sam", name: "Sam", color: "#f28d35" },
  { id: "lena", name: "Lena", color: "#e45395" },
  { id: "chris", name: "Chris", color: "#7bcf4b" },
];

export const roundAnswer = {
  title: "Blinding Lights",
  artist: "The Weeknd",
  year: 2019,
};

export const leaderboard = [
  { playerId: "alex", points: 1200, place: "1st" },
  { playerId: "lena", points: 900, place: "2nd" },
  { playerId: "sam", points: 700, place: "3rd" },
  { playerId: "chris", points: 400, place: "4th" },
];

export const preloadChecks = [
  "Game pack loaded",
  "Autocomplete loaded",
  "Audio buffer ready",
];
