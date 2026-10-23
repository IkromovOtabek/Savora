# Jonli ovoz yozuvini reels'ga joylash: tozalash -> jumlalarga bo'lish -> vaqtlarga moslash -> musiqa bilan aralashtirish.
# Ishlatish: .venv/bin/python src/real_voice.py <yozuv.m4a|mp3|ogg|wav> <loyiha-papka>
# Loyiha papkasida voice_slots.json bo'lishi kerak: {"duration": 22, "slots": [[start, max_len, "matn"], ...]}
# Natija: <loyiha>/assets/audio/vo.wav va mix.wav (VO + sidechain-ducked musiqa, -14 LUFS).
import json
import re
import subprocess
import sys
from pathlib import Path

SR = 48000
MAX_TEMPO = 1.2   # bundan ortiq tezlashtirish sun'iy eshitiladi
PAD = 0.04        # jumla chetlariga qo'shiladigan zaxira (s)


def ff(*args):
    subprocess.run(['ffmpeg', '-y', '-v', 'error', *args], check=True)


def dur(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(path)],
                         capture_output=True, text=True, check=True).stdout
    return float(out.strip())


def speech_segments(path, total):
    log = subprocess.run(['ffmpeg', '-v', 'info', '-i', str(path), '-af', 'silencedetect=noise=-38dB:d=0.4', '-f', 'null', '-'],
                         capture_output=True, text=True).stderr
    starts = [float(x) for x in re.findall(r'silence_start: ([\d.]+)', log)]
    ends = [float(x) for x in re.findall(r'silence_end: ([\d.]+)', log)]
    segs, cur = [], 0.0
    for s, e in zip(starts, ends + [total] * (len(starts) - len(ends))):
        if s - cur > 0.25:
            segs.append([cur, s])
        cur = e
    if total - cur > 0.25:
        segs.append([cur, total])
    return segs


def main():
    src, proj = Path(sys.argv[1]), Path(sys.argv[2])
    cfg = json.loads((proj / 'voice_slots.json').read_text())
    slots, total_len = cfg['slots'], cfg['duration']
    work = proj / 'vo' / 'real'
    work.mkdir(parents=True, exist_ok=True)
    audio = proj / 'assets' / 'audio'

    # 1) tozalash: past shovqin, xona shovqini, sibilyant, kompressor, balandlik
    clean = work / 'clean.wav'
    ff('-i', str(src), '-af',
       'highpass=f=80,afftdn=nf=-28:tn=1,deesser=i=0.4,'
       'equalizer=f=200:t=q:w=1.2:g=-2,equalizer=f=3500:t=q:w=1.5:g=2.5,'
       'acompressor=threshold=-22dB:ratio=3:attack=5:release=90:makeup=2,'
       'loudnorm=I=-16:TP=-1.5:LRA=7',
       '-ar', str(SR), '-ac', '1', str(clean))

    # 2) jumlalarga bo'lish (jumla ichidagi qisqa pauzalar eng yaqin qo'shnisi bilan birlashtiriladi)
    segs = speech_segments(clean, dur(clean))
    n = len(slots)
    while len(segs) > n:
        gaps = [segs[i + 1][0] - segs[i][1] for i in range(len(segs) - 1)]
        i = gaps.index(min(gaps))
        segs[i:i + 2] = [[segs[i][0], segs[i + 1][1]]]
    if len(segs) < n:
        sys.exit(f"XATO: yozuvda {len(segs)} ta jumla topildi, {n} ta kerak. Jumlalar orasida ~1 s jim turing.")

    # 3) har jumlani o'z vaqtiga moslash
    parts, report = [], []
    for k, ((a, b), (start, max_len, text)) in enumerate(zip(segs, slots), 1):
        a, b = max(0.0, a - PAD), b + PAD
        length = b - a
        tempo = 1.0
        if length > max_len:
            tempo = min(length / max_len, MAX_TEMPO)
        f = f'atempo={tempo:.4f},' if tempo > 1.001 else ''
        out = work / f'r{k}.wav'
        ff('-ss', f'{a:.3f}', '-to', f'{b:.3f}', '-i', str(clean), '-af',
           f'{f}afade=t=in:d=0.015,areverse,afade=t=in:d=0.04,areverse', '-ar', str(SR), '-ac', '1', str(out))
        final = dur(out)
        flag = '  <-- SIG\'MAYAPTI, tezroq o\'qing' if final > max_len + 0.05 else ''
        report.append(f'{k:2}. {start:5.2f}s  {final:4.2f}/{max_len:4.2f}s  x{tempo:.2f}  {text}{flag}')
        parts.append((out, start))

    # 4) vo.wav — hammasi bitta 22 s trekka
    inputs, chains = [], []
    for i, (p, st) in enumerate(parts):
        inputs += ['-i', str(p)]
        ms = int(st * 1000)
        chains.append(f'[{i}]adelay={ms}|{ms}[a{i}]')
    mix_in = ''.join(f'[a{i}]' for i in range(len(parts)))
    ff(*inputs, '-filter_complex',
       ';'.join(chains) + f';{mix_in}amix=inputs={len(parts)}:normalize=0,apad=whole_dur={total_len},atrim=0:{total_len}',
       '-ar', str(SR), '-ac', '1', str(audio / 'vo.wav'))

    # 5) musiqa bilan aralashtirish (ovoz paytida musiqa pasayadi)
    ff('-i', str(audio / 'music.wav'), '-i', str(audio / 'vo.wav'), '-filter_complex',
       '[1:a]aformat=channel_layouts=stereo,volume=1.4,asplit=2[vo][sc];[0:a]volume=-6dB[m];'
       '[m][sc]sidechaincompress=threshold=0.03:ratio=8:attack=15:release=350:makeup=1[md];'
       '[md][vo]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.0:LRA=9',
       '-ar', str(SR), '-ac', '2', str(audio / 'mix.wav'))

    print('\n'.join(report))
    print('tayyor:', audio / 'mix.wav')


if __name__ == '__main__':
    main()
