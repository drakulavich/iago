# gh-pages — iago website

Static site for [iago](https://github.com/drakulavich/iago), served by GitHub Pages from this branch.

## Layout

```
index.html    # landing page
404.html      # not-found page
.nojekyll     # tells Pages to skip Jekyll and serve files as-is
```

## Local preview

No build step. Just open the file or serve the directory:

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

## Editing

The whole site is one file (`index.html`) with inline CSS, SVG, and JS. No dependencies, no build pipeline.
