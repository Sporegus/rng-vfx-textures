# Training Nova her own voice

Right now Nova's free voice copies your ElevenLabs voice from a 5-second clip
each time she talks. Training teaches a voice model her voice from about half an
hour of her talking, so it sounds like her for everything, including chats, with
no credits ever again.

**What it takes:** one month of ElevenLabs (Starter, $6, is enough: the
recordings use about 23,000 credits), your PC with its NVIDIA graphics card, and
an afternoon or evening of the PC working by itself.

**Before you start:** read ElevenLabs' terms about using the audio they make to
train another voice model, especially if you'll share or sell Nova.

| Step | Where | How long |
|---|---|---|
| 1. Subscribe to ElevenLabs | ElevenLabs website | 2 min |
| 2. Give Nova your API key | Nova | 2 min |
| 3. Record her sentences | Windows terminal | 20 to 40 min (by itself) |
| 4. Check the recordings | Windows terminal | 5 to 10 min |
| 5. Install WSL (Linux on Windows) | PowerShell | 10 min + a restart |
| 6. Set up training | WSL | 20 to 40 min (by itself) |
| 7. Train | WSL | 3 to 6 hours (by itself) |
| 8. Listen | Nova | 5 min |

## 1. Subscribe

On elevenlabs.io, pick **Starter** (or Creator for more room). The free plan
can't be used for this: its audio isn't licensed for this kind of use.

## 2. Give Nova your API key

In ElevenLabs: profile picture > **API Keys** > **Create API Key**. Copy it.
In Nova: tray icon > **Voice** > **Set up my ElevenLabs voice...**, paste the
key, keep the voice ID (it's already your Nova voice), pick any model.
Nova keeps the key encrypted on your PC.

**Then switch her back:** tray > **Voice** > **Nova**. Setting up the key makes
her talk through ElevenLabs live, which spends credits on everything she says.
The recorder only needs the key to be saved.

## 3. Record her sentences

Open a terminal in the `nova` folder (in File Explorer, open the `nova` folder,
click the address bar, type `cmd`, press Enter), then:

```
npm run voice-record
```

It shows what it will record (243 recordings of 480 sentences in all 10 moods)
and how many credits it takes. To start:

```
npm run voice-record -- --go
```

Leave it running. The recordings go to `Documents\Nova voice training`. If it
stops (internet, credits), run the same command again: it carries on where it
stopped.

It uses ElevenLabs' Multilingual v2 model with the same settings as your clips
(speed 1, stability 50, similarity 75). To use another model, add its ID:
`npm run voice-record -- --go --model=eleven_v3`.

## 4. Check the recordings

```
npm run voice-check-data
```

It listens to every recording with Nova's ears and keeps only the ones where
every word came out right. If it lists any it couldn't use, delete those files
from `Documents\Nova voice training\wavs` and run step 3 again to redo just
those.

After this you can cancel the ElevenLabs subscription.

## 5. Install WSL

1. Update your NVIDIA driver (the NVIDIA app, or nvidia.com/drivers).
2. Open **PowerShell as administrator** (Start, type PowerShell, right-click, Run as administrator) and run:
   ```
   wsl --install
   ```
3. Restart the PC. An Ubuntu window opens: pick a Linux username and password
   (remember the password, setup asks for it).

## 6. Set up training

In File Explorer, open `nova\voice\training`, click the address bar, type `wsl`,
press Enter. A Linux terminal opens in that folder. Run:

```
bash setup.sh
```

It checks your graphics card, installs PyTorch and ZipVoice (about 8 GB, in
Linux), and downloads ZipVoice's starting models.

## 7. Train

In the same WSL terminal:

```
bash train.sh
```

Leave the PC on and plugged in. It shows its progress as it goes through 6
steps. If you need to stop it, press Ctrl+C and run `bash train.sh` again later:
finished steps are skipped. When it's done, it puts her new voice in Nova
(`%APPDATA%\Nova\models\nova-own-voice`).

If it says the graphics card is out of memory ("CUDA out of memory"), run `MAXDUR=25 bash train.sh` (finished steps are skipped).

## 8. Listen

Restart Nova: she uses her own voice now. To compare it with her old one, in the
Windows terminal (step 3):

```
npm run voice-sample
```

That saves `before.wav` and `after.wav` in `Documents\Nova voice training\samples`.
Send them to Claude to check her clarity, likeness and moods.

To go back to her old voice, delete the folder `%APPDATA%\Nova\models\nova-own-voice`.

## What each file here does

| File | Job |
|---|---|
| `sentences-*.txt` | What she records, one mood per file |
| `record.js` | Step 3: records them in your ElevenLabs voice |
| `check-data.js` | Step 4: keeps only the good recordings |
| `setup.sh`, `patch_zipvoice.py` | Step 6: installs ZipVoice and adds one option it needs |
| `train.sh` | Step 7: fine-tunes ZipVoice on her voice, makes its fast version, puts it in Nova |
| `sample.js` | Step 8: before/after samples |

How training works: ZipVoice (the model her voice uses now) first learns her
voice from the recordings. Then a fast copy of it is trained to talk in a few
steps, starting from ZipVoice's own fast model, so she can still talk live on
your PC. It's saved in the same format as her current voice, so Nova uses it as
it is.
