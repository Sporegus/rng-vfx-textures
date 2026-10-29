# Nova: Live2D layered asset

Nova's neutral full body from her character sheet, cut into 137 aligned layers on a 3000 x 4000 transparent canvas,
with hidden overlap painted under every part and joint. Hologram-blue fill, black lines.

| File | What it is |
|---|---|
| `Nova_Live2D_Master.psd` | The layered master. 18 folders, 137 named layers. Hidden layers are alternate states and references. |
| `Nova_FullBody_Preview.png` | The visible layers stacked: neutral Nova on transparent. |
| `Nova_Expression_Preview.png` | 12 expressions, each made only by switching face parts. |
| `Nova_Pose_Test.png` | The layers turned at the joints (head, arms, elbows, wrists, legs, hair, halo). Pink would show any hole. |
| `Nova_Layer_Manifest.csv` | Every layer: folder, purpose, default visibility, where it came from, position, hidden-overlap size. |
| `Nova_Layer_Order.json`, `Nova_Expressions.json` | Stacking order; the show/hide recipe for each expression. |
| `Nova_Asset_Validation.txt` | The checklist with results, what was not produced and why, and what is still untested. |
| `Nova_Rig_Notes.md` | Joint positions, Cubism parameters, physics, lip sync, import steps, limitations. |
| `Nova_Exported_Layers/` | Every layer as a full-canvas 3000 x 4000 PNG, numbered bottom to top. |
| `Nova_Reference_Sheet_Original.png` | The character sheet these were made from. |
| `source/` | The scripts that made all of this (`bash source/run_all.sh` rebuilds it). |

**L / R in names are her left and right** (her left is on the viewer's right).

Not done yet: the Cubism Editor import and rig. That needs Cubism on a Windows or Mac PC; the steps are in `Nova_Rig_Notes.md`.
