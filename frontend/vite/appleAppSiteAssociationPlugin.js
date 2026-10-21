export function appleAppSiteAssociationPlugin() {
  return {
    name: 'apple-app-site-association',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const rawUrl = req.url ? req.url.split('?')[0] : '';
        if (
          rawUrl === '/.well-known/apple-app-site-association' ||
          rawUrl === '/apple-app-site-association'
        ) {
          res.setHeader('Content-Type', 'application/json');
        }
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const rawUrl = req.url ? req.url.split('?')[0] : '';
        if (
          rawUrl === '/.well-known/apple-app-site-association' ||
          rawUrl === '/apple-app-site-association'
        ) {
          res.setHeader('Content-Type', 'application/json');
        }
        next();
      });
    },
  };
}
