"""Compare the official Pages responses with the checked-out release."""
from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
from pathlib import Path
import os
import posixpath
import re
import subprocess
from time import monotonic, sleep
from urllib.parse import urljoin, urlsplit
from urllib.request import Request, urlopen


base_url = os.environ["SPA_URL"]
tracked = subprocess.check_output(
    ["git", "ls-files", "-z", "--", "index.html", "preview-v02.html", "spa.css",
     "spa.js", "assets/*", "phase0[345]/*.mjs"],
    text=True,
).split("\0")
paths = {name for name in tracked if name and not name.endswith(".test.mjs")}
urls = {name: name for name in paths}
urls[""] = "index.html"

# Check the exact cache keys used in production as well as plain file URLs.
for name in sorted(paths):
    if not name.endswith((".html", ".css", ".js", ".mjs")):
        continue
    for reference in re.findall(r"[\w./-]+\?v=[\w.-]+", Path(name).read_text()):
        path = urlsplit(reference).path
        relative = posixpath.normpath(posixpath.join(posixpath.dirname(name), path))
        for resolved in (relative, "assets/" + path):
            if resolved in paths:
                urls[resolved + "?" + urlsplit(reference).query] = resolved
                break


def verify(item, deadline):
    path, name = item
    expected = Path(name).read_bytes()
    url = urljoin(base_url, path)
    request = Request(url, headers={"Cache-Control": "no-cache"})
    problem = ""
    while monotonic() < deadline:
        try:
            with urlopen(request, timeout=10) as response:
                actual = response.read()
            if actual == expected:
                return f"Verified {path or '/'} {sha256(expected).hexdigest()}"
            problem = f"expected {sha256(expected).hexdigest()}, got {sha256(actual).hexdigest()}"
        except OSError as error:
            problem = str(error)
        sleep(5)
    raise SystemExit(f"Pages mismatch at {url}: {problem}")


print(verify(("", "index.html"), monotonic() + 300), flush=True)
del urls[""]
deadline = monotonic() + 300
with ThreadPoolExecutor(max_workers=8) as pool:
    for result in pool.map(lambda item: verify(item, deadline), sorted(urls.items())):
        print(result, flush=True)
