"""
Synthesized sfx (ours, CC0): the new-order shop bell and the delivery chime.

  python3 scripts/make-sfx.py public/assets/sfx

Writes mono 44.1 kHz .wav files; convert to mp3 with ffmpeg (see public/assets/sfx/README.md).
"""
import math, os, random, struct, sys, wave

RATE = 44100


def render(notes, partials, length, level):
    """notes: (start s, Hz, strength); partials: (ratio, amp, decay per s). Returns normalized samples."""
    n = int(RATE * length)
    out = [0.0] * n
    for start, f0, strength in notes:
        s0 = int(start * RATE)
        for i in range(s0, n):
            t = (i - s0) / RATE
            attack = min(1.0, t / 0.003)
            v = sum(amp * math.exp(-decay * t) * math.sin(2 * math.pi * f0 * ratio * t) for ratio, amp, decay in partials)
            out[i] += strength * attack * v
    peak = max(abs(x) for x in out)
    fade = int(0.03 * RATE)
    return [level * min(1.0, (n - i) / fade) * x / peak for i, x in enumerate(out)]


def save(path, samples):
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(b''.join(struct.pack('<h', int(32767 * x)) for x in samples))


# Small brass bell over a shop door: inharmonic partials, a few clattering strikes.
random.seed(7)
BELL = [(1.0, 1.0, 5.0), (2.76, 0.45, 9.0), (5.40, 0.22, 16.0), (8.93, 0.10, 24.0)]
bell_strikes = [(0.00, 2093, 1.0), (0.09, 2217, 0.7), (0.17, 2093, 0.55), (0.27, 2349, 0.4), (0.40, 2217, 0.25)]
bell_strikes = [(s, f * (1 + random.uniform(-0.004, 0.004)), g) for s, f, g in bell_strikes]

# Delivery chime: soft, almost pure tone (glass/marimba-ish), fast decay so it never lingers.
SOFT = [(1.0, 1.0, 14.0), (2.0, 0.12, 22.0), (3.0, 0.04, 30.0)]
CHIMES = {
    # Rising fifth, quick: "pi-ling".
    'chime-a': ([(0.00, 1319, 0.8), (0.07, 1976, 1.0)], 0.30),
    # Rising major third, a bit lower and rounder.
    'chime-b': ([(0.00, 1047, 0.8), (0.08, 1319, 1.0)], 0.32),
    # Single soft pling.
    'chime-c': ([(0.00, 1568, 1.0)], 0.22),
}

if __name__ == '__main__':
    out = sys.argv[1]
    save(os.path.join(out, 'orderOpened.wav'), render(bell_strikes, BELL, 1.6, 0.7))
    for name, (notes, length) in CHIMES.items():
        save(os.path.join(out, f'{name}.wav'), render(notes, SOFT, length, 0.6))
