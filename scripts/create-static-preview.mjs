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
    <meta name="theme-color" content="#152a35" />
    <title>Otimiza AI — CRM</title>
    <style>${safeStyles}</style>
  </head>
  <body>
    <div id="root"></div>
    <script>${safeApp}</script>
  </body>
</html>`,
)
