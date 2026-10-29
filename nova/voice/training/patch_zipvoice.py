# Adds one option to ZipVoice's distillation trainer: --student-model, the checkpoint
# the fast (distilled) model starts from. ZipVoice starts it from the teacher, which
# is right when training on a huge dataset for days; for Nova we start from ZipVoice's
# own released fast model, so it already knows how to talk in a few steps and only
# has to learn her voice from the teacher that was fine-tuned on her recordings.
# Run from the ZipVoice folder: python patch_zipvoice.py
import pathlib
import sys

f = pathlib.Path("zipvoice/bin/train_zipvoice_distill.py")
s = f.read_text()
if "--student-model" in s:
    print("already patched")
    sys.exit(0)

arg_anchor = '''    parser.add_argument(
        "--teacher-model",
        type=str,
        help="""Checkpoints of pre-trained teacher model""",
    )
'''
load_anchor = '''    _ = load_checkpoint(
        filename=params.teacher_model,
        model=model,
        strict=(params.distill_stage == "second"),
    )
'''
if arg_anchor not in s or load_anchor not in s:
    sys.exit("This ZipVoice version looks different from the one these scripts were written for (see setup.sh).")

s = s.replace(arg_anchor, arg_anchor + '''
    parser.add_argument(
        "--student-model",
        type=str,
        default=None,
        help="""Checkpoint the student starts from (default: the teacher model)""",
    )
''')
s = s.replace(load_anchor, '''    _ = load_checkpoint(
        filename=params.student_model or params.teacher_model,
        model=model,
        strict=(params.distill_stage == "second"),
    )
''')
f.write_text(s)
print("patched: --student-model added")
