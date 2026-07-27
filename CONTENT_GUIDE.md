# Adding content to Khalid's website

You can send new files and information to Codex and ask for an update, or edit
`index.html` directly. Keep filenames lowercase and use hyphens instead of
spaces, for example `soft-gripper-test.jpg`.

## Add a profile photo

1. Put the photo in `assets/images/profile.jpg`.
2. In `index.html`, find:

```html
src="assets/profile-placeholder.svg"
```

3. Change it to:

```html
src="assets/images/profile.jpg"
```

A portrait-oriented JPG or WebP works best. Crop it roughly from the chest
upward and keep the original file reasonably compressed.

## Add or replace the CV

Place the PDF at:

```text
assets/documents/khalid-meitani-cv.pdf
```

The existing CV buttons already point to that location.

## Add a research figure

Put image files in `assets/images/figures/`. PNG is best for diagrams and plots;
JPG or WebP is usually better for photographs.

Copy this example into the desired section of `index.html`:

```html
<figure class="research-figure">
  <img
    src="assets/images/figures/soft-gripper.jpg"
    alt="Three-finger 3D-printed TPU soft gripper holding a delicate object"
  />
  <figcaption>
    A concise explanation of what the figure shows and why it matters.
  </figcaption>
</figure>
```

Always write useful `alt` text that describes the scientific content.

## Add a video file

Short, compressed MP4 or WebM files can be stored in `assets/videos/`. Add:

```html
<video class="research-video" controls preload="metadata">
  <source src="assets/videos/crawling-robot-demo.mp4" type="video/mp4" />
  Your browser does not support embedded video.
</video>
```

H.264 MP4 is the safest format for browser compatibility. Keep local files
small: GitHub blocks ordinary Git files above 100 MiB, and large videos make the
site slow. For long or high-resolution recordings, upload to YouTube instead
and embed the video.

## Embed a YouTube video

Replace `VIDEO_ID` with the part after `youtu.be/` or `watch?v=`:

```html
<div class="video-embed">
  <iframe
    src="https://www.youtube-nocookie.com/embed/VIDEO_ID"
    title="Descriptive title of the research video"
    loading="lazy"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen
  ></iframe>
</div>
```

## Publish an update

After making changes:

```bash
git add .
git commit -m "Update research media"
git push
```

GitHub Pages will update automatically after the push.
