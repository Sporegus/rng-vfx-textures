# NOVA idle animation v1

A real 8-second looping idle: 480 frames at 60 fps, 600 x 800 canvas. This is a 20% runtime export of the 3000 x 4000 composition; Nova is approximately 680 px tall. The full-resolution layered artwork remains in NOVA_Talking_v4.zip.

Files:
- NOVA_Idle_Preview.mp4: 60 fps preview on a dark blue background.
- NOVA_Idle_Transparent.webm: 60 fps VP9 video with alpha for a compatible desktop renderer.
- NOVA_Idle.gif: lightweight 24 fps, 360 x 480 transparent preview.
- assets/: neutral and blink textures.
- source/render.cjs: editable deterministic animation renderer.
- source/export.sh: export commands for ffmpeg.

Motion: gentle chest breathing, head sway, delayed side-hair and antenna movement, sleeve drift and fixed feet. Continuous local deformation is applied to the assembled artwork, avoiding separation gaps. Two quick closed-eye pose swaps occur at 2.30 and 6.05 seconds; the eyelids are not yet continuously deformable. Mouth remains neutral during idle.

This is an animation preview and usable pre-rendered loop, not a native Live2D/Cubism rig or a completed articulated model. It does not provide independent reactive gaze, speech, head turning or arm gestures. Those require further rigging. Large motion is deliberately avoided because hidden overlaps remain unfinished.

To regenerate: install Node.js, sharp and ffmpeg; run `node source/render.cjs` from the package, then `sh source/export.sh` (a POSIX shell is needed for the export script). On Windows, the two ffmpeg commands in export.sh can be run individually after changing to this folder. The generated frames are not bundled to keep the download small.

For desktop integration, loop the transparent WebM without a gap, preserve its aspect ratio and alpha, and use the MP4 only as a viewing reference. Transparency depends on the video decoder used by the target app; this package was checked with ffmpeg's libvpx decoder, not inside your desktop assistant.
