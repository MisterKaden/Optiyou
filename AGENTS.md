# Optiyou Agent Notes

- Treat `main` as production.
- Keep Cloudflare infrastructure in `wrangler.jsonc` and deployment automation in `.github/workflows/deploy.yml`.
- Run `npm run typecheck` and `npm run check` before pushing infrastructure or Worker changes.
- Use `/_health` and `/_version` to verify deployed behavior after changes.
- Keep public site edits in `public/` unless the edge behavior needs to change.

