export const musicQuotes: string[] = [
  "A good beat can reset an entire day.",
  "Every playlist is a tiny time machine.",
  "Volume up, worries down.",
  "Songs remember moments better than photos.",
  "The bass line is where confidence lives.",
  "Great hooks are impossible to outrun.",
  "Music is the fastest way to switch moods.",
  "One chorus can turn strangers into a crowd.",
  "Rhythm is just organized energy.",
  "A perfect transition feels like magic.",
  "Melody is memory with better timing.",
  "Some songs are better than coffee.",
  "The drop is a promise kept.",
  "Good headphones are a personality upgrade.",
  "Every era has its own drum pattern.",
  "Music makes waiting feel shorter.",
  "A replay button is a compliment.",
  "Harmony is teamwork you can hear.",
  "Silence is only there to frame the next note.",
  "Great songs age in reverse.",
  "The right track can make any road feel cinematic.",
  "Tempo is the pulse of a room.",
  "A guitar riff can say more than a paragraph.",
  "Lyrics hit hardest when they feel personal.",
  "Music turns noise into meaning.",
  "A groove is just momentum with style.",
  "Chorus first, overthinking later.",
  "Every DJ is also a storyteller.",
  "Music is the original social network.",
  "The best playlists have zero filler.",
  "Rhythm keeps the room honest.",
  "A warm synth can feel like sunlight.",
  "Songs can make old memories feel brand new.",
  "The first note sets the weather.",
  "Sometimes the bridge is the best part.",
  "Music gives awkward moments an exit.",
  "Good timing beats perfect timing.",
  "A crowd singing together is instant unity.",
  "The right song can make cleanup feel heroic.",
  "Low-end frequencies solve more than they should.",
  "A tune stuck in your head is a tiny souvenir.",
  "Music is motion even while standing still.",
  "The best intros pull you in immediately.",
  "Energy up, faders up.",
  "An encore is just gratitude with amplification.",
  "Songs are tiny worlds with repeat access.",
  "Music makes confidence louder.",
  "Your mood has a matching soundtrack.",
  "Every favorite song was once a first listen.",
  "There is no wrong dance when the beat is right.",
];

function stringHash(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function pickMusicQuote(seed: string) {
  const hash = stringHash(seed);
  return musicQuotes[hash % musicQuotes.length]!;
}
