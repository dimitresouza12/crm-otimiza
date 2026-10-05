import { readFile, writeFile } from 'node:fs/promises'

const [styles, app] = await Promise.all([
  readFile('dist/otimiza-crm.css', 'utf8'),
  readFile('dist/otimiza-crm.iife.js', 'utf8'),
])

const safeStyles = styles.replace(/[\t ]+$/gm, '')
const safeApp = app.replace(/[\t ]+$/gm, '').replaceAll('</script', '<\\/script')

await writeFile(
  'index.html',
  `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#2e2860" />
    <meta name="description" content="Otimiza AI CRM: leads, conversas, faturamento confirmado e origem dos resultados em um só lugar." />
    <meta property="og:title" content="Otimiza AI CRM — transforme conversas em resultados" />
    <meta property="og:description" content="Organize seus leads, acompanhe o faturamento confirmado e entenda a origem dos seus resultados." />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary" />
    <meta name="robots" content="index,follow" />
    <title>Otimiza AI CRM — transforme conversas em resultados</title>
    <style>${safeStyles}</style>
  </head>
  <body>
    <div id="root"></div>
    <script>${safeApp}</script>
  </body>
</html>`,
)
