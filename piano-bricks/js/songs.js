/* Piano Bricks — song data.
 *
 * Every stage is one phrase of 8 beats (two grid cells per beat on the board).
 *   melody: "NOTE[:beats] ..."  (R = rest, beats defaults to 1)
 *   chords: one chord per 2 beats, used for the accompaniment
 *   form:   stage order for the full-song playback (전곡 듣기)
 */
(function (PB) {
  'use strict';

  const PITCH_CLASS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  function noteToMidi(name) {
    const m = /^([A-G])([#b]?)(\d)$/.exec(name);
    if (!m) throw new Error('Bad note: ' + name);
    const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
    return (Number(m[3]) + 1) * 12 + PITCH_CLASS[m[1]] + acc;
  }

  function parseMelody(src) {
    let t = 0;
    const notes = [];
    src.trim().split(/\s+/).forEach((tok) => {
      const [name, beats] = tok.split(':');
      const len = beats ? Number(beats) : 1;
      if (name !== 'R') notes.push({ midi: noteToMidi(name), start: t, len });
      t += len;
    });
    return { notes, beats: t };
  }

  const QUALITY = { '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10] };

  function parseChord(name) {
    const m = /^([A-G][#b]?)(m|7)?$/.exec(name);
    if (!m) throw new Error('Bad chord: ' + name);
    const root = noteToMidi(m[1] + '3');
    return { bass: root - 12, notes: QUALITY[m[2] || ''].map((i) => root + i) };
  }

  PB.noteToMidi = noteToMidi;
  PB.parseMelody = parseMelody;
  PB.parseChord = parseChord;

  PB.SONGS = [
    {
      id: 'twinkle',
      title: '작은 별',
      en: 'Twinkle Twinkle Little Star',
      bpm: 100,
      stages: [
        { melody: 'E4 E4 B4 B4 C#5 C#5 B4:2', chords: 'E E A E' },
        { melody: 'A4 A4 G#4 G#4 F#4 F#4 E4:2', chords: 'A E B E' },
        { melody: 'B4 B4 A4 A4 G#4 G#4 F#4:2', chords: 'E A E B' }
      ],
      form: [0, 1, 2, 2, 0, 1]
    },
    {
      id: 'airplane',
      title: '비행기',
      en: 'Mary Had a Little Lamb',
      bpm: 112,
      stages: [
        { melody: 'F#4 E4 D4 E4 F#4 F#4 F#4:2', chords: 'D D D D' },
        { melody: 'E4 E4 E4:2 F#4 A4 A4:2', chords: 'A A D D' },
        { melody: 'E4 E4 F#4 E4 D4:4', chords: 'A A D D' }
      ],
      form: [0, 1, 0, 2]
    },
    {
      id: 'jingle',
      title: '징글벨',
      en: 'Jingle Bells',
      bpm: 132,
      stages: [
        { melody: 'F#4 F#4 F#4:2 F#4 F#4 F#4:2', chords: 'D D D D' },
        { melody: 'F#4 A4 D4:1.5 E4:0.5 F#4:4', chords: 'D D D D' },
        { melody: 'G4 G4 G4:1.5 G4:0.5 G4 F#4 F#4 F#4:0.5 F#4:0.5', chords: 'G G D D' },
        { melody: 'F#4 E4 E4 F#4 E4:2 A4:2', chords: 'E7 E7 A7 A7' },
        { melody: 'A4 A4 G4 E4 D4:4', chords: 'A7 A7 D D' }
      ],
      form: [0, 1, 2, 3, 0, 1, 2, 4]
    },
    {
      id: 'joy',
      title: '환희의 송가',
      en: 'Ode to Joy',
      bpm: 108,
      stages: [
        { melody: 'F#4 F#4 G4 A4 A4 G4 F#4 E4', chords: 'D D A A' },
        { melody: 'D4 D4 E4 F#4 F#4:1.5 E4:0.5 E4:2', chords: 'D D A A' },
        { melody: 'D4 D4 E4 F#4 E4:1.5 D4:0.5 D4:2', chords: 'D D A D' },
        { melody: 'E4 E4 F#4 D4 E4 F#4:0.5 G4:0.5 F#4 D4', chords: 'A D A D' },
        { melody: 'E4 F#4:0.5 G4:0.5 F#4 E4 D4 E4 A3:2', chords: 'A A D A' }
      ],
      form: [0, 1, 0, 2, 3, 4, 0, 2]
    }
  ];
})(window.PB = window.PB || {});
