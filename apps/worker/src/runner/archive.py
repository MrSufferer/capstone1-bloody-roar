"""Extract bounded regular files only. Never follow archive links or write git config."""
import os
import pathlib
import stat
import sys
import tarfile
import zipfile

archive, destination = sys.argv[1:3]
root = pathlib.Path(destination)
root.mkdir(parents=True, exist_ok=True)
seen, total = set(), 0
limit = int(sys.argv[3]) if len(sys.argv) > 3 else 200 * 1024 * 1024
written = 0

def target(name, size, is_dir, is_regular):
    global total
    parts = name.removeprefix("./").rstrip("/").split("/")
    if parts == ["."] or parts == [""]:
        return None
    if (name.startswith("/") or "\\" in name or ":" in name or "\x00" in name
            or any(p in ("..", ".git", "") for p in parts) or not is_regular):
        raise ValueError("Unsafe archive entry: " + name[:100])
    key = "/".join(parts)
    total += size
    if key in seen or len(seen) >= 20000 or total > limit:
        raise ValueError("Archive exceeds file/size limits or has duplicate entries")
    seen.add(key)
    return root.joinpath(*parts)

def write(path, reader, is_dir, executable=False):
    global written
    if path is None:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    if is_dir:
        path.mkdir(exist_ok=True)
    else:
        with open(path, "xb") as out:
            while chunk := reader.read(65536):
                written += len(chunk)
                if written > limit:
                    raise ValueError("Archive exceeds actual size limit")
                out.write(chunk)
        path.chmod(0o777 if executable else 0o666)

if zipfile.is_zipfile(archive):
    with zipfile.ZipFile(archive) as z:
        entries = [(entry, target(entry.filename, entry.file_size, entry.is_dir(),
                   not stat.S_ISLNK(entry.external_attr >> 16))) for entry in z.infolist()]
        for entry, path in entries:
            with z.open(entry) as stream:
                write(path, stream, entry.is_dir(), bool(entry.external_attr >> 16 & 0o111))
else:
    with tarfile.open(archive, "r:gz") as tar:
        entries = [(entry, target(entry.name, entry.size, entry.isdir(), entry.isfile() or entry.isdir())) for entry in tar]
        for entry, path in entries:
            write(path, tar.extractfile(entry) if entry.isfile() else None, entry.isdir(), bool(entry.mode & 0o111))
for directory, _, _ in os.walk(root):
    pathlib.Path(directory).chmod(0o777)
