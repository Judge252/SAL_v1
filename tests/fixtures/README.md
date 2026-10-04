# Synthetic microphone fixtures

These WAV files contain software verification speech, produced locally using
Windows `System.Speech.Synthesis.SpeechSynthesizer` with Microsoft David Desktop
(English) and Microsoft Hoda Desktop (Arabic). They contain no patient recordings.

- `speech-en.wav`: routine stomach discomfort, including a two-week duration.
- `interrupt-en.wav`: interruption and the detail that it is worse after meals.
- `context-en.wav`: asks SAL to recall duration and aggravating factors after reconnection.
- `speech-ar.wav`: an Arabic concern for input and output language verification.
- `urgent-en.wav`: synthetic urgent symptoms for emergency guidance verification.

Playwright replaces only microphone input with these files. It still runs the
application's AudioWorklet and PCM streaming, the real Google SDK/WebSocket,
provider transcriptions and audio, secure server tools, Supabase persistence,
and Web Audio playback. Physical microphone acoustics, echo cancellation, and
human intelligibility require a separate device check.
