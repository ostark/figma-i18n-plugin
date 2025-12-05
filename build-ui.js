const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

async function buildUI() {
  // Bundle the UI TypeScript
  const result = await esbuild.build({
    entryPoints: ['src/ui.ts'],
    bundle: true,
    write: false,
    target: 'es2020',
    format: 'iife',
    minify: false,
  });

  const jsCode = result.outputFiles[0].text;

  // Read the HTML template
  const template = fs.readFileSync('src/ui-template.html', 'utf8');

  // Inject the JS into the template
  const html = template.replace('{{UI_SCRIPT}}', jsCode);

  // Ensure dist directory exists
  if (!fs.existsSync('dist')) {
    fs.mkdirSync('dist');
  }

  // Write the final HTML
  fs.writeFileSync('dist/ui.html', html);

  console.log('UI built successfully');
}

buildUI().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
