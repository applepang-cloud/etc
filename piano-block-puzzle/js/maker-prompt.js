// 노래 제목 → 멜로디를 AI에게 부탁하는 지시문. 게임(maker.js)과 코덱스 브리지(tools/codex-bridge.mjs)가 같이 쓴다.
// 저작권: 저작권이 끝난 곡만 원곡 멜로디로, 그 밖의 곡은 제목 분위기에 맞춘 새 멜로디로 만들게 한다.

const DIFFICULTY = {
  1: 'EASY: quarter notes or longer only (every note and rest lasts an even number of steps), mostly stepwise motion, range within 9 semitones, 8 bars.',
  2: 'NORMAL: mostly quarter notes with some eighth notes, small leaps allowed, range within 12 semitones, 12 bars.',
  3: 'HARD: many eighth notes, some syncopation and leaps, range within 14 semitones, 16 bars.',
};

export function promptFor(title, level) {
  return [
    'You write levels for "피아노 블록", a piano-roll puzzle game where the player covers the notes of a melody with blocks. The player typed a song title and wants a playable melody for it.',
    '',
    `Song title typed by the player: ${JSON.stringify(title)}`,
    '',
    'First decide which case applies:',
    '- "melody": the title clearly names a song whose melody is in the public domain: a traditional or folk song, nursery rhyme, old hymn or carol, or a classical piece whose composer died more than 70 years ago. Write its well-known main melody as faithfully as you can, transposed to C major or A minor when possible.',
    '- "original": anything else, including modern or possibly copyrighted songs and titles you do not recognize. Compose a NEW original melody that fits the mood and imagery of the title. Do not reproduce, quote or closely imitate any copyrighted melody.',
    '',
    `Difficulty: ${DIFFICULTY[level]} For a "melody" song keep the real tune (at most 16 bars of its main theme) and simplify its rhythm toward this difficulty.`,
    '',
    'Melody format, a single line of notes (no chords):',
    '- One step = one eighth note. A token is NOTE or NOTE:steps, for example C4 (eighth), E4:2 (quarter), G4:3 (dotted quarter), A4:4 (half), C5:8 (whole). R is a rest, for example R:2.',
    '- Note names use sharps (C#4, F#4) and octave numbers. Stay between G3 and E5.',
    '- Put " | " between bars. Each bar adds up to exactly 8 steps in 4/4, or 6 steps in 3/4 or 6/8.',
    '- End on the tonic with a long note.',
    '',
    'Reply with only this JSON object:',
    '{"source": "melody" or "original", "title": the usual Korean title of the song if it has one, otherwise the title as typed, "composer": composer or origin in Korean such as 독일 민요 or 모차르트 (창작 for original), "mood": a short Korean phrase about the melody under 20 characters, "bpm": quarter-note tempo from 60 to 150, "meter": 4 or 3 (3 for 3/4 and 6/8), "melody": "E4:2 D4:2 C4:2 D4:2 | E4:2 E4:2 E4:4 | ..."}',
  ].join('\n');
}
