# Khalid Meitani — academic website

A fast, responsive, single-page academic website that can be hosted free with
GitHub Pages. It uses plain HTML, CSS, and JavaScript, so there is no build
process and no package installation.

## Preview it locally

From this directory, run:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Personalize the content

See `CONTENT_GUIDE.md` for exact instructions and copy-paste examples for
adding a profile photo, CV, research figures, and local or hosted videos.

## Publish on GitHub Pages

1. Create a new public GitHub repository named `khalidmeitani.github.io`.
2. Push the contents of this folder to the repository's `main` branch.
3. In GitHub, open **Settings → Pages**.
4. Under **Build and deployment**, select **Deploy from a branch**.
5. Select the `main` branch and `/ (root)`, then save.

The site address will be `https://khalidmeitani.github.io/`.

## Connect a domain and Google

After purchasing a domain:

1. Add it under **Settings → Pages → Custom domain**.
2. Configure the DNS records shown by GitHub.
3. Replace `khalidmeitani.github.io` in the metadata, `robots.txt`, and
   `sitemap.xml` with the custom domain.
4. Add the domain to Google Search Console.
5. Submit `/sitemap.xml` and request indexing for the homepage.

## Updating

Edit the files, commit the changes, and push. GitHub Pages updates
automatically. Keep private details, unpublished papers, API keys, and other
secrets out of the repository.
