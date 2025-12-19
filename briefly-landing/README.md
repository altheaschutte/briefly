# Briefly landing site

Astro + Tailwind marketing site for Briefly, an AI-powered personalized news/podcast generator. The site is fully static and ready for S3 static website hosting.

## Commands

- `npm install` - install dependencies
- `npm run dev` - start the dev server at `http://localhost:4321`
- `npm run build` - build the static site into `dist/`
- `npm run preview` - preview the production build locally

## Deploying to S3

1. Install dependencies and build: `npm install` then `npm run build`.
2. Create an S3 bucket and enable static website hosting.
3. Upload the contents of `dist/` to the bucket (maintain the folder structure).
4. Set the index document to `index.html`.
5. (Optional) Put CloudFront in front of the bucket for custom domain + HTTPS.
