# Deploy Ant Kingdom to AWS Amplify Hosting

Ant Kingdom is a **static** HTML/CSS/JavaScript ES-module site. The Node development server (`npm start`) is **not** required in production. The hosting artifact is `dist/`, containing `index.html` and `src/`.

## Connect GitHub for the first deployment

1. Open [AWS Amplify Console](https://console.aws.amazon.com/amplify/) and select **Create new app**.
2. Choose **GitHub** and authorize access to `tanawutmalirum29-ux/ant-project`.
3. Choose repository `tanawutmalirum29-ux/ant-project`, branch `main`, and continue.
4. Use the **Amazon Linux 2023** build image with **Node.js 20 or newer**. Repository root is the app root; do not select a subdirectory.
5. Review and select **Save and deploy**. The root `amplify.yml` supplies the build commands and artifact directory, overriding console-detected build settings.
6. When **BUILD**, **DEPLOY**, and **VERIFY** are complete, open the assigned `https://main.<app-id>.amplifyapp.com` URL.

For an existing Amplify app already connected to this repository and branch, pushing a commit to `main` normally triggers an automatic build. Otherwise, select the app/branch and **Redeploy this version**.

## Reproduce and verify the build locally

```bash
npm test
npm run build
```

The build must create:
```text
dist/
  index.html
  src/
    main.js
    styles.css
    core/
    render/
    ui/
    world/
```

The build script checks the entry points referenced by `index.html`. Only `index.html` and `src/` are published; tests, documentation, development tools, and node_modules are excluded. Add new static assets under `src/` (or update `tools/build.mjs` if you add a new top-level asset directory).

## Troubleshooting

- **BUILD failed / `npm test` failed:** Check the Amplify build log. The test gate intentionally blocks a broken deploy; fix the failing test before redeploying.
- **BUILD failed / `npm run build` failed:** Verify `index.html` exists at repository root and `src/main.js` and `src/styles.css` exist. Check Node.js 20+ and the output of the build script.
- **DEPLOY fails or page is blank:** Confirm the artifact `baseDirectory` is `dist`, not the repository root. Open developer tools and check that `/src/main.js` and `/src/styles.css` return 200 and JavaScript errors are absent.
- **Wrong HTML served for missing assets:** This game does not use client-side path routing; a catch-all SPA rewrite is unnecessary. Review custom rewrite rules if they hide missing files.
- **GitHub repository does not appear:** Review the permissions granted to the AWS Amplify GitHub app and allow access to this repository.

This configuration supports static single-player hosting. Future features requiring a backend, multiplayer synchronization, or a remote database will need separate services; `amplify.yml` does not create them.
