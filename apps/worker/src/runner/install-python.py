"""Install wheel dependencies without importing or building the submitted project."""
import pathlib
import re
import subprocess
import sys
import tomllib

requirements = pathlib.Path("requirements.txt")
if requirements.exists():
    dependencies = [line.split(" #", 1)[0].strip() for line in requirements.read_text().splitlines()]
    dependencies = [line for line in dependencies if line and not line.startswith("#")]
else:
    with open("pyproject.toml", "rb") as source:
        dependencies = tomllib.load(source).get("project", {}).get("dependencies", [])
for dependency in dependencies:
    # Local paths, URLs and pip directives can bypass the wheel-only restriction.
    if not isinstance(dependency, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]*(?:\[[A-Za-z0-9_,.-]+\])?(?:\s*[<>=!~][A-Za-z0-9.*+<>=!~, -]+)?(?:\s*;[^\n\r]+)?", dependency):
        raise ValueError("Only named binary dependencies are supported")
subprocess.run([sys.executable, "-I", "-m", "pip", "--isolated", "install", "--only-binary=:all:", "--target", "/work/.br-deps", *dependencies, "pytest"], check=True)
