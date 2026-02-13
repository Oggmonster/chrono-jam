import { buildAutocompleteIndex, type AutocompleteEntry } from "~/lib/autocomplete";
import { mockRounds } from "~/lib/mock-room";

const baseTrackEntries: AutocompleteEntry[] = [
  { id: "bt-1", display: "Rolling in the Deep" },
  { id: "bt-2", display: "Mr. Brightside" },
  { id: "bt-3", display: "Levitating" },
  { id: "bt-4", display: "Smells Like Teen Spirit" },
  { id: "bt-5", display: "Take On Me" },
  { id: "bt-6", display: "Hotel California" },
  { id: "bt-7", display: "Billie Jean" },
  { id: "bt-8", display: "I Wanna Dance with Somebody" },
  { id: "bt-9", display: "Firework" },
  { id: "bt-10", display: "Wonderwall" },
  { id: "bt-11", display: "Viva La Vida" },
  { id: "bt-12", display: "Dancing Queen" },
  { id: "bt-13", display: "Clocks" },
  { id: "bt-14", display: "Watermelon Sugar" },
  { id: "bt-15", display: "Shallow" },
  { id: "bt-16", display: "Bohemian Rhapsody" },
  { id: "bt-17", display: "Royals" },
  { id: "bt-18", display: "Seven Nation Army" },
  { id: "bt-19", display: "Hips Dont Lie" },
  { id: "bt-20", display: "Toxic" },
];

const baseArtistEntries: AutocompleteEntry[] = [
  { id: "ba-1", display: "Adele" },
  { id: "ba-2", display: "The Killers" },
  { id: "ba-3", display: "Dua Lipa" },
  { id: "ba-4", display: "Nirvana" },
  { id: "ba-5", display: "a-ha" },
  { id: "ba-6", display: "Eagles" },
  { id: "ba-7", display: "Michael Jackson" },
  { id: "ba-8", display: "Whitney Houston" },
  { id: "ba-9", display: "Katy Perry" },
  { id: "ba-10", display: "Oasis" },
  { id: "ba-11", display: "Coldplay" },
  { id: "ba-12", display: "ABBA" },
  { id: "ba-13", display: "Harry Styles" },
  { id: "ba-14", display: "Lady Gaga" },
  { id: "ba-15", display: "Queen" },
  { id: "ba-16", display: "Lorde" },
  { id: "ba-17", display: "The White Stripes" },
  { id: "ba-18", display: "Shakira" },
  { id: "ba-19", display: "Britney Spears" },
  { id: "ba-20", display: "Daft Punk" },
];

export function buildMockAutocompletePack() {
  const roundTracks: AutocompleteEntry[] = mockRounds.map((round) => ({
    id: round.trackId,
    display: round.title,
  }));

  const roundArtists: AutocompleteEntry[] = mockRounds.map((round) => ({
    id: round.artistId,
    display: round.artist,
  }));

  return {
    tracks: buildAutocompleteIndex([...roundTracks, ...baseTrackEntries]),
    artists: buildAutocompleteIndex([...roundArtists, ...baseArtistEntries]),
  };
}
